import { dispatch as d3_dispatch } from 'd3-dispatch';
import { xml as d3_xml } from 'd3-fetch';
import { Tiler } from '@rapid-sdk/math';

import { Graph, Tree } from '../core';
import { osmEntity, osmNode, osmWay } from '../osm';
import { utilRebind } from '../util';


// constants
const APIROOT = 'https://mapwith.ai/maps/ml_roads';
const TILEZOOM = 16;


/**
 * `ServiceMapWithAI`
 */
export class ServiceMapWithAI {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    this.id = 'mapwithai';
    this.context = context;

    this._tiler = new Tiler().zoomRange(TILEZOOM);
    this._datasets = {};
    this._deferred = new Set();
    this._off = false;

    // Ensure methods used as callbacks always have `this` bound correctly.
    this._parseNode = this._parseNode.bind(this);
    this._parseWay = this._parseWay.bind(this);

    this._dispatch = d3_dispatch('loadedData');
    utilRebind(this, this._dispatch, 'on');
  }


  /**
   * init
   * Called one time after all core objects have been instantiated.
   */
  init() {
    this.reset();

    // allocate a special dataset for the rapid intro graph.
    const datasetID = 'rapid_intro_graph';
    const graph = new Graph();
    const tree = new Tree(graph);
    const cache = { inflight: {}, loaded: {}, seen: {}, origIdTile: {}, firstNodeIDs: new Set() };
    const ds = { id: datasetID, graph: graph, tree: tree, cache: cache };
    this._datasets[datasetID] = ds;
  }


  /**
   * reset
   * Called after completing an edit session to reset any internal state
   */
  reset() {
    for (const handle of this._deferred) {
      window.cancelIdleCallback(handle);
      this._deferred.delete(handle);
    }

    for (const ds of Object.values(this._datasets)) {
      if (ds.cache.inflight) {
        Object.values(ds.cache.inflight).forEach(controller => this._abortRequest(controller));
      }
      ds.graph = new Graph();
      ds.tree = new Tree(ds.graph);
      ds.cache = { inflight: {}, loaded: {}, seen: {}, origIdTile: {}, firstNodeIDs: new Set() };
    }
  }


  graph(datasetID) {
    const ds = this._datasets[datasetID];
    return ds?.graph;
  }


  intersects(datasetID, extent) {
    const ds = this._datasets[datasetID];
    if (!ds || !ds.tree || !ds.graph) return [];
    return ds.tree.intersects(extent, ds.graph);
  }


  merge(datasetID, entities) {
    const ds = this._datasets[datasetID];
    if (!ds || !ds.tree || !ds.graph) return;
    ds.graph.rebase(entities, [ds.graph], false);
    ds.tree.rebase(entities, false);
  }


  toggle(val) {
    this._off = !val;
  }


  loadTiles(datasetID, projection, taskExtent) {
    if (this._off) return;

    let ds = this._datasets[datasetID];
    let graph, tree, cache;
    if (ds) {
      graph = ds.graph;
      tree = ds.tree;
      cache = ds.cache;
    } else {
      // as tile requests arrive, setup the resources needed to hold the results
      graph = new Graph();
      tree = new Tree(graph);
      cache = { inflight: {}, loaded: {}, seen: {}, origIdTile: {}, firstNodeIDs: new Set() };
      ds = { id: datasetID, graph: graph, tree: tree, cache: cache };
      this._datasets[datasetID] = ds;
    }

    const locationSystem = this.context.locationSystem();
    const tiles = this._tiler.getTiles(projection).tiles;

    // abort inflight requests that are no longer needed
    for (const k of Object.keys(cache.inflight)) {
      const wanted = tiles.find(tile => tile.id === k);
      if (!wanted) {
        this._abortRequest(cache.inflight[k]);
        delete cache.inflight[k];
      }
    }

    for (const tile of tiles) {
      if (cache.loaded[tile.id] || cache.inflight[tile.id]) continue;

      // exit if this tile covers a blocked region (all corners are blocked)
      const corners = tile.wgs84Extent.polygon().slice(0, 4);
      const tileBlocked = corners.every(loc => locationSystem.blocksAt(loc).length);
      if (tileBlocked) {
        cache.loaded[tile.id] = true;  // don't try again
        continue;
      }

      const controller = new AbortController();
      d3_xml(this._tileURL(ds, tile.wgs84Extent, taskExtent), { signal: controller.signal })
        .then(xml => {
          delete cache.inflight[tile.id];
          if (!xml) return;
          this._parseXML(ds, xml, tile, (err, result) => {
            if (err) return;
            graph.rebase(result, [graph], true);
            tree.rebase(result, true);
            cache.loaded[tile.id] = true;
            this._dispatch.call('loadedData');
          });
        })
        .catch(e => {
          if (e.name === 'AbortError') return;
          console.error(e);  // eslint-disable-line
        });

      cache.inflight[tile.id] = controller;
    }
  }


  _abortRequest(controller) {
    controller.abort();
  }


  _tileURL(dataset, extent, taskExtent) {
    // Conflated datasets have a different ID, so they get stored in their own graph/tree
    const isConflated = /-conflated$/.test(dataset.id);
    const datasetID = dataset.id.replace('-conflated', '');

    let qs = {
      conflate_with_osm: isConflated,
      theme: 'ml_road_vector',
      collaborator: 'fbid',
      token: 'ASZUVdYpCkd3M6ZrzjXdQzHulqRMnxdlkeBJWEKOeTUoY_Gwm9fuEd2YObLrClgDB_xfavizBsh0oDfTWTF7Zb4C',
      hash: 'ASYM8LPNy8k1XoJiI7A'
    };

    if (datasetID === 'fbRoads') {
      qs.result_type = 'road_vector_xml';

    } else if (datasetID === 'msBuildings') {
      qs.result_type = 'road_building_vector_xml';
      qs.building_source = 'microsoft';

    } else {
      qs.result_type = 'osm_xml';
      qs.sources = `esri_building.${datasetID}`;
    }

    qs.bbox = extent.toParam();

    if (taskExtent) {
      qs.crop_bbox = taskExtent.toParam();
    }

    const url = APIROOT + '?' + mapwithaiQsString(qs, true);  // true = noencode
    return url;


    // This utilQsString does not sort the keys, because the MapWithAI service needs them to be ordered a certain way.
    function mapwithaiQsString(obj, noencode) {
      // encode everything except special characters used in certain hash parameters:
      // "/" in map states, ":", ",", {" and "}" in background
      function softEncode(s) {
        return encodeURIComponent(s).replace(/(%2F|%3A|%2C|%7B|%7D)/g, decodeURIComponent);
      }

      return Object.keys(obj).map(key => {  // NO SORT
        return encodeURIComponent(key) + '=' + (
          noencode ? softEncode(obj[key]) : encodeURIComponent(obj[key]));
      }).join('&');
    }
  }


  _getLoc(attrs) {
    const lon = attrs.lon?.value;
    const lat = attrs.lat?.value;
    return [ parseFloat(lon), parseFloat(lat) ];
  }


  _getNodes(obj) {
    const elems = Array.from(obj.getElementsByTagName('nd'));
    return elems.map(elem => 'n' + elem.attributes.ref.value);
  }


  _getTags(obj) {
    const elems = Array.from(obj.getElementsByTagName('tag'));
    let tags = {};
    for (const elem of elems) {
      const attrs = elem.attributes;
      const k = (attrs.k.value ?? '').trim();
      const v = (attrs.v.value ?? '').trim();
      if (k && v) {
        tags[k] = v;
      }
    }
    return tags;
  }


  _getVisible(attrs) {
    return (!attrs.visible || attrs.visible.value !== 'false');
  }


  _parseNode(obj, uid) {
    const attrs = obj.attributes;
    return new osmNode({
      id: uid,
      visible: this._getVisible(attrs),
      loc: this._getLoc(attrs),
      tags: this._getTags(obj)
    });
  }

  _parseWay(obj, uid) {
    const attrs = obj.attributes;
    return new osmWay({
      id: uid,
      visible: this._getVisible(attrs),
      tags: this._getTags(obj),
      nodes: this._getNodes(obj),
    });
  }


  _parseXML(dataset, xml, tile, callback, options) {
    options = Object.assign({ skipSeen: true }, options);
    if (!xml || !xml.childNodes) {
      return callback({ message: 'No XML', status: -1 });
    }

    const root = xml.childNodes[0];
    const children = root.childNodes;
    const handle = window.requestIdleCallback(() => {
      this._deferred.delete(handle);
      let results = [];
      for (const child of children) {
        const result = this._parseChild(dataset, tile, child, options);
        if (result) results.push(result);
      }
      callback(null, results);
    });

    this._deferred.add(handle);
  }


  _parseChild(dataset, tile, child, options) {
    const graph = dataset.graph;
    const cache = dataset.cache;

    let parser;
    if (child.nodeName === 'node') {
      parser = this._parseNode;
    } else if (child.nodeName === 'way') {
      parser = this._parseWay;
    }
    if (!parser) return null;

    const uid = osmEntity.id.fromOSM(child.nodeName, child.attributes.id.value);
    if (options.skipSeen) {
      if (cache.seen[uid]) return null;  // avoid reparsing a "seen" entity
      if (cache.origIdTile[uid]) return null;  // avoid double-parsing a split way
      cache.seen[uid] = true;
    }

    // Handle non-deterministic way splitting from Roads Service. Splits
    // are consistent within a single request.
    let origUid;
    if (child.attributes.orig_id) {
      origUid = osmEntity.id.fromOSM(child.nodeName, child.attributes.orig_id.value);
      // skip if seen already
      if (graph.hasEntity(origUid) || (cache.origIdTile[origUid] && cache.origIdTile[origUid] !== tile.id)) {
        return null;
      }
      cache.origIdTile[origUid] = tile.id;
    }

    let entity = parser(child, uid);

    // Ignore duplicate buildings in the MS Buildings dataset.
    // They will appear with unique entity id, but with the same nodelist.
    // See https://github.com/facebook/Rapid/issues/873
    if (/^msBuildings/.test(dataset.id) && entity.type === 'way') {
      const firstNodeID = entity.nodes[0];
      if (cache.firstNodeIDs.has(firstNodeID)) return null;
      cache.firstNodeIDs.add(firstNodeID);
    }

    const metadata = {
      __fbid__: child.attributes.id.value,
      __origid__: origUid,
      __service__: 'mapwithai',
      __datasetid__: dataset.id
    };
    return Object.assign(entity, metadata);
  }

}
