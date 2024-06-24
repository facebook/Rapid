import { Tiler } from '@rapid-sdk/math';
import { utilStringQs } from '@rapid-sdk/util';

import { AbstractSystem } from '../core/AbstractSystem.js';
import { Graph, Tree } from '../core/lib/index.js';
import { osmEntity, osmNode, osmWay } from '../osm/index.js';
import { utilFetchResponse } from '../util/index.js';


const APIROOT = 'https://mapwith.ai/maps/ml_roads';
const TILEZOOM = 16;


/**
 * `MapWithAIService`
 *
 * Events available:
 *   `loadedData`
 */
export class MapWithAIService extends AbstractSystem {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'mapwithai';

    this._tiler = new Tiler().zoomRange(TILEZOOM);
    this._datasets = {};
    this._deferred = new Set();

    // Ensure methods used as callbacks always have `this` bound correctly.
    this._parseNode = this._parseNode.bind(this);
    this._parseWay = this._parseWay.bind(this);
  }


  /**
   * initAsync
   * Called after all core objects have been constructed.
   * @return {Promise} Promise resolved when this component has completed initialization
   */
  initAsync() {
    return this.resetAsync()
      .then(() => {
        // allocate a special dataset for the rapid intro graph.
        const datasetID = 'rapid_intro_graph';
        const graph = new Graph();
        const tree = new Tree(graph);
        const cache = {
          inflight: {},
          loaded: new Set(),           // Set(tileID)
          seen: new Set(),             // Set(entityID)
          seenFirstNodeID: new Set(),  // Set(entityID)
          splitWays: new Map()         // Map(originalID -> Set(Entity))
        };
        const ds = {
          id: datasetID,
          graph: graph,
          tree: tree,
          cache: cache,
          lastv: null
        };
        this._datasets[datasetID] = ds;
      });
  }


  /**
   * startAsync
   * Called after all core objects have been initialized.
   * @return {Promise} Promise resolved when this component has completed startup
   */
  startAsync() {
    this._started = true;
    return Promise.resolve();
  }


  /**
   * resetAsync
   * Called after completing an edit session to reset any internal state
   * @return {Promise} Promise resolved when this component has completed resetting
   */
  resetAsync() {
    for (const handle of this._deferred) {
      window.cancelIdleCallback(handle);
      this._deferred.delete(handle);
    }

    for (const ds of Object.values(this._datasets)) {
      if (ds.cache.inflight) {
        Object.values(ds.cache.inflight).forEach(controller => this._abortRequest(controller));
      }
      ds.lastv = null;
      ds.graph = new Graph();
      ds.tree = new Tree(ds.graph);
      ds.cache = {
        inflight: {},
        loaded: new Set(),           // Set(tileID)
        seen: new Set(),             // Set(entityID)
        seenFirstNodeID: new Set(),  // Set(entityID)
        splitWays: new Map()         // Map(originalID -> Set(Entity))
      };
    }
    return Promise.resolve();
  }


  /**
   * getData
   * Get already loaded data that appears in the current map view
   * @param   {string}  datasetID - datasetID to get data for
   * @return  {Array}   Array of data (OSM Entities)
   */
  getData(datasetID) {
    const ds = this._datasets[datasetID];
    if (!ds || !ds.tree || !ds.graph) return [];

    const extent = this.context.viewport.visibleExtent();
    return ds.tree.intersects(extent, ds.graph);
  }


  /**
   * loadTiles
   * Schedule any data requests needed to cover the current map view
   * @param   {string}  datasetID - datasetID to load tiles for
   */
  loadTiles(datasetID) {
    if (this._paused) return;

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
      cache = {
        inflight: {},
        loaded: new Set(),           // Set(tileID)
        seen: new Set(),             // Set(entityID)
        seenFirstNodeID: new Set(),  // Set(entityID)
        splitWays: new Map()         // Map(originalID -> Set(Entity))
      };
      ds = {
        id: datasetID,
        graph: graph,
        tree: tree,
        cache: cache,
        lastv: null
      };
      this._datasets[datasetID] = ds;
    }

    const locations = this.context.systems.locations;

    const viewport = this.context.viewport;
    if (ds.lastv === viewport.v) return;  // exit early if the view is unchanged
    ds.lastv = viewport.v;

    // Determine the tiles needed to cover the view..
    const tiles = this._tiler.getTiles(viewport).tiles;

    // Abort inflight requests that are no longer needed..
    for (const k of Object.keys(cache.inflight)) {
      const wanted = tiles.find(tile => tile.id === k);
      if (!wanted) {
        this._abortRequest(cache.inflight[k]);
        delete cache.inflight[k];
      }
    }

    for (const tile of tiles) {
      if (cache.loaded.has(tile.id) || cache.inflight[tile.id]) continue;

      // Exit if this tile covers a blocked region (all corners are blocked)
      const corners = tile.wgs84Extent.polygon().slice(0, 4);
      const tileBlocked = corners.every(loc => locations.blocksAt(loc).length);
      if (tileBlocked) {
        cache.loaded.add(tile.id);  // don't try again
        continue;
      }

      const resource = this._tileURL(ds, tile.wgs84Extent);
      const controller = new AbortController();
      fetch(resource, { signal: controller.signal })
        .then(utilFetchResponse)
        .then(xml => {
          delete cache.inflight[tile.id];
          if (!xml) return;
          this._parseXML(ds, xml, tile, (err, result) => {
            if (err) return;
            graph.rebase(result, [graph], true);   // true = force replace entities
            tree.rebase(result, true);
            cache.loaded.add(tile.id);

            this.context.deferredRedraw();
            this.emit('loadedData');
          });
        })
        .catch(e => {
          if (e.name === 'AbortError') return;
          console.error(e);  // eslint-disable-line
        });

      cache.inflight[tile.id] = controller;
    }
  }


  graph(datasetID) {
    const ds = this._datasets[datasetID];
    return ds?.graph;
  }


  /* this is called to merge in the rapid_intro_graph */
  merge(datasetID, entities) {
    const ds = this._datasets[datasetID];
    if (!ds || !ds.tree || !ds.graph) return;
    ds.graph.rebase(entities, [ds.graph], false);
    ds.tree.rebase(entities, false);
  }


  _abortRequest(controller) {
    controller.abort();
  }


  _tileURL(dataset, extent) {
    // Conflated datasets have a different ID, so they get stored in their own graph/tree
    const isConflated = /-conflated$/.test(dataset.id);
    const datasetID = dataset.id.replace('-conflated', '');

    const qs = {
      conflate_with_osm: isConflated,
      theme: 'ml_road_vector',
      collaborator: 'fbid',
      token: 'ASZUVdYpCkd3M6ZrzjXdQzHulqRMnxdlkeBJWEKOeTUoY_Gwm9fuEd2YObLrClgDB_xfavizBsh0oDfTWTF7Zb4C',
      hash: 'ASYM8LPNy8k1XoJiI7A'
    };

    if (datasetID === 'fbRoads') {
      qs.result_type = 'road_vector_xml';

    } else if (datasetID === 'metaFootways') {
      qs.result_type = 'extended_osc';
      qs.sources = 'ML2OSM_META_FOOTWAYS';
    } else if (datasetID === 'msBuildings') {
      qs.result_type = 'road_building_vector_xml';
      qs.building_source = 'microsoft';
    } else {
      qs.result_type = 'osm_xml';
      qs.sources = `esri_building.${datasetID}`;
    }

    qs.bbox = extent.toParam();

    const taskExtent = this.context.systems.rapid.taskExtent;
    if (taskExtent) {
      qs.crop_bbox = taskExtent.toParam();
    }

    const customUrlRoot = utilStringQs(window.location.hash).fb_ml_road_url;

    const urlRoot = customUrlRoot || APIROOT;
    const url = urlRoot + '?' + mapwithaiQsString(qs, true);  // true = noencode
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


  _getNodes(xml) {
    const elems = Array.from(xml.getElementsByTagName('nd'));
    return elems.map(elem => 'n' + elem.attributes.ref.value);
  }


  _getTags(xml) {
    const elems = Array.from(xml.getElementsByTagName('tag'));
    const tags = {};
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


  _parseXML(dataset, xml, tile, callback) {
    if (!xml || !xml.childNodes) {
      return callback({ message: 'No XML', status: -1 });
    }

    const root = xml.childNodes[0];
    const children = root.childNodes;
    const handle = window.requestIdleCallback(() => {
      this._deferred.delete(handle);
      let results = [];
      for (const child of children) {
        const result = this._parseEntity(dataset, tile, child);
        if (result) results.push(result);
      }

      results = results.concat(this._connectSplitWays(dataset));
      callback(null, results);
    });

    this._deferred.add(handle);
  }


  _parseEntity(dataset, tile, element) {
    const cache = dataset.cache;

    const type = element.nodeName;
    if (!['node', 'way'].includes(type)) return null;

    let entityID, entity;
    entityID = osmEntity.id.fromOSM(type, element.attributes.id.value);

    if (type === 'node') {
      if (cache.seen.has(entityID)) {   // ignore nodes we've seen already
        return null;
      } else {
        entity = this._parseNode(element, entityID);
        cache.seen.add(entityID);
      }

    } else if (type === 'way') {

      //   The MapWithAI service uses a non-deterministic method for splitting ways into segments.
      //   This means that each request we issue may split the way differently, see Rapid#1288
      //   This is extra challenging because the user may accept some roads, store their edits to
      //   localStorage, refresh Rapid and restore their edits, and we'd expect their restored
      //   edits should still work with whatever ways we receive from the server.
      //   We work around this issue in `_connectSplitWays`

      // If `orig_id` is present, it means that the way was split
      // by the server, and we will need to reassemble the pieces.
      if (element.attributes.orig_id) {
        const origEntityID = osmEntity.id.fromOSM(type, element.attributes.orig_id.value);
        entity = this._parseWay(element, entityID);
        let ways = cache.splitWays.get(origEntityID);
        if (!ways) {
          ways = new Set();
          cache.splitWays.set(origEntityID, ways);
        }
        ways.add(entity);
        return null;   // bail out, `_connectSplitWays` will handle this instead

      } else {  // a normal unsplit way
        if (cache.seen.has(entityID)) {   // ignore ways we've seen already
          return null;
        } else {
          entity = this._parseWay(element, entityID);
          cache.seen.add(entityID);

          // Ignore duplicate buildings in the MS Buildings dataset.
          // They will appear with unique entity id, but with the same nodelist, see Rapid#873
          if (/^msBuildings/.test(dataset.id)) {
            const firstNodeID = entity.nodes[0];
            if (cache.seenFirstNodeID.has(firstNodeID)) {
              return null;
            }
            cache.seenFirstNodeID.add(firstNodeID);
          }

        }
      }

    } else {
      return null;
    }

    const metadata = {
      __fbid__: entityID,
      __service__: 'mapwithai',
      __datasetid__: dataset.id
    };

    return Object.assign(entity, metadata);
  }


  /**
   * _connectSplitWays
   * Call this sometimes to reassemble ways that were split by the server.
   */
  _connectSplitWays(dataset) {
    const graph = dataset.graph;
    const cache = dataset.cache;
    const results = [];

    for (const [origEntityID, ways] of cache.splitWays) {
      let survivor = graph.hasEntity(origEntityID);   // if we've done this before, the graph will have it

      // Check each way that shares this `origEntityID`.
      // Pick one to be the "survivor" (it doesn't matter which one).
      // Merge the nodes into the survivor (this will bump internal version `v`, so it gets redrawn)
      //
      // some implementation notes:
      // 1. `actionJoin` is similar to this, but does more than we need and uses `osmJoinWays`,
      // 2. `osmJoinWays` could almost do this, but it only can join head-tail, it can't
      //  deal with situations where ways partially overlap or reverse, which we get from this server.
      //  see examples below

      for (const candidate of ways) {
        if (!survivor || !survivor.nodes.length) {   // first time, just pick first way we see.
          survivor = candidate.update({ id: origEntityID });  // but use the original (stable) id
          ways.delete(candidate);
          continue;
        }

        // We will attempt to merge the `candidate.nodes` into the `survivor.nodes` somewhere.
        // Here are some situations we account for (candidate can be forward or reverse):
        // survivor.nodes = [C, D, E, F, G, H, J, K]
        // candidate.nodes = [G, F, E, D], indexes = [4, 3, 2, 1]      (candidate aleady contained)
        // candidate.nodes = [A, B, C, D], indexes = [-1, -1, 0, 1]    (prepend at beginning)
        // candidate.nodes = [J, I, H, G], indexes = [6, -1, 5, 4]     (splice into middle)
        // candidate.nodes = [M, L, K, J], indexes = [-1, -1, 7, 6]    (append at end)
        // candidate.nodes = [N, O, P, Q], indexes = [-1, -1, -1, -1]  (discontinuity)
        const indexes = [];
        for (const nodeID of candidate.nodes) {
         indexes.push(survivor.nodes.indexOf(nodeID));
        }

        if (indexes.every(ix => ix !== -1)) {  // candidate already contained in survivor
          ways.delete(candidate);              // remove candidate
          continue;

        } else if (indexes.every(ix => ix === -1)) {  // discontinuity, keep candidate around
          continue;                                   // in case we load more map and can connect it
        }

        // We consider the survivor to be going in the forward direction.
        // We want to make sure the candidate also matches this direction.
        // To determine direction - do the matched (not `-1`) indexes go up or down?
        let isReverse = false;
        let onlyOneIndex = false;  // if only one matched index, we expect it at start or end
        let prev;
        for (const curr of indexes) {
          if (curr === -1) continue;   // ignore these

          if (prev === undefined) {  // found one
            onlyOneIndex = true;
            prev = curr;
          } else {    // found two, compare them
            onlyOneIndex = false;
            isReverse = curr < prev;
            break;
          }
        }

        if (onlyOneIndex) {   // new nodes (-1's) should go before the beginning or after the end
          if (indexes.at(0) === 0)  isReverse = true;   // indexes look like [ 0, -1, -1, -1 ]   move -1's to beginning
          if (indexes.at(-1) !== 0) isReverse = true;   // indexes look like [ -1, -1, -1, N ]   move -1's to end
        }

        if (isReverse) {
          candidate.nodes.reverse();  // ok to reverse it, candidate isn't an actual way in the graph
          indexes.reverse();
        }

        // Take nodes from either survivor or candidate
        const nodeIDs = [];
        let s = 0;  // s = survivor index

        for (let c = 0; c < indexes.length; c++) {   // c = candidate index
          const i = indexes[c];
          if (i === -1) {
            nodeIDs.push(candidate.nodes[c]);  // take next candidate
          } else {
            while (s <= i) {
              nodeIDs.push(survivor.nodes[s]);   // take survivors up to i
              s++;
            }
          }
        }
        while (s < survivor.nodes.length) {   // take any remaining survivors
          nodeIDs.push(survivor.nodes[s]);
          s++;
        }

        ways.delete(candidate);    // remove candidate
        survivor = survivor.update({ nodes: nodeIDs });   // note, update bumps 'v' version automatically
      }


      // Include the survivor entity in the result.
      // (calling code will merge it into the graph).
      if (survivor) {
        const metadata = {
          __fbid__: survivor.id,
          __service__: 'mapwithai',
          __datasetid__: dataset.id
        };
        results.push(Object.assign(survivor, metadata));
      }

    }

    return results;
  }


}
