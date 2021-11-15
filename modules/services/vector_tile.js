import { dispatch as d3_dispatch } from 'd3-dispatch';
import { Projection, Tiler } from '@id-sdk/math';
import { utilHashcode } from '@id-sdk/util';
import deepEqual from 'fast-deep-equal';
import turf_bboxClip from '@turf/bbox-clip';
import stringify from 'fast-json-stable-stringify';
import polygonClipping from 'polygon-clipping';
import Protobuf from 'pbf';
import vt from '@mapbox/vector-tile';

import { utilRebind } from '../util';


const tiler = new Tiler().tileSize(512).margin(1);
const dispatch = d3_dispatch('busy', 'idle', 'loadedData');

let _vtCache;
let _jobs = new Set();


function abortRequest(i) {
  i.abort();
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


function vtToGeoJSON(data, tile, mergeCache) {
  const vectorTile = new vt.VectorTile(new Protobuf(data));
  let layers = Object.keys(vectorTile.layers);
  if (!Array.isArray(layers)) { layers = [layers]; }

  let features = [];
  layers.forEach(layerID => {
    const layer = vectorTile.layers[layerID];
    if (!layer) return;

    for (let i = 0; i < layer.length; i++) {   // each feature on the layer
      let feature = layer.feature(i).toGeoJSON(tile.xyz[0], tile.xyz[1], tile.xyz[2]);
      let geometry = feature.geometry;

      // Treat all Polygons as MultiPolygons
      if (geometry.type === 'Polygon') {
        geometry.type = 'MultiPolygon';
        geometry.coordinates = [geometry.coordinates];
      }

      // Clip feature to tile bounds
      let isClipped = false;
      if (geometry.type === 'MultiPolygon') {
        const featureClip = turf_bboxClip(feature, tile.wgs84Extent.rectangle());
        if (!deepEqual(feature.geometry, featureClip.geometry)) {
          // feature = featureClip;
          isClipped = true;
        }
        if (!feature.geometry.coordinates.length) continue;   // not actually on this tile
        if (!feature.geometry.coordinates[0].length) continue;   // not actually on this tile
      }

      // Generate some unique IDs and add some metadata
      const featurehash = utilHashcode(stringify(feature));
      const propertyhash = utilHashcode(stringify(feature.properties || {}));
      feature.__layerID__ = layerID.replace(/[^_a-zA-Z0-9\-]/g, '_');
      feature.__featurehash__ = featurehash;
      feature.__propertyhash__ = propertyhash;
      features.push(feature);

      // Clipped Polygons at same zoom with identical properties can get merged
      if (isClipped && geometry.type === 'MultiPolygon') {
        let merged = mergeCache[propertyhash];
        if (merged && merged.length) {
          const other = merged[0];
          const coords = polygonClipping.union(feature.geometry.coordinates, other.geometry.coordinates);
          if (!coords || !coords.length) continue;  // something failed in polygon union

          merged.push(feature);
          for (let j = 0; j < merged.length; j++) {    // all these features get...
            merged[j].geometry.coordinates = coords;     // same coords
            merged[j].__featurehash__ = featurehash;     // same hash, so deduplication works
          }
        } else {
          mergeCache[propertyhash] = [feature];
        }
      }
    }
  });

  return features;
}


function loadTile(source, tile) {
  if (source.loaded[tile.id] || source.inflight[tile.id]) return;

  const url = source.template
    .replace('{x}', tile.xyz[0])
    .replace('{y}', tile.xyz[1])
    // TMS-flipped y coordinate
    .replace(/\{[t-]y\}/, Math.pow(2, tile.xyz[2]) - tile.xyz[1] - 1)
    .replace(/\{z(oom)?\}/, tile.xyz[2])
    .replace(/\{switch:([^}]+)\}/, (s, r) => {
      const subdomains = r.split(',');
      return subdomains[(tile.xyz[0] + tile.xyz[1]) % subdomains.length];
    });

  const controller = new AbortController();
  source.inflight[tile.id] = controller;

  beginJob(url);
  fetch(url, { signal: controller.signal })
    .then(response => {
      if (!response.ok) {
        throw new Error(response.status + ' ' + response.statusText);
      }
      source.loaded[tile.id] = [];
      delete source.inflight[tile.id];
      return response.arrayBuffer();
    })
    .then(function(data) {
      if (!data) {
        throw new Error('No Data');
      }

      const z = tile.xyz[2];
      if (!source.canMerge[z]) {
        source.canMerge[z] = {};  // initialize mergeCache
      }

      source.loaded[tile.id] = vtToGeoJSON(data, tile, source.canMerge[z]);
      dispatch.call('loadedData');
    })
    .catch(() => {
      source.loaded[tile.id] = [];
      delete source.inflight[tile.id];
    })
    .finally(() => endJob(url));
}


export default {
  init: function() {
    if (!_vtCache) {
      this.reset();
    }

    this.event = utilRebind(this, dispatch, 'on');
  },


  reset: function() {
    for (const sourceID in _vtCache) {
      const source = _vtCache[sourceID];
      if (source && source.inflight) {
        Object.values(source.inflight).forEach(abortRequest);
      }
    }

    _vtCache = {};
  },


  addSource: function(sourceID, template) {
    _vtCache[sourceID] = { template: template, inflight: {}, loaded: {}, canMerge: {} };
    return _vtCache[sourceID];
  },


  data: function(sourceID, projection) {
    const source = _vtCache[sourceID];
    if (!source) return [];

    const proj = new Projection().transform(projection.transform()).dimensions(projection.clipExtent());
    const tiles = tiler.getTiles(proj).tiles;
    let seen = {};
    let results = [];

    for (let i = 0; i < tiles.length; i++) {
      const features = source.loaded[tiles[i].id];
      if (!features || !features.length) continue;

      for (let j = 0; j < features.length; j++) {
        const feature = features[j];
        const hash = feature.__featurehash__;
        if (seen[hash]) continue;
        seen[hash] = true;

        // return a shallow copy, because the hash may change
        // later if this feature gets merged with another
        results.push(Object.assign({}, feature));  // shallow copy
      }
    }

    return results;
  },


  loadTiles: function(sourceID, template, projection) {
    let source = _vtCache[sourceID];
    if (!source) {
      source = this.addSource(sourceID, template);
    }

    const proj = new Projection().transform(projection.transform()).dimensions(projection.clipExtent());
    const tiles = tiler.getTiles(proj).tiles;

    // abort inflight requests that are no longer needed
    Object.keys(source.inflight).forEach(k => {
      const wanted = tiles.find(tile => k === tile.id);
      if (!wanted) {
        abortRequest(source.inflight[k]);
        delete source.inflight[k];
      }
    });

    tiles.forEach(tile => loadTile(source, tile));
  },


  cache: function() {
    return _vtCache;
  }

};
