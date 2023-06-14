import { Tiler } from '@rapid-sdk/math';
import { utilHashcode } from '@rapid-sdk/util';
import deepEqual from 'fast-deep-equal';
import turf_bboxClip from '@turf/bbox-clip';
import stringify from 'fast-json-stable-stringify';
import polygonClipping from 'polygon-clipping';
import Protobuf from 'pbf';
import vt from '@mapbox/vector-tile';

import { AbstractService } from './AbstractService';


/**
 * `VectorTileService`
 *
 * Events available:
 *   'loadedData'
 */
export class VectorTileService extends AbstractService {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'vectortile';

    this._cache = new Map();   // Map(sourceID -> source)
    this._tiler = new Tiler().tileSize(512).margin(1);
  }


  /**
   * reset
   * Called after completing an edit session to reset any internal state
   */
  reset() {
    for (const source of this._cache.values()) {
      for (const controller of Object.values(source.inflight)) {
        this._abortRequest(controller);
      }
    }

    this._cache.clear();
  }


  /**
   * addSource
   * Create a new cache to hold data for a given source
   * @param   sourceID
   * @param   template
   * @return  Object containing the cache
   */
  addSource(sourceID, template) {
    const source = { template: template, inflight: {}, loaded: {}, canMerge: {} };
    this._cache.set(sourceID, source);
    return source;
  }


  /**
   * data (maybe should be "getData"?)
   * @param  sourceID
   * @param  projection
   */
  data(sourceID, projection) {
    const source = this._cache.get(sourceID);
    if (!source) return [];

    const tiles = this._tiler.getTiles(projection).tiles;
    const seen = new Set();
    let results = [];

    for (const tile of tiles) {
      const features = source.loaded[tile.id] ?? [];
      for (const feature of features) {
        const hash = feature.__featurehash__;
        if (seen.has(hash)) continue;
        seen.add(hash);

        // return a shallow copy, because the hash may change
        // later if this feature gets merged with another
        results.push(Object.assign({}, feature));  // shallow copy
      }
    }

    return results;
  }


  /**
   * loadTiles
   * @param  sourceID
   * @param  template
   * @param  projection
   */
  loadTiles(sourceID, template, projection) {
    let source = this._cache.get(sourceID);
    if (!source) {
      source = this.addSource(sourceID, template);
    }

    const tiles = this._tiler.getTiles(projection).tiles;

    // abort inflight requests that are no longer needed
    for (const k of Object.keys(source.inflight)) {
      const wanted = tiles.find(tile => tile.id === k);
      if (!wanted) {
        this._abortRequest(source.inflight[k]);
        delete source.inflight[k];
      }
    }

    for (const tile of tiles) {
      this._loadTile(source, tile);
    }
  }


  /**
   * _abortRequest
   * Call this to abort any unfinished tile fetch request
   * @param  controller  {AbortController}
   */
  _abortRequest(controller) {
    controller.abort();
  }


  /**
   * _loadTile
   * @param  source
   * @param  tile
   */
  _loadTile(source, tile) {
    if (source.loaded[tile.id] || source.inflight[tile.id]) return;

    const url = source.template
      .replace('{x}', tile.xyz[0])
      .replace('{y}', tile.xyz[1])
      // TMS-flipped y coordinate
      .replace(/\{[t-]y\}/, Math.pow(2, tile.xyz[2]) - tile.xyz[1] - 1)
      .replace(/\{z(oom)?\}/, tile.xyz[2])
      .replace(/\{switch:([^}]+)\}/, function(s, r) {
        const subdomains = r.split(',');
        return subdomains[(tile.xyz[0] + tile.xyz[1]) % subdomains.length];
      });


    const controller = new AbortController();
    source.inflight[tile.id] = controller;

    fetch(url, { signal: controller.signal })
      .then(response => {
        if (!response.ok) {
          throw new Error(response.status + ' ' + response.statusText);
        }
        source.loaded[tile.id] = [];
        delete source.inflight[tile.id];
        return response.arrayBuffer();
      })
      .then(data => {
        if (!data) {
          throw new Error('No Data');
        }

        const z = tile.xyz[2];
        if (!source.canMerge[z]) {
          source.canMerge[z] = {};  // initialize mergeCache
        }

        source.loaded[tile.id] = this._vtToGeoJSON(data, tile, source.canMerge[z]);
        this.context.deferredRedraw();
        this.emit('loadedData');
      })
      .catch(() => {
        source.loaded[tile.id] = [];
        delete source.inflight[tile.id];
      });
  }


  /**
   * _vtToGeoJSON
   * @param  data
   * @param  tile
   * @param  mergeCache
   */
  _vtToGeoJSON(data, tile, mergeCache) {
    const vectorTile = new vt.VectorTile(new Protobuf(data));
    let layerIDs = Object.keys(vectorTile.layers);
    if (!Array.isArray(layerIDs)) layerIDs = [layerIDs];

    let features = [];
    for (const layerID of layerIDs) {
      const layer = vectorTile.layers[layerID];
      if (!layer) continue;

      for (let i = 0; i < layer.length; i++) {
        const feature = layer.feature(i).toGeoJSON(tile.xyz[0], tile.xyz[1], tile.xyz[2]);
        const geometry = feature.geometry;

        // Treat all Polygons as MultiPolygons
        if (geometry.type === 'Polygon') {
          geometry.type = 'MultiPolygon';
          geometry.coordinates = [geometry.coordinates];
        }


        // Does this feature clip to tile bounds?
        // (there is probably a much more efficient way to determine this)
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
        feature.v = 0;
        features.push(feature);

        // Clipped Polygons at same zoom with identical properties can get merged (polygon union)
        if (isClipped && geometry.type === 'MultiPolygon') {
          let merged = mergeCache[propertyhash];
          if (merged?.length) {
            const other = merged[0];
            const v = other.v + 1;     // bump version
            const coords = polygonClipping.union(feature.geometry.coordinates, other.geometry.coordinates);
            if (!coords || !coords.length) continue;  // something failed in polygon union

            merged.push(feature);
            for (const feat of merged) {    // all these merged features share...
              feat.v = v;                           // save version, so they get redrawn
              feat.geometry.coordinates = coords;   // same coords, so they get redrawn _properly_
              feat.__featurehash__ = featurehash;   // same hash, so deduplication works
            }
          } else {
            mergeCache[propertyhash] = [feature];
          }
        }
      }
    }

    return features;
  }

}
