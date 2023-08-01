import { Tiler } from '@rapid-sdk/math';
import { utilHashcode } from '@rapid-sdk/util';
import { VectorTile } from '@mapbox/vector-tile';
import { PMTiles } from 'pmtiles';
import deepEqual from 'fast-deep-equal';
import turf_bboxClip from '@turf/bbox-clip';
import stringify from 'fast-json-stable-stringify';
import polygonClipping from 'polygon-clipping';
import Protobuf from 'pbf';

import { AbstractSystem } from '../core/AbstractSystem';
import { utilFetchResponse } from '../util';


/**
 * `VectorTileService`
 *
 * Events available:
 *   'loadedData'
 */
export class VectorTileService extends AbstractSystem {

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
   * initAsync
   * Called after all core objects have been constructed.
   * @return {Promise} Promise resolved when this component has completed initialization
   */
  initAsync() {
    return Promise.resolve();
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
    for (const source of this._cache.values()) {
      for (const controller of Object.values(source.inflight)) {
        this._abortRequest(controller);
      }
    }

    this._cache.clear();

    return Promise.resolve();
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
   * addSourceAsync
   * Create a new cache to hold data for a given source
   * @param   sourceID
   * @param   template
   * @return  Promise resolved to the source object
   */
  addSourceAsync(sourceID, template) {
    let source = this._cache.get(sourceID);

    if (!source) {  // create it
      source = { template: template, inflight: {}, loaded: {}, canMerge: {} };
      this._cache.set(sourceID, source);

      if (/\.pmtiles$/.test(template)) {
        source.pmtiles = new PMTiles(template);
        source.addPromise = source.pmtiles.getHeader()
          .then(header => source.header = header)
          .then(() => Promise.resolve(source));
      } else {
        source.addPromise = Promise.resolve(source);
      }
    }

    return source.addPromise;
  }


  /**
   * loadTiles
   * @param  sourceID
   * @param  template
   * @param  projection
   */
  loadTiles(sourceID, template, projection) {
    this.addSourceAsync(sourceID, template)
      .then(source => {
        const header = source.header;
        if (header) {  // pmtiles - set up allowable zoom range
          this._tiler.zoomRange(header.minZoom, header.maxZoom);
          if (header.tileType !== 1) {
            throw new Error(`Unsupported tileType ${header.tileType}. Only Type 1 (MVT) is supported`);
          }
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
      });
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

    const controller = new AbortController();
    source.inflight[tile.id] = controller;

    let _fetch;

    if (source.pmtiles) {
      _fetch = source.pmtiles
        .getZxy(tile.xyz[2], tile.xyz[0], tile.xyz[1], controller.signal)
        .then(response => {
          return response?.data;
        });

    } else {
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

      _fetch = fetch(url, { signal: controller.signal })
        .then(utilFetchResponse);
    }

    _fetch
      .then(buffer => {
        delete source.inflight[tile.id];
        if (!buffer) {
          throw new Error('No Data');
        }

        const z = tile.xyz[2];
        if (!source.canMerge[z]) {
          source.canMerge[z] = {};  // initialize mergeCache
        }

        source.loaded[tile.id] = this._vtToGeoJSON(buffer, tile, source.canMerge[z]);
        this.context.deferredRedraw();
        this.emit('loadedData');
      })
      .catch(err => {
        if (err.name === 'AbortError') return;          // ok
        if (err instanceof Error) console.error(err);   // eslint-disable-line no-console
        source.loaded[tile.id] = [];
        delete source.inflight[tile.id];
      });
  }


  /**
   * _vtToGeoJSON
   * @param  buffer
   * @param  tile
   * @param  mergeCache
   */
  _vtToGeoJSON(buffer, tile, mergeCache) {
    const vectorTile = new VectorTile(new Protobuf(buffer));
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
