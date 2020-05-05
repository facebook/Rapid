import { dispatch as d3_dispatch } from 'd3-dispatch';
import { json as d3_json } from 'd3-fetch';

import { coreGraph, coreTree } from '../core';
import { osmEntity, osmNode, osmRelation, osmWay } from '../osm';
import { utilRebind, utilStringQs, utilTiler } from '../util';


const GROUPID = 'bdf6c800b3ae453b9db239e03d7c1727';
const APIROOT = 'https://openstreetmap.maps.arcgis.com/sharing/rest/content';
const TILEZOOM = 16;
const tiler = utilTiler().zoomExtent([TILEZOOM, TILEZOOM]);
const dispatch = d3_dispatch('loadedData');

let _checkpoints = {};
let _datasets = {};
let _caches = {};
let _graph;
let _tree;
let _off;


function abortRequest(controller) {
  controller.abort();
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

function layerURL(featureServerURL) {
  return `${featureServerURL}/layers?f=json`;
  // should return single layer(?)
  // .layers[0]
  //   .copyrightText
  //   .fields
  //   .geometryType   "esriGeometryPoint" or "esriGeometryPolygon" ?
}

function tileURL(dataset, extent) {
  return `${dataset.url}/0/query?f=geojson&outfields=*&outSR=4326&geometryType=esriGeometryEnvelope&geometry=` + extent.toParam();
  // note: for now, layer is always 0
}


// function getLoc(attrs) {
//   const lon = attrs.lon && attrs.lon.value;
//   const lat = attrs.lat && attrs.lat.value;
//   return [parseFloat(lon), parseFloat(lat)];
// }


// function getNodes(obj) {
//   const elems = obj.getElementsByTagName('nd');
//   let nodes = new Array(elems.length);
//   for (let i = 0, l = elems.length; i < l; i++) {
//     nodes[i] = 'n' + elems[i].attributes.ref.value;
//   }
//   return nodes;
// }


// function getTags(obj) {
//   const elems = obj.getElementsByTagName('tag');
//   let tags = {};
//   for (let i = 0, l = elems.length; i < l; i++) {
//     const attrs = elems[i].attributes;
//     tags[attrs.k.value] = attrs.v.value;
//   }

//   return tags;
// }


// const parsers = {
//   node: function nodeData(obj, uid) {
//     const attrs = obj.attributes;
//     return new osmNode({
//       id: uid,
//       visible: true,
//       loc: getLoc(attrs),
//       tags: getTags(obj)
//     });
//   },

//   way: function wayData(obj, uid) {
//     const attrs = obj.attributes;
//     return new osmWay({
//       id: uid,
//       visible: true,
//       tags: getTags(obj),
//       nodes: getNodes(obj),
//     });
//   }
// };


// we can request the data in JSON, GeoJSON, or PBF, so this will be different (not XML)
function parseTile(dataset, tile, geojson, callback, options) {
  if (!geojson) {
    return callback({ message: 'No GeoJSON', status: -1 });
  }

// console.log(`${tile.id}: features ` + geojson.features.length);
  let results = [];
  (geojson.features || []).forEach(f => {
    let entities = parseFeature(f);
    if (entities) results.push.apply(results, entities);
  });

  callback(null, results);


  function parseTags(props) {
    let tags = {};
    Object.keys(props).forEach(key => {
      const k = dataset.layer.tagmap[key];
      const v = props[key];
      if (k && v) {
        tags[k] = v;
      }
    });
    return tags;
  }

  function parseFeature(feature) {
    const geom = feature.geometry;
    const props = feature.properties;
    if (!geom || !props) return null;

    let entities = [];
    let nodemap = new Map();

    // Point:  make a node
    if (geom.type === 'Point') {
      return [ new osmNode({ loc: geom.coordinates, tags: parseTags(props) }) ];

    // LineString:  make nodes + a way
    } else if (geom.type === 'LineString') {
      // make nodes
      let nodelist = [];
      geom.coordinates.forEach(coord => {
        const key = coord.toString();
        let n = nodemap.get(key);
        if (!n) {
          n = new osmNode({ loc: coord });
          entities.push(n);
          nodemap.set(key, n);
        }
        nodelist.push(n.id);
      });
      // make a way
      const w = new osmWay({ nodes: nodelist, tags: parseTags(props) });
      entities.push(w);
      return entities;

    // Polygon:  make nodes, way(s), possibly a relation
    } else if (geom.type === 'Polygon') {
      let ways = [];
      geom.coordinates.forEach(ring => {
        // make nodes
        let nodelist = [];
        ring.forEach(coord => {
          const key = coord.toString();
          let n = nodemap.get(key);
          if (!n) {
            n = new osmNode({ loc: coord });
            entities.push(n);
            nodemap.set(key, n);
          }
          nodelist.push(n.id);
        });
        // make a way
        const w = new osmWay({ nodes: nodelist, tags: parseTags(props) });
        ways.push(w);
      });

      if (ways.length === 1) {  // single ring, set tags and return
        entities.push(ways[0].update({ tags: parseTags(props) }));

      } else {  // multiple rings, make a multipolygon relation with inner/outer members
        const members = ways.map((w, i) => {
          entities.push(w);
          return { id: w.id, role: (i === 0 ? 'outer' : 'inner'), type: 'way' };
        });
        const tags = Object.assign(parseTags(props), { type: 'multipolygon' });
        const r = new osmRelation({ members: members, tags: tags });
        entities.push(r);
      }

      return entities;
    }

    // no Multitypes for now (maybe not needed)

    // const uid = osmEntity.id.fromOSM(child.nodeName, child.attributes.id.value);

// not sure whether we need this code from fb_ai_features
    // // Handle non-deterministic way splitting from Roads Service. Splits
    // // are consistent within a single request.
    // let origUid;
    // let cache = _caches[dataset.id];
    // if (child.attributes.orig_id) {
    //   origUid = osmEntity.id.fromOSM(child.nodeName, child.attributes.orig_id.value);
    //   if (_graph.entities[origUid] || (cache.origIdTile[origUid] && cache.origIdTile[origUid] !== tile.id)) {
    //     return null;
    //   }
    //   cache.origIdTile[origUid] = tile.id;
    // }

    // const entity = parser(child, uid);
    // entity.__fbid__ = child.attributes.id.value;
    // entity.__origid__ = origUid;
    // return entity;
  }
}


export default {

  init: function () {
    _graph = coreGraph();
    _tree = coreTree(_graph);
    this.event = utilRebind(this, dispatch, 'on');
  },


  reset: function (key) {
    Object.values(_caches).forEach(cache => {
      if (cache.inflight) {
        Object.values(cache.inflight).forEach(abortRequest);
      }
      cache = { inflight: {}, loaded: {}, seen: {}, origIdTile: {} };
    });

    if (key !== undefined && _checkpoints.hasOwnProperty(key)) {
      _graph = _checkpoints[key].graph;
    } else {
      _graph = coreGraph();
      _tree = coreTree(_graph);
    }

    return this;
  },


  // save the current history state
  checkpoint: function (key) {
    _checkpoints[key] = { graph: _graph };
    return this;
  },


  graph: function ()  {
    return _graph;
  },


  intersects: function (extent) {
    if (!_tree || !_graph) return [];
    return _tree.intersects(extent, _graph);
  },


  merge: function (entities) {
    _graph.rebase(entities, [_graph], false);
    _tree.rebase(entities, false);
  },


  toggle: function (val) {
    _off = !val;
    return this;
  },


  loadTiles: function (datasetID, projection) {
    if (_off) return;

    const dataset = _datasets[datasetID];
    if (!dataset || !dataset.layer) return;

    const tiles = tiler.getTiles(projection);
    let cache = _caches[datasetID];

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
      const url = tileURL(dataset, tile.extent);

      d3_json(url, { signal: controller.signal })
        .then(geojson => {
          delete cache.inflight[tile.id];
          if (!geojson) throw new Error('no geojson');
          parseTile(dataset, tile, geojson, (err, results) => {
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


  loadDatasets: function () {    // eventually pass search params?
    if (Object.keys(_datasets).length) {   // for now, if we have fetched datasets, return them
      return Promise.resolve(_datasets);
    }

    const that = this;
    return d3_json(searchURL())
      .then(json => {
        (json.results || []).forEach(ds => {   // add each one to _datasets and _caches
          if (_datasets[ds.id]) return;        // unless we've seen it already
          _datasets[ds.id] = ds;
          _caches[ds.id] = { inflight: {}, loaded: {}, seen: {}, origIdTile: {} };
          // preload the layer info (or we could wait do this once the user actually clicks 'add to map')
          that.loadLayer(ds.id);
        });
        return _datasets;
      })
      .catch(() => _datasets = {});
  },


  loadLayer: function (datasetID) {
    let dataset = _datasets[datasetID];
    if (!dataset || !dataset.url) {
      return Promise.reject(`Unknown datasetID: ${datasetID}`);
    } else if (dataset.layer) {
      return Promise.resolve(dataset.layer);
    }

    return d3_json(layerURL(dataset.url))
      .then(json => {
        if (!json.layers || !json.layers.length) {
          throw new Error(`Missing layer info for datasetID: ${datasetID}`);
        }

        dataset.layer = json.layers[0];  // should return a single layer

        // Use the field metadata to map to OSM tags
        let tagmap = {};
        dataset.layer.fields.forEach(f => {
          if (!f.editable) return;   // 1. keep "editable" fields only
          tagmap[f.name] = f.alias;  // 2. field `name` -> OSM tag (stored in `alias`)
        });
        dataset.layer.tagmap = tagmap;

        return dataset.layer;
      })
      .catch(() => { /* ignore? */ });
  }
};
