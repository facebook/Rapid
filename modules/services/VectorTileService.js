import { Extent, Tiler, geoScaleToZoom, vecEqual } from '@rapid-sdk/math';
import { utilHashcode } from '@rapid-sdk/util';
import { VectorTile } from '@mapbox/vector-tile';
import geojsonRewind from '@mapbox/geojson-rewind';
import { PMTiles } from 'pmtiles';
import stringify from 'fast-json-stable-stringify';
import * as Polyclip from 'polyclip-ts';
import Protobuf from 'pbf';
import RBush from 'rbush';

import { AbstractSystem } from '../core/AbstractSystem.js';
import { utilFetchResponse } from '../util/index.js';


/**
 * `VectorTileService`
 * This service can connect to sources of vector tile data
 *
 * - Mapbox Vector Tiles (MVT) made available from a z/x/y tileserver
 *     https://github.com/mapbox/vector-tile-spec
 *     https://github.com/mapbox/vector-tile-js/tree/master
 *
 * - Protomaps .pmtiles single-file archive containing MVT
 *    https://protomaps.com/docs/pmtiles
 *    https://github.com/protomaps/PMTiles
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

    // Sources are identified by their URL template..
    this._sources = new Map();   // Map(template -> source)
    this._tiler = new Tiler().tileSize(512).margin(1);
    this._nextID = 0;
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
    for (const source of this._sources.values()) {
      for (const controller of source.inflight.values()) {
        controller.abort();
      }

      // free memory
      source.inflight.clear();
      source.loaded.clear();
      source.readyPromise = null;
      for (const cache of source.zoomCache.values()) {
        cache.features.clear();
        cache.boxes.clear();
        cache.toMerge.clear();
        cache.didMerge.clear();
        cache.rbush.clear();
      }
      source.zoomCache.clear();
      source.lastv = null;
    }
    this._sources.clear();

    return Promise.resolve();
  }


  /**
   * getNextID
   * Get a unique ID
   * @return  {string}   Unique ID
   */
  getNextID() {
    return (this._nextID++).toString();
  }


  /**
   * getData
   * Get already loaded data that appears in the current map view
   * @param   {string}  template - template to get data for
   * @return  {Array}   Array of data
   */
  getData(template) {
    const source = this._sources.get(template);
    if (!source) return [];

    const context = this.context;
    const viewport = context.viewport;
    const bbox = viewport.visibleExtent().bbox();

    // Note that because vector tiles are 512px, they are offset by -1 zoom level
    // from the main map zoom, which follows 256px and OSM convention.
    const scale = viewport.transform.scale;
     const zoom = Math.round(geoScaleToZoom(scale, 512));

    // Because vector tiled data can be different at different zooms,
    // the caches and indexes need to be setup "per-zoom".
    // Look for a cache at the zoom we are at first, then try other zooms.
    let cache;
    for (let diff = 0; diff < 12; diff++) {
      cache = source.zoomCache.get(zoom + diff);
      if (cache) {
        return cache.rbush.search(bbox).map(d => d.data);
      }
      cache = source.zoomCache.get(zoom - diff);
      if (cache) {
        return cache.rbush.search(bbox).map(d => d.data);
      }
    }
    return [];
  }


  /**
   * loadTiles
   * Schedule any data requests needed to cover the current map view
   * @param   {string}  template - template to load tiles for
   */
  loadTiles(template) {
    this._getSourceAsync(template)
      .then(source => {
        const header = source.header;
        if (header) {  // pmtiles - set up allowable zoom range
          this._tiler.zoomRange(header.minZoom, header.maxZoom);
          if (header.tileType !== 1) {
            throw new Error(`Unsupported tileType ${header.tileType}. Only Type 1 (MVT) is supported`);
          }
        }

        const viewport = this.context.viewport;
        if (source.lastv === viewport.v) return;  // exit early if the view is unchanged
        source.lastv = viewport.v;

        // Determine the tiles needed to cover the view..
        const tiles = this._tiler.getTiles(viewport).tiles;

        // Abort inflight requests that are no longer needed..
        for (const [tileID, controller] of source.inflight) {
          const needed = tiles.find(tile => tile.id === tileID);
          if (!needed) {
            controller.abort();
          }
        }

        // Issue new requests..
        const fetches = tiles.map(tile => this._loadTileAsync(source, tile));
        return Promise.all(fetches)
          .then(() => this._processMergeQueue(source));
      });
  }


  /**
   * _getSourceAsync
   * Create a new cache to hold data for the given template
   * @param   {string}  template - A url template for fetching data (e.g. a z/x/y tileserver or .pmtiles)
   * @return  Promise resolved to the source object once it is ready to use
   */
  _getSourceAsync(template) {
    if (!template) return Promise.reject(new Error('No template'));

    let source = this._sources.get(template);

    if (!source) {  // create it
      const url = new URL(template);
      const hostname = url.hostname;
      const filename = url.pathname.split('/').at(-1);

      source = {
        id:           utilHashcode(template).toString(),
        displayName:  hostname,
        template:     template,
        inflight:     new Map(),   // Map(tileID -> AbortController)
        loaded:       new Map(),   // Map(tileID -> Tile)
        zoomCache:    new Map(),   // Map(zoom -> Object zoomCache)
        lastv:        null         // viewport version last time we fetched data
      };

      this._sources.set(template, source);

      // Special handling for PMTiles sources
      // Create a PMTiles instance and fetch the header so we know more about the source.
      if (filename && /\.pmtiles$/.test(filename)) {
        source.displayName = filename;
        source.pmtiles = new PMTiles(template);
        source.readyPromise = source.pmtiles.getHeader()
          .then(header => source.header = header)
          .then(() => Promise.resolve(source));

      } else {
        source.readyPromise = Promise.resolve(source);
      }
    }

    return source.readyPromise;
  }


  /**
   * _getZoomCache
   * Because vector tiled data can be different at different zooms,
   * the caches and indexes need to be setup "per-zoom".
   * This function will return the existing zoom cache, or create one if needed.
   * @param   {string}  source
   * @param   {number}  zoom
   * @return  {Object}  the cache for the given zoom
   */
  _getZoomCache(source, zoom) {
    let cache = source.zoomCache.get(zoom);

    if (!cache) {
      cache = {
        features: new Map(),   // Map(featureID -> Object)
        boxes:    new Map(),   // Map(featureID -> RBush box)
        toMerge:  new Map(),   // Map(edgeID -> Map(prophash -> Set(featureIDs)))
        didMerge: new Set(),   // Set(edgeID)
        rbush:    new RBush()
      };

      source.zoomCache.set(zoom, cache);
    }

    return cache;
  }


  /**
   * _loadTileAsync
   * @param   source
   * @param   tile
   * @return  {Promise} returns the fetch promise
   */
  _loadTileAsync(source, tile) {
    const tileID = tile.id;
    if (source.loaded.has(tileID) || source.inflight.has(tileID)) return;

    const controller = new AbortController();
    source.inflight.set(tileID, controller);

    const [x, y, z] = tile.xyz;
    let _fetch;

    if (source.pmtiles) {
      _fetch = source.pmtiles
        .getZxy(z, x, y, controller.signal)
        .then(response => response?.data);

    } else {
      const url = source.template
        .replace('{x}', x)
        .replace('{y}', y)
        .replace(/\{[t-]y\}/, Math.pow(2, z) - y - 1)  // TMS-flipped y coordinate
        .replace(/\{z(oom)?\}/, z)
        .replace(/\{switch:([^}]+)\}/, function(s, r) {
          const subdomains = r.split(',');
          return subdomains[(x + y) % subdomains.length];
        });

      _fetch = fetch(url, { signal: controller.signal })
        .then(utilFetchResponse);
    }

    return _fetch
      .then(buffer => {
        source.loaded.set(tileID, tile);
        this._parseTileBuffer(source, tile, buffer);
      })
      .catch(err => {
        if (err.name === 'AbortError') return;          // ok
        if (err instanceof Error) console.error(err);   // eslint-disable-line no-console
      })
      .finally(() => {
        source.inflight.delete(tileID);
      });
  }


  /**
   * _parseTileBuffer
   * @param  source
   * @param  tile
   * @param  buffer
   */
  _parseTileBuffer(source, tile, buffer) {
    if (!buffer) return;  // 'no data' is ok

    // Get some info about this tile and its neighbors
    const [x, y, z] = tile.xyz;
    const tileID = tile.id;
    const tileExtent = tile.wgs84Extent;

    //       -y
    //     +----+
    //  -x |    | +x
    //     +----+
    //       +y

    // Define tile edges (lower x,y,z - higher x,y,z)
    const leftEdge = `${x-1},${y},${z}-${tileID}`;
    const rightEdge = `${tileID}-${x+1},${y},${z}`;
    const topEdge = `${x},${y-1},${z}-${tileID}`;
    const bottomEdge = `${tileID}-${x},${y+1},${z}`;

    const vt = new VectorTile(new Protobuf(buffer));
    const cache = this._getZoomCache(source, z);

    const newFeatures = [];
    for (const [layerID, vtLayer] of Object.entries(vt.layers)) {
      if (!vtLayer) continue;

      // Determine extent of tile coordinates
      const min = 0;
      const max = vtLayer.extent;  // default 4096

      // For each feature on the vector tile...
      for (let i = 0; i < vtLayer.length; i++) {
        const vtFeature = vtLayer.feature(i);
        const [left, top, right, bottom] = vtFeature.bbox();

        // This feature is wholly on a neighbor tile - it just spills onto this tile in the buffer..
        if (left > max || top > max || right < min || bottom < min) continue;

        // Force all properties to strings
        for (const [k, v] of Object.entries(vtFeature.properties)) {
          vtFeature.properties[k] = v.toString();
        }

        // When features have the same properties, we'll consider them mergeable.
        const prophash = utilHashcode(stringify(vtFeature.properties)).toString();

        // If the feature doesn't have an id, use the prophash as the id
        if (!vtFeature.id) {
          vtFeature.id = prophash;
        }

        // Convert to GeoJSON
        const orig = vtFeature.toGeoJSON(x, y, z);

        // It's common for a vector tile to return 'Multi' GeoJSON features..
        // e.g. All the roads together in one `MultiLineString`.
        // For our purposes, we really want to work with them as single features..
        for (const geojson of this._toSingleFeatures(orig)) {
          const extent = this._calcExtent(geojson);
          if (!isFinite(extent.min[0])) continue;  // invalid - no coordinates?

          // Generate a unique id for this feature
          const featureID = this.getNextID();
          geojson.id = featureID;
          geojson.__featurehash__ = featureID;  // legacy

// add a few extra props for debugging
// geojson.properties['__featureID'] = featureID;
// geojson.properties['__tileID'] = tile.id;
// geojson.properties['__prophash'] = prophash;

          // For Polygons only, determine if this feature clips to a tile edge.
          // If so, we'll try to merge it with similar features on the neighboring tile
          if (geojson.geometry.type === 'Polygon') {
            if (extent.min[0] < tileExtent.min[0]) { this._queueMerge(cache, featureID, prophash, leftEdge); }
            if (extent.max[0] > tileExtent.max[0]) { this._queueMerge(cache, featureID, prophash, rightEdge); }
            if (extent.min[1] < tileExtent.min[1]) { this._queueMerge(cache, featureID, prophash, bottomEdge); }
            if (extent.max[1] > tileExtent.max[1]) { this._queueMerge(cache, featureID, prophash, topEdge); }
          }

          newFeatures.push({
            id: featureID,
            extent: extent,
            layerID: layerID,
            prophash: prophash,
            geojson: geojsonRewind(geojson, true),
            v: 0
          });
        }
      }
    }

    if (newFeatures.length) {
      this._cacheFeatures(cache, newFeatures);
      this.context.deferredRedraw();
      this.emit('loadedData');
    }
  }


  /**
   * _queueMerge
   * Mark this data as eligible for merging across given tile edge
   */
  _queueMerge(cache, featureID, prophash, edgeID) {
    if (cache.didMerge.has(edgeID)) return;  // we merged this edge already

    let mergemap = cache.toMerge.get(edgeID);
    if (!mergemap) {
      mergemap = new Map();    // Map(prophash -> Set(featureIDs))
      cache.toMerge.set(edgeID, mergemap);
    }
    let featureIDs = mergemap.get(prophash);
    if (!featureIDs) {
      featureIDs = new Set();
      mergemap.set(prophash, featureIDs);
    }
    featureIDs.add(featureID);
  }


  /**
   * _processMergeQueue
   * Call this sometimes to merge polygons across tile edges
   */
  _processMergeQueue(source) {
    for (const cache of source.zoomCache.values()) {
      for (const [edgeID, mergemap] of cache.toMerge) {  // for each edge

        // Are both tiles loaded?
        const [lowID, highID] = edgeID.split('-');
        const lowTile = source.loaded.get(lowID);
        const highTile = source.loaded.get(highID);
        if (!lowTile || !highTile) continue;

        cache.didMerge.add(edgeID);

        // All the features that share this prophash along this edge can be merged
        for (const [prophash, featureIDs] of mergemap) {
          this._mergePolygons(cache, prophash, featureIDs, lowTile, highTile);
          mergemap.delete(prophash);  // done this prophash
        }
        cache.toMerge.delete(edgeID);
      }
    }
  }


  /**
   * _cacheFeatures
   * @param  {Object}  cache
   * @param  {Array}  features
   */
  _cacheFeatures(cache, features) {
    const boxes = [];
    for (const feature of features) {
      cache.features.set(feature.id, feature);  // cache feature

      const box = feature.extent.bbox();
      box.data = feature;
      cache.boxes.set(feature.id, box);   // cache box
      boxes.push(box);
    }

    cache.rbush.load(boxes);  // bulk load
  }


  /**
   * _uncacheFeatureIDs
   * @param  {Object}  cache
   * @param  {Set}     featureIDs - Set(featureIDs)
   */
  _uncacheFeatureIDs(cache, featureIDs) {
    for (const featureID of featureIDs) {
      const box = cache.boxes.get(featureID);
      if (box) {
        cache.boxes.delete(featureID);  // uncache box
        cache.rbush.remove(box);
      }
      cache.features.delete(featureID);  // uncache feature
    }
  }


  /**
   * _mergePolygons
   * Merge the given features across the given edge (defined by lowTile/highTile)
   * @param  {Object}  cache
   * @param  {Set}     featureIDs   Set(featureIDs) to merge
   * @param  {Tile}    lowTile
   * @param  {Tile}    highTile
   */
  _mergePolygons(cache, prophash, featureIDs, lowTile, highTile) {
    const features = Array.from(featureIDs).map(featureID => cache.features.get(featureID)).filter(Boolean);
    if (!features.length) return;

    // We have more edges to keep track of now..
    // The tiles involved in this merge will be in one of these orientations:
    //
    //                          +------+
    //  +-----+------+          | low  |
    //  | low | high |    or    +------+
    //  +-----+------+          | high |
    //                          +------+
    //
    // Important to ignore the edge between low-high, as this is the one we are currently merging!
    // Edges to ignore will either be "lowRight,highLeft" or "lowBottom,highTop"

    // Define tile edges (lower x,y,z - higher x,y,z)
    const [lx, ly, lz] = lowTile.xyz;
    const [hx, hy, hz] = highTile.xyz;
    const lowTileID = lowTile.id;
    const highTileID = highTile.id;
    const lowTileExtent = lowTile.wgs84Extent;
    const highTileExtent = highTile.wgs84Extent;
    const isVertical = (hy === ly + 1);
    const isHorizontal = (hx === lx + 1);
    const lowLeftEdge = `${lx-1},${ly},${lz}-${lowTileID}`;
    const lowRightEdge = `${lowTileID}-${lx+1},${ly},${lz}`;
    const lowTopEdge = `${lx},${ly-1},${lz}-${lowTileID}`;
    const lowBottomEdge = `${lowTileID}-${lx},${ly+1},${lz}`;
    const highLeftEdge = `${hx-1},${hy},${hz}-${highTileID}`;
    const highRightEdge = `${highTileID}-${hx+1},${hy},${hz}`;
    const highTopEdge = `${hx},${hy-1},${hz}-${highTileID}`;
    const highBottomEdge = `${highTileID}-${hx},${hy+1},${hz}`;

    // The merged feature(s) can copy some properties from the first one
    const source = features[0];

    this._uncacheFeatureIDs(cache, featureIDs);

    // Union the coordinates together
    const sourceCoords = features.map(feature => feature.geojson.geometry.coordinates);
    const mergedCoords = Polyclip.union(...sourceCoords);
    if (!mergedCoords || !mergedCoords.length) {
      throw new Error(`Failed to merge`);  // shouldn't happen
    }

    // `Polyclip.union` always returns a MultiPolygon
    const merged = {
      type: 'Feature',
      geometry: {
        type: 'MultiPolygon',
        coordinates: mergedCoords
      },
      properties: Object.assign({}, source.geojson.properties)   // shallow copy
    };

    // Convert whatever we got into new polygons
    const newFeatures = [];
    for (const geojson of this._toSingleFeatures(merged)) {
      const extent = this._calcExtent(geojson);
      if (!isFinite(extent.min[0])) continue;  // invalid - no coordinates?

      this._dedupePoints(geojson);  // remove coincident points caused by union operation

      // Generate a unique id for this feature
      const featureID = this.getNextID();
      geojson.id = featureID;
      geojson.__featurehash__ = featureID;  // legacy

//// add a few extra props for debugging
//geojson.properties['__featureID'] = featureID;
//geojson.properties['__tileID'] = `merged ${lowTile.id} and ${highTile.id}`;
//geojson.properties['__prophash'] = prophash;

      // More merging may be necessary
      if (extent.min[0] < lowTileExtent.min[0])                   { this._queueMerge(cache, featureID, prophash, lowLeftEdge); }
      if (isVertical && extent.max[0] > lowTileExtent.max[0])     { this._queueMerge(cache, featureID, prophash, lowRightEdge); }
      if (isHorizontal && extent.min[1] < lowTileExtent.min[1])   { this._queueMerge(cache, featureID, prophash, lowBottomEdge); }
      if (extent.max[1] > lowTileExtent.max[1])                   { this._queueMerge(cache, featureID, prophash, lowTopEdge); }
      if (isVertical && extent.min[0] < highTileExtent.min[0])    { this._queueMerge(cache, featureID, prophash, highLeftEdge); }
      if (extent.max[0] > highTileExtent.max[0])                  { this._queueMerge(cache, featureID, prophash, highRightEdge); }
      if (extent.min[1] < highTileExtent.min[1])                  { this._queueMerge(cache, featureID, prophash, highBottomEdge); }
      if (isHorizontal && extent.max[1] > highTileExtent.max[1])  { this._queueMerge(cache, featureID, prophash, highTopEdge); }

      newFeatures.push({
        id: featureID,
        extent: extent,
        layerID: source.layerID,
        prophash: prophash,
        geojson: geojsonRewind(geojson, true),
        v: 0
      });
    }

    if (newFeatures.length) {
      this._cacheFeatures(cache, newFeatures);
      this.context.deferredRedraw();
    }
  }


  /**
   * _calcExtent
   * @param  {Object}  geojson - a GeoJSON Feature
   * @return {Extent}
   */
  _calcExtent(geojson) {
    const extent = new Extent();
    const geometry = geojson?.geometry;
    if (!geojson || !geometry) return extent;

    const type = geometry.type;
    const coords = geometry.coordinates;

    // Treat single types as multi types to keep the code simple
    const parts = /^Multi/.test(type) ? coords : [coords];

    if (/Polygon$/.test(type)) {
      for (const polygon of parts) {
        const outer = polygon[0];  // No need to iterate over inners
        for (const point of outer) {
          extent.extendSelf(point);
        }
      }
    } else if (/LineString$/.test(type)) {
      for (const line of parts) {
        for (const point of line) {
          extent.extendSelf(point);
        }
      }
    } else if (/Point$/.test(type)) {
      for (const point of parts) {
        extent.extendSelf(point);
      }
    }

    return extent;
  }


  /**
   * _dedupePoints
   * The union operation often leaves points which are essentially coincident
   * This will remove them in-place
   * @param  {Object}  geojson - a GeoJSON Feature
   */
  _dedupePoints(geojson) {
    const geometry = geojson?.geometry;
    if (!geojson || !geometry) return;
    if (geometry.type !== 'Polygon') return;

    const EPSILON = 5e-6;
    const coords = geometry.coordinates;

    for (let i = 0; i < coords.length; i++) {
      let ring = coords[i];
      let cleaned = [];
      let prevPoint = null;
      for (let j = 0; j < ring.length; j++) {
        const point = ring[j];
        if (j === 0 || j === ring.length - 1) {   // leave first/last points alone
          cleaned.push(point);
        } else if (!vecEqual(point, prevPoint, EPSILON)) {
          cleaned.push(point);
        }
        prevPoint = point;
      }
      coords[i] = cleaned;  // replace ring
    }
  }


  /**
   * _toSingleFeatures
   * Call this to convert a multi feature to an array of single features
   * (e.g. convert MultiPolygon to array of Polygons)
   * (If passed a single feature, this will just return the single feature in an array)
   * @param  {Object}  geojson - any GeoJSON Feature
   * @return {Array} array of single GeoJSON features
   */
  _toSingleFeatures(geojson) {
    const result = [];
    const geometry = geojson?.geometry;
    if (!geojson || !geometry) return result;

    const type = geometry.type;
    const coords = geometry.coordinates;

    // Treat single types as multi types to keep the code simple
    const parts = /^Multi/.test(type) ? coords : [coords];

    for (const part of parts) {
      result.push({
        type: 'Feature',
        id: geojson.id ?? undefined,
        geometry: {
          type: type.replace('Multi', ''),
          coordinates: part
        },
        properties: Object.assign({}, geojson.properties)   // shallow copy
      });
    }
    return result;
  }
}
