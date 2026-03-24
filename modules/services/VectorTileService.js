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
 * This service can connect to sources of vector tile data.
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

          // For Polygons, determine if this feature clips to a tile edge.
          // If so, we'll try to merge it with similar features on the neighboring tile
          if (geojson.geometry.type === 'Polygon') {
            if (extent.min[0] < tileExtent.min[0]) { this._queueMerge(cache, featureID, prophash, leftEdge); }
            if (extent.max[0] > tileExtent.max[0]) { this._queueMerge(cache, featureID, prophash, rightEdge); }
            if (extent.min[1] < tileExtent.min[1]) { this._queueMerge(cache, featureID, prophash, bottomEdge); }
            if (extent.max[1] > tileExtent.max[1]) { this._queueMerge(cache, featureID, prophash, topEdge); }
          }

          // For LineStrings, check if either endpoint is near a tile edge.
          // MVT clipping places endpoints AT the tile boundary, so we use a
          // tolerance rather than strict extent-crossing.
          if (geojson.geometry.type === 'LineString') {
            const coords = geojson.geometry.coordinates;
            if (coords.length >= 2) {
              const first = coords[0];
              const last = coords[coords.length - 1];
              const EDGE_TOL = 5e-5;  // ~5.5m at equator
              const nearLeft   = (pt) => pt[0] < tileExtent.min[0] + EDGE_TOL;
              const nearRight  = (pt) => pt[0] > tileExtent.max[0] - EDGE_TOL;
              const nearBottom = (pt) => pt[1] < tileExtent.min[1] + EDGE_TOL;
              const nearTop    = (pt) => pt[1] > tileExtent.max[1] - EDGE_TOL;

              if (nearLeft(first) || nearLeft(last))     { this._queueMerge(cache, featureID, prophash, leftEdge); }
              if (nearRight(first) || nearRight(last))   { this._queueMerge(cache, featureID, prophash, rightEdge); }
              if (nearBottom(first) || nearBottom(last)) { this._queueMerge(cache, featureID, prophash, bottomEdge); }
              if (nearTop(first) || nearTop(last))       { this._queueMerge(cache, featureID, prophash, topEdge); }
            }
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
      this._insertLineIntersections(cache, newFeatures);
      const gfx = this.context.systems.gfx;
      gfx.deferredRedraw();
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
   * Call this sometimes to merge features across tile edges
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
          // Determine geometry type from the first available feature
          const firstFeature = Array.from(featureIDs)
            .map(id => cache.features.get(id))
            .find(Boolean);

          if (firstFeature?.geojson?.geometry?.type === 'LineString') {
            this._mergeLineStrings(cache, prophash, featureIDs, lowTile, highTile);
          } else {
            this._mergePolygons(cache, prophash, featureIDs, lowTile, highTile);
          }
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
      const gfx = this.context.systems.gfx;
      gfx.deferredRedraw();
    }
  }


  /**
   * _mergeLineStrings
   * Merge LineString features that share a prophash and have near-coincident
   * endpoints along a tile edge.  This is the LineString equivalent of
   * `_mergePolygons` — it stitches road segments split by MVT tile clipping.
   *
   * @param  {Object}  cache
   * @param  {string}  prophash
   * @param  {Set}     featureIDs   Set(featureIDs) to consider
   * @param  {Tile}    lowTile
   * @param  {Tile}    highTile
   */
  _mergeLineStrings(cache, prophash, featureIDs, lowTile, highTile) {
    const features = Array.from(featureIDs)
      .map(id => cache.features.get(id))
      .filter(f => f && f.geojson?.geometry?.type === 'LineString');

    if (features.length < 2) return;

    const SNAP_TOL = 5e-5;   // ~5.5 m at equator

    // Build a working list of coordinate arrays (+ a reference to source properties)
    let lines = features.map(f => ({
      coords: f.geojson.geometry.coordinates.slice(),   // shallow copy of array
      properties: f.geojson.properties
    }));

    // Iteratively merge pairs of lines whose endpoints are close together
    // AND whose approach directions are compatible (prevents merging perpendicular roads)
    const MAX_MERGE_ANGLE = 30;  // degrees — roads must approach within 30° of each other
    let didMerge = true;
    while (didMerge) {
      didMerge = false;
      for (let i = 0; i < lines.length && !didMerge; i++) {
        for (let j = i + 1; j < lines.length && !didMerge; j++) {
          const a = lines[i].coords;
          const b = lines[j].coords;
          const aFirst = a[0];
          const aLast  = a[a.length - 1];
          const bFirst = b[0];
          const bLast  = b[b.length - 1];

          let merged = null;

          if (this._pointsClose(aLast, bFirst, SNAP_TOL) && this._directionsCompatible(a, b, MAX_MERGE_ANGLE)) {
            merged = this._joinLineCoords(a, b, SNAP_TOL);              // A ──→ B
          } else if (this._pointsClose(aFirst, bLast, SNAP_TOL) && this._directionsCompatible(b, a, MAX_MERGE_ANGLE)) {
            merged = this._joinLineCoords(b, a, SNAP_TOL);              // B ──→ A
          } else if (this._pointsClose(aLast, bLast, SNAP_TOL)) {
            const bRev = b.slice().reverse();
            if (this._directionsCompatible(a, bRev, MAX_MERGE_ANGLE)) {
              merged = this._joinLineCoords(a, bRev, SNAP_TOL);         // A ──→ rev(B)
            }
          } else if (this._pointsClose(aFirst, bFirst, SNAP_TOL)) {
            const aRev = a.slice().reverse();
            if (this._directionsCompatible(aRev, b, MAX_MERGE_ANGLE)) {
              merged = this._joinLineCoords(aRev, b, SNAP_TOL);         // rev(A) ──→ B
            }
          }

          if (merged) {
            lines[i] = { coords: merged, properties: lines[i].properties };
            lines.splice(j, 1);
            didMerge = true;
          }
        }
      }
    }

    // ── Re-cache results ───────────────────────────────────────────────────

    // Re-use the same edge-naming helpers from _mergePolygons
    const [lx, ly, lz] = lowTile.xyz;
    const [hx, hy, hz] = highTile.xyz;
    const lowTileID  = lowTile.id;
    const highTileID = highTile.id;
    const lowTileExtent  = lowTile.wgs84Extent;
    const highTileExtent = highTile.wgs84Extent;
    const isVertical   = (hy === ly + 1);
    const isHorizontal = (hx === lx + 1);
    const lowLeftEdge    = `${lx-1},${ly},${lz}-${lowTileID}`;
    const lowRightEdge   = `${lowTileID}-${lx+1},${ly},${lz}`;
    const lowTopEdge     = `${lx},${ly-1},${lz}-${lowTileID}`;
    const lowBottomEdge  = `${lowTileID}-${lx},${ly+1},${lz}`;
    const highLeftEdge   = `${hx-1},${hy},${hz}-${highTileID}`;
    const highRightEdge  = `${highTileID}-${hx+1},${hy},${hz}`;
    const highTopEdge    = `${hx},${hy-1},${hz}-${highTileID}`;
    const highBottomEdge = `${highTileID}-${hx},${hy+1},${hz}`;

    const source = features[0];

    this._uncacheFeatureIDs(cache, featureIDs);

    const newFeatures = [];
    for (const line of lines) {
      if (line.coords.length < 2) continue;

      const geojson = {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: line.coords },
        properties: Object.assign({}, line.properties)
      };

      const extent = this._calcExtent(geojson);
      if (!isFinite(extent.min[0])) continue;

      const featureID = this.getNextID();
      geojson.id = featureID;
      geojson.__featurehash__ = featureID;

      // Cascade: the merged line may still reach other tile edges
      const first = line.coords[0];
      const last  = line.coords[line.coords.length - 1];
      const EDGE_TOL = 5e-5;
      const nearLeft   = (pt) => pt[0] < lowTileExtent.min[0] + EDGE_TOL;
      const nearRight  = (pt) => pt[0] > highTileExtent.max[0] - EDGE_TOL;
      const nearTop    = (pt) => pt[1] > lowTileExtent.max[1] - EDGE_TOL;
      const nearBottom = (pt) => pt[1] < highTileExtent.min[1] + EDGE_TOL;

      if (nearLeft(first) || nearLeft(last)) {
        if (isVertical)                                         { this._queueMerge(cache, featureID, prophash, lowLeftEdge); }
        if (isHorizontal && extent.min[0] < lowTileExtent.min[0])  { this._queueMerge(cache, featureID, prophash, lowLeftEdge); }
      }
      if (nearRight(first) || nearRight(last)) {
        if (isVertical)                                          { this._queueMerge(cache, featureID, prophash, highRightEdge); }
        if (isHorizontal && extent.max[0] > highTileExtent.max[0]) { this._queueMerge(cache, featureID, prophash, lowRightEdge); }
      }
      if (nearTop(first) || nearTop(last)) {
        if (isHorizontal)                                        { this._queueMerge(cache, featureID, prophash, lowTopEdge); }
        if (isVertical && extent.max[1] > lowTileExtent.max[1]) { this._queueMerge(cache, featureID, prophash, lowTopEdge); }
      }
      if (nearBottom(first) || nearBottom(last)) {
        if (isHorizontal)                                        { this._queueMerge(cache, featureID, prophash, highBottomEdge); }
        if (isVertical && extent.min[1] < highTileExtent.min[1]) { this._queueMerge(cache, featureID, prophash, lowBottomEdge); }
      }

      newFeatures.push({
        id: featureID,
        extent: extent,
        layerID: source.layerID,
        prophash: prophash,
        geojson: geojson,
        v: 0
      });
    }

    if (newFeatures.length) {
      this._cacheFeatures(cache, newFeatures);
      const gfx = this.context.systems.gfx;
      gfx.deferredRedraw();
    }
  }


  /**
   * _pointsClose
   * @param   {Array}   a - [lon, lat]
   * @param   {Array}   b - [lon, lat]
   * @param   {number}  tolerance
   * @return  {boolean}
   */
  _pointsClose(a, b, tolerance) {
    return Math.abs(a[0] - b[0]) < tolerance && Math.abs(a[1] - b[1]) < tolerance;
  }


  /**
   * _directionsCompatible
   * Check whether two lines approach a shared junction from compatible directions.
   * lineA flows *toward* the junction (its last segment), lineB flows *away from*
   * the junction (its first segment).  Returns true if the angle between the two
   * approach vectors is less than `maxAngleDeg`.
   *
   * @param   {Array}   lineA - coords flowing toward the junction
   * @param   {Array}   lineB - coords flowing away from the junction
   * @param   {number}  maxAngleDeg - maximum allowed angle in degrees
   * @return  {boolean}
   */
  _directionsCompatible(lineA, lineB, maxAngleDeg) {
    if (lineA.length < 2 || lineB.length < 2) return true;  // can't determine direction

    // Direction of lineA's last segment (approaching junction)
    const a0 = lineA[lineA.length - 2];
    const a1 = lineA[lineA.length - 1];
    const dax = a1[0] - a0[0];
    const day = a1[1] - a0[1];

    // Direction of lineB's first segment (leaving junction)
    const b0 = lineB[0];
    const b1 = lineB[1];
    const dbx = b1[0] - b0[0];
    const dby = b1[1] - b0[1];

    const magA = Math.sqrt(dax * dax + day * day);
    const magB = Math.sqrt(dbx * dbx + dby * dby);
    if (magA === 0 || magB === 0) return true;  // degenerate segment

    const cosAngle = (dax * dbx + day * dby) / (magA * magB);
    const maxCos = Math.cos(maxAngleDeg * Math.PI / 180);

    return cosAngle >= maxCos;
  }


  /**
   * _joinLineCoords
   * Concatenate two coordinate arrays, removing any overlapping points at the
   * junction.  MVT tile clipping typically introduces 1-3 shared points in the
   * buffer zone where tiles overlap.
   *
   * The algorithm searches for the closest pair of points between lineA's tail
   * and lineB's head (within a small search window).  Everything from lineA up
   * to & including the match point is kept, and lineB starts from the point
   * *after* its match.
   *
   * @param   {Array}  lineA  - coordinates flowing *toward* the junction
   * @param   {Array}  lineB  - coordinates flowing *away from* the junction
   * @param   {number} tolerance
   * @return  {Array}  merged coordinate array
   */
  _joinLineCoords(lineA, lineB, tolerance) {
    const SEARCH_DEPTH = 10;
    const tolSq = tolerance * tolerance;

    let bestI = lineA.length - 1;
    let bestJ = 0;
    let bestDistSq = Infinity;

    // Search the tail of lineA against the head of lineB
    const aStart = Math.max(0, lineA.length - SEARCH_DEPTH);
    const bEnd   = Math.min(SEARCH_DEPTH, lineB.length);

    for (let i = aStart; i < lineA.length; i++) {
      for (let j = 0; j < bEnd; j++) {
        const dx = lineA[i][0] - lineB[j][0];
        const dy = lineA[i][1] - lineB[j][1];
        const distSq = dx * dx + dy * dy;
        if (distSq < bestDistSq) {
          bestDistSq = distSq;
          bestI = i;
          bestJ = j;
        }
      }
    }

    if (bestDistSq <= tolSq) {
      // Splice: keep lineA up to the match, skip overlap on lineB
      return lineA.slice(0, bestI + 1).concat(lineB.slice(bestJ + 1));
    }

    // Fallback: no close points found — plain concatenation
    return lineA.concat(lineB);
  }


  /**
   * _insertLineIntersections
   * For each new LineString feature, detect where it geometrically crosses
   * existing cached LineString features.  At each crossing, insert a shared
   * coordinate into both features so that downstream OSM entity creation
   * will produce a node at the intersection.
   *
   * @param  {Object}  cache        - the zoom cache
   * @param  {Array}   newFeatures  - features just added to the cache
   */
  _insertLineIntersections(cache, newFeatures) {
    const lineFeatures = newFeatures.filter(f => f.geojson?.geometry?.type === 'LineString');
    if (!lineFeatures.length) return;

    // For each new LineString, query the RBush for overlapping features
    for (const newFeat of lineFeatures) {
      const bbox = newFeat.extent.bbox();
      const candidates = cache.rbush.search(bbox)
        .map(d => d.data)
        .filter(f => f.id !== newFeat.id && f.geojson?.geometry?.type === 'LineString');

      for (const existing of candidates) {
        this._findAndInsertCrossings(newFeat, existing);
      }
    }
  }


  /**
   * _findAndInsertCrossings
   * Check all segment pairs between two LineString features for crossings.
   * When a crossing is found, insert the intersection coordinate into both
   * features' coordinate arrays (in-place).
   *
   * @param  {Object}  featA - first feature
   * @param  {Object}  featB - second feature
   */
  _findAndInsertCrossings(featA, featB) {
    const EPSILON = 1e-10;
    const coordsA = featA.geojson.geometry.coordinates;
    const coordsB = featB.geojson.geometry.coordinates;

    // Walk segments of A, checking against segments of B.
    // Process from end to start so index insertions don't shift upcoming indices.
    for (let i = coordsA.length - 2; i >= 0; i--) {
      const a1 = coordsA[i];
      const a2 = coordsA[i + 1];

      for (let j = coordsB.length - 2; j >= 0; j--) {
        const b1 = coordsB[j];
        const b2 = coordsB[j + 1];

        const cross = this._segmentIntersection(a1, a2, b1, b2, EPSILON);
        if (!cross) continue;

        // Insert the crossing point into both coordinate arrays
        // (only if it's not already there — i.e. not coincident with an existing vertex)
        const SNAP = 1e-8;
        if (!this._pointsClose(cross, a1, SNAP) && !this._pointsClose(cross, a2, SNAP)) {
          coordsA.splice(i + 1, 0, cross);
        }
        if (!this._pointsClose(cross, b1, SNAP) && !this._pointsClose(cross, b2, SNAP)) {
          coordsB.splice(j + 1, 0, cross);
        }
      }
    }
  }


  /**
   * _segmentIntersection
   * Compute the intersection point of two line segments (a1→a2) and (b1→b2).
   * Returns the [lon, lat] intersection if the segments properly cross
   * (both t and u strictly between 0 and 1), or null otherwise.
   *
   * @param   {Array}   a1 - [lon, lat]
   * @param   {Array}   a2 - [lon, lat]
   * @param   {Array}   b1 - [lon, lat]
   * @param   {Array}   b2 - [lon, lat]
   * @param   {number}  epsilon - tolerance for parallel detection
   * @return  {Array|null} [lon, lat] or null
   */
  _segmentIntersection(a1, a2, b1, b2, epsilon) {
    const dax = a2[0] - a1[0];
    const day = a2[1] - a1[1];
    const dbx = b2[0] - b1[0];
    const dby = b2[1] - b1[1];

    const denom = dax * dby - day * dbx;
    if (Math.abs(denom) < epsilon) return null;  // parallel or coincident

    const dx = b1[0] - a1[0];
    const dy = b1[1] - a1[1];

    const t = (dx * dby - dy * dbx) / denom;
    const u = (dx * day - dy * dax) / denom;

    // Strictly interior crossing (exclude endpoints to avoid false positives
    // at T-junctions and shared endpoints)
    const MARGIN = 0.001;  // exclude first/last 0.1% of each segment
    if (t <= MARGIN || t >= (1 - MARGIN) || u <= MARGIN || u >= (1 - MARGIN)) return null;

    return [
      a1[0] + t * dax,
      a1[1] + t * day
    ];
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
