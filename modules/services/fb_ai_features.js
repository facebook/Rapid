import { dispatch as d3_dispatch } from 'd3-dispatch';
import { xml as d3_xml } from 'd3-fetch';
import { Projection, Tiler } from '@id-sdk/math';
import { utilStringQs } from '@id-sdk/util';

import { coreGraph, coreTree } from '../core';
import { osmEntity, osmNode, osmWay } from '../osm';
import { utilRebind } from '../util';


// constants
const APIROOT = 'https://mapwith.ai/maps/ml_roads';
const TILEZOOM = 16;
const tiler = new Tiler().zoomRange(TILEZOOM);
const dispatch = d3_dispatch('busy', 'idle', 'loadedData');

let _jobs = new Set();
let _datasets = {};
let _deferredAiFeaturesParsing = new Set();
let _off;


function abortRequest(controller) {
  controller.abort();
}

function beginJob(id) {
  if (_jobs.has(id)) return;
  _jobs.add(id);
  if (_jobs.size === 1) {
    dispatch.call('busy');
  }
}

function endJob(id) {
  if (!_jobs.has(id)) return;
  _jobs.delete(id);
  if (_jobs.size === 0) {
    dispatch.call('idle');
  }
}


function tileURL(dataset, extent, taskExtent) {
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

  if (taskExtent) qs.crop_bbox = taskExtent.toParam();

  // Note: we are not sure whether the `fb_ml_road_url` and `fb_ml_road_tags` query params are used anymore.
  const customUrlRoot = utilStringQs(window.location.hash).fb_ml_road_url;
  const customRoadTags = utilStringQs(window.location.hash).fb_ml_road_tags;

  const urlRoot = customUrlRoot || APIROOT;
  let url = urlRoot + '?' + fbmlQsString(qs, true);  // true = noencode

  if (customRoadTags) {
    customRoadTags.split(',').forEach(function (tag) {
      url += '&allow_tags[]=' + tag;
    });
  }

  return url;


  // This utilQsString does not sort the keys, because the fbml service needs them to be ordered a certain way.
  function fbmlQsString(obj, noencode) {
    // encode everything except special characters used in certain hash parameters:
    // "/" in map states, ":", ",", {" and "}" in background
    function softEncode(s) {
      return encodeURIComponent(s).replace(/(%2F|%3A|%2C|%7B|%7D)/g, decodeURIComponent);
    }

    return Object.keys(obj).map(key => { // NO SORT
      return encodeURIComponent(key) + '=' + (
        noencode ? softEncode(obj[key]) : encodeURIComponent(obj[key])
      );
    }).join('&');
  }

}


function getLoc(attrs) {
  const lon = attrs.lon && attrs.lon.value;
  const lat = attrs.lat && attrs.lat.value;
  return [parseFloat(lon), parseFloat(lat)];
}


function getNodes(obj) {
  const elems = obj.getElementsByTagName('nd');
  let nodes = new Array(elems.length);
  for (let i = 0, l = elems.length; i < l; i++) {
    nodes[i] = 'n' + elems[i].attributes.ref.value;
  }
  return nodes;
}


function getTags(obj) {
  const elems = obj.getElementsByTagName('tag');
  let tags = {};
  for (let i = 0, l = elems.length; i < l; i++) {
    const attrs = elems[i].attributes;
    const k = (attrs.k.value || '').trim();
    const v = (attrs.v.value || '').trim();
    if (k && v) {
      tags[k] = v;
    }
  }

  return tags;
}


function getVisible(attrs) {
  return (!attrs.visible || attrs.visible.value !== 'false');
}


const parsers = {
  node: (obj, uid) => {
    const attrs = obj.attributes;
    return new osmNode({
      id: uid,
      visible: getVisible(attrs),
      loc: getLoc(attrs),
      tags: getTags(obj)
    });
  },

  way: (obj, uid) => {
    const attrs = obj.attributes;
    return new osmWay({
      id: uid,
      visible: getVisible(attrs),
      tags: getTags(obj),
      nodes: getNodes(obj),
    });
  }
};


function parseXML(dataset, xml, tile, callback, options) {
  options = Object.assign({ skipSeen: true }, options);
  if (!xml || !xml.childNodes) {
    return callback({ message: 'No XML', status: -1 });
  }

  const graph = dataset.graph;
  const cache = dataset.cache;

  const root = xml.childNodes[0];
  const children = root.childNodes;
  const handle = window.requestIdleCallback(() => {
    _deferredAiFeaturesParsing.delete(handle);
    let results = [];
    for (let i = 0; i < children.length; i++) {
      const result = parseChild(children[i]);
      if (result) results.push(result);
    }
    callback(null, results);
  });
  _deferredAiFeaturesParsing.add(handle);


  function parseChild(child) {
    const parser = parsers[child.nodeName];
    if (!parser) return null;

    const uid = osmEntity.id.fromOSM(child.nodeName, child.attributes.id.value);
    if (options.skipSeen) {
      if (cache.seen[uid]) return null;        // avoid reparsing a "seen" entity
      if (cache.origIdTile[uid]) return null;  // avoid double-parsing a split way
      cache.seen[uid] = true;
    }

    // Handle non-deterministic way splitting from Roads Service. Splits
    // are consistent within a single request.
    let origUid;
    if (child.attributes.orig_id) {
      origUid = osmEntity.id.fromOSM(child.nodeName, child.attributes.orig_id.value);
      if (graph.entities[origUid] || (cache.origIdTile[origUid] && cache.origIdTile[origUid] !== tile.id)) {
        return null;
      }
      cache.origIdTile[origUid] = tile.id;
    }

    const entity = parser(child, uid);
    const meta = {
      __fbid__: child.attributes.id.value,
      __origid__: origUid,
      __service__: 'fbml',
      __datasetid__: dataset.id
    };
    return Object.assign(entity, meta);
  }
}


export default {

  init: function() {
    this.event = utilRebind(this, dispatch, 'on');

    // allocate a special dataset for the rapid intro graph.
    const datasetID = 'rapid_intro_graph';
    const graph = coreGraph();
    const tree = coreTree(graph);
    const cache = { inflight: {}, loaded: {}, seen: {}, origIdTile: {} };
    const ds = { id: datasetID, graph: graph, tree: tree, cache: cache };
    _datasets[datasetID] = ds;
  },

  reset: function() {
    Array.from(_deferredAiFeaturesParsing).forEach(handle => {
      window.cancelIdleCallback(handle);
      _deferredAiFeaturesParsing.delete(handle);
    });

    Object.values(_datasets).forEach(ds => {
      if (ds.cache.inflight) {
        Object.values(ds.cache.inflight).forEach(abortRequest);
      }
      ds.graph = coreGraph();
      ds.tree = coreTree(ds.graph);
      ds.cache = { inflight: {}, loaded: {}, seen: {}, origIdTile: {} };
    });

    return this;
  },


  graph: function (datasetID) {
    const ds = _datasets[datasetID];
    return ds && ds.graph;
  },


  intersects: function (datasetID, extent) {
    const ds = _datasets[datasetID];
    if (!ds || !ds.tree || !ds.graph) return [];
    return ds.tree.intersects(extent, ds.graph);
  },


  merge: function (datasetID, entities) {
    const ds = _datasets[datasetID];
    if (!ds || !ds.tree || !ds.graph) return;
    ds.graph.rebase(entities, [ds.graph], false);
    ds.tree.rebase(entities, false);
  },


  cache: function (datasetID, obj) {
    const ds = _datasets[datasetID];
    if (!ds || !ds.cache) return;

    function cloneDeep(source) {
      return JSON.parse(JSON.stringify(source));
    }

    if (!arguments.length) {
      return { tile: cloneDeep(ds.cache) };
    }

    // access cache directly for testing
    if (obj === 'get') {
      return ds.cache;
    }

    ds.cache = obj;
  },


  toggle: function (val) {
    _off = !val;
    return this;
  },


  loadTiles: function (datasetID, projection, taskExtent) {
    if (_off) return;

    let ds = _datasets[datasetID];
    let graph, tree, cache;
    if (ds) {
      graph = ds.graph;
      tree = ds.tree;
      cache = ds.cache;
    } else {
      // as tile requests arrive, setup the resources needed to hold the results
      graph = coreGraph();
      tree = coreTree(graph);
      cache = { inflight: {}, loaded: {}, seen: {}, origIdTile: {} };
      ds = { id: datasetID, graph: graph, tree: tree, cache: cache };
      _datasets[datasetID] = ds;
    }

    const proj = new Projection().transform(projection.transform()).dimensions(projection.clipExtent());
    const tiles = tiler.getTiles(proj).tiles;

    // abort inflight requests that are no longer needed
    Object.keys(cache.inflight).forEach(k => {
      const wanted = tiles.find(tile => k === tile.id);
      if (!wanted) {
        abortRequest(cache.inflight[k]);
        delete cache.inflight[k];
      }
    });

    tiles.forEach(tile => {
      if (cache.loaded[tile.id] || cache.inflight[tile.id]) return;

      const controller = new AbortController();
      const url = tileURL(ds, tile.wgs84Extent, taskExtent);
      beginJob(url);

      d3_xml(url, { signal: controller.signal })
        .then(dom => {
          delete cache.inflight[tile.id];
          if (!dom) throw new Error('no dom');

          parseXML(ds, dom, tile, (err, results) => {
            if (err) throw new Error(err);
            graph.rebase(results, [graph], true);
            tree.rebase(results, true);
            cache.loaded[tile.id] = true;
            dispatch.call('loadedData');
          });
        })
        .catch(() => { /* ignore */ })
        .finally(() => endJob(url));

      cache.inflight[tile.id] = controller;
    });
  }
};
