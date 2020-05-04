import { dispatch as d3_dispatch } from 'd3-dispatch';
import { xml as d3_xml, json as d3_json } from 'd3-fetch';

import { coreGraph, coreTree } from '../core';
import { osmEntity, osmNode, osmWay } from '../osm';
import { utilRebind, utilStringQs, utilTiler } from '../util';


const GROUPID = 'bdf6c800b3ae453b9db239e03d7c1727';
const APIROOT = 'https://openstreetmap.maps.arcgis.com/sharing/rest/content';
const TILEZOOM = 16;
const tiler = utilTiler().zoomExtent([TILEZOOM, TILEZOOM]);
const dispatch = d3_dispatch('loadedData');

let _checkpoints = {};
let _datasets;
let _graph;
let _tree;
let _deferredWork = new Set();
let _off;

// For now _caches will contain a single structure like the fb_ai_features service has.
// But we will need each esri layer to have its own cache inside here eventually.
let _caches;


function abortRequest(controller) {
  controller.abort();
}

function cloneDeep(source) {
  return JSON.parse(JSON.stringify(source));
}


// API
function searchURL() {
  return `${APIROOT}/groups/${GROUPID}/search?num=20&start=1&sortField=title&sortOrder=asc&f=json`;
  // use to get
  // .results[]
  //   .extent
  //   .id
  //   .thumbnail
  //   .title
  //   .snippet
  //   .url (featureServer)
}
function itemURL(itemID) {
  return `${APIROOT}/items/${itemID}?f=json`;
  // use to get
  // .extent
  // .id
  // .thumbnail
  // .title
  // .snippet
  // .url  (featureServer)
}
function layerURL(featureServerURL) {
  return `${featureServerURL}/layers?f=json`;
  // should return single layer(?)
  // .layers[0]
  //   .copyrightText
  //   .fields
  //   .geometryType   "esriGeometryPoint" or "esriGeometryPolygon" ?
}

function tileURL(extent, taskExtent) {
  // const hash = utilStringQs(window.location.hash);

  // // fb_ml_road_url: if set, get road data from this url
  // const fb_ml_road_url = hash.fb_ml_road_url;
  // let result = (fb_ml_road_url ? fb_ml_road_url : APIROOT) + '&bbox=' + extent.toParam();
  // if (taskExtent) result += '&crop_bbox=' + taskExtent.toParam();

  // const custom_ml_road_tags = hash.fb_ml_road_tags;
  // if (custom_ml_road_tags) {
  //   custom_ml_road_tags.split(',').forEach(function (tag) {
  //     result += '&allow_tags[]=' + tag;
  //   });
  // }
  // return result;
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
    tags[attrs.k.value] = attrs.v.value;
  }

  return tags;
}


function getVisible(attrs) {
  return (!attrs.visible || attrs.visible.value !== 'false');
}


const parsers = {
  node: function nodeData(obj, uid) {
    const attrs = obj.attributes;
    return new osmNode({
      id: uid,
      visible: getVisible(attrs),
      loc: getLoc(attrs),
      tags: getTags(obj)
    });
  },

  way: function wayData(obj, uid) {
    const attrs = obj.attributes;
    return new osmWay({
      id: uid,
      visible: getVisible(attrs),
      tags: getTags(obj),
      nodes: getNodes(obj),
    });
  }
};


// we can request the data in JSON, GeoJSON, or PBF, so this will be different (not XML)
function parseXML(xml, cache, tile, callback, options) {
  options = Object.assign({ skipSeen: true }, options);
  if (!xml || !xml.childNodes) {
    return callback({ message: 'No XML', status: -1 });
  }

  const root = xml.childNodes[0];
  const children = root.childNodes;
  const handle = window.requestIdleCallback(() => {
    _deferredWork.delete(handle);
    let results = [];
    for (let i = 0; i < children.length; i++) {
      const result = parseChild(children[i]);
      if (result) results.push(result);
    }
    callback(null, results);
  });
  _deferredWork.add(handle);


  function parseChild(child) {
    const parser = parsers[child.nodeName];
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
      if (_graph.entities[origUid] || (cache.origIdTile[origUid] && cache.origIdTile[origUid] !== tile.id)) {
        return null;
      }
      cache.origIdTile[origUid] = tile.id;
    }

    const entity = parser(child, uid);
    entity.__fbid__ = child.attributes.id.value;
    entity.__origid__ = origUid;
    return entity;
  }
}


export default {

  init: function () {
    if (!_caches) this.reset();
    this.event = utilRebind(this, dispatch, 'on');
  },


  // save the current history state
  checkpoint: function (key) {
    _checkpoints[key] = { graph: _graph };
    return this;
  },


  reset: function (key) {
    Array.from(_deferredWork).forEach(handle => {
      window.cancelIdleCallback(handle);
      _deferredWork.delete(handle);
    });

    if (_caches && _caches.inflight) {
      Object.values(_caches.inflight).forEach(abortRequest);
    }

    if (key !== undefined && _checkpoints.hasOwnProperty(key)) {
      _graph = _checkpoints[key].graph;
    } else {
      _graph = coreGraph();
      _tree = coreTree(_graph);
      _caches = { inflight: {}, loaded: {}, seen: {}, origIdTile: {} };
    }

    return this;
  },


  graph: function ()  {
    return _graph;
  },


  intersects: function (extent) {
    if (!_caches) return [];
    return _tree.intersects(extent, _graph);
  },


  merge: function (entities) {
    _graph.rebase(entities, [_graph], false);
    _tree.rebase(entities, false);
  },


  cache: function (obj) {
    if (!arguments.length) {
      return { tile: cloneDeep(_caches) };
    }

    // access cache directly for testing
    if (obj === 'get') {
      return _caches;
    }

    _caches = obj;
  },


  toggle: function (val) {
    _off = !val;
    return this;
  },


  loadTiles: function (projection, taskExtent) {
    if (_off) return;

    const tiles = tiler.getTiles(projection);
    const cache = _caches;

    // abort inflight requests that are no longer needed
    Object.keys(cache.inflight).forEach(k => {
      const wanted = tiles.find(tile => tile.id === k);
      if (!wanted) {
        abortRequest(cache.inflight[k]);
        delete cache.inflight[k];
      }
    });

    tiles.forEach(tile => {
      if (cache.loaded[tile.id] || cache.inflight[tile.id]) return;

      const controller = new AbortController();
      const url = tileURL(tile.extent, taskExtent);

      d3_xml(url, { signal: controller.signal })
        .then(xml => {
          delete cache.inflight[tile.id];
          if (!xml) throw new Error('no xml');
          parseXML(xml, cache, tile, (err, results) => {
            if (err) throw new Error(err);
            _graph.rebase(results, [_graph], true);
            _tree.rebase(results, true);
            cache.loaded[tile.id] = true;
            dispatch.call('loadedData');
          });
        })
        .catch(() => { /* ignore */ });

      cache.inflight[tile.id] = controller;
    });
  },


  loadDatasets: () => {
    if (_datasets) return Promise.resolve(_datasets);
    return d3_json(searchURL())
      .then(json => _datasets = json.results)
      .catch(() => _datasets = []);
  }

};
