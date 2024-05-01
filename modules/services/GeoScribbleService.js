import { Tiler } from '@rapid-sdk/math';
import { utilQsString } from '@rapid-sdk/util';
import RBush from 'rbush';
import { geojsonExtent } from '../util/util.js';
import { AbstractSystem } from '../core/AbstractSystem.js';
import { utilFetchResponse } from '../util/index.js';


const TILEZOOM = 16.5;
const GEOSCRIBBLE_API = 'https://geoscribble.osmz.ru/geojson';


/**
 * `GeoScribbleService`
 * GeoScribble is a service that allows users to collaboratively draw on the map.
 * see also:
 *  https://wiki.openstreetmap.org/wiki/GeoScribble
 *  https://geoscribble.osmz.ru/docs
 *  https://github.com/Zverik/geoscribble
 *
 * Events available:
 *   'loadedData'
 */
export class GeoScribbleService extends AbstractSystem {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'geoScribble';
    this.autoStart = false;
    this._nextID = 0;

    this._cache = {};
    this._tiler = new Tiler().zoomRange(TILEZOOM).skipNullIsland(true);
  }


  /**
   * initAsync
   * Called after all core objects have been constructed.
   * @return {Promise} Promise resolved when this component has completed initialization
   */
  initAsync() {
    return this.resetAsync();
  }


  /**
   * startAsync
   * Called after all core objects have been initialized.
   * @return {Promise} Promise resolved when this component has completed startup
   */
  startAsync() {
    this._started = true;
  }


  /**
   * resetAsync
   * Called after completing an edit session to reset any internal state
   * @return {Promise} Promise resolved when this component has completed resetting
   */
  resetAsync() {
    if (this._cache.inflight) {
      for (const inflight of this._cache.inflight.values()) {
        inflight.controller.abort();
      }
    }
    this._nextID = 0;
    this._cache = {
      shapes: {},
      loadedTile: {},
      inflightTile: {},
      rtree: new RBush()
    };

    return Promise.resolve();
  }


  /**
   * getData
   * Get already loaded image data that appears in the current map view
   * @return  {Array}  Array of image data
   */
  getData() {
    const extent = this.context.viewport.visibleExtent();
    return this._cache.rtree.search(extent.bbox()).map(d => d.data);
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
   * loadTiles
   * Schedule any data requests needed to cover the current map view
   */
  loadTiles() {
    const cache = this._cache;

    // determine the needed tiles to cover the view
    const viewport = this.context.viewport;
    const tiles = this._tiler.getTiles(viewport).tiles;

    // Abort inflight requests that are no longer needed
    this._abortUnwantedRequests(cache, tiles);

    // Issue new requests..
    for (const tile of tiles) {
      if (cache.loadedTile[tile.id] || cache.inflightTile[tile.id]) continue;

      const rect = tile.wgs84Extent.rectangle().join(',');
      const url = GEOSCRIBBLE_API + '?' + utilQsString({ bbox: rect });

      const controller = new AbortController();
      cache.inflightTile[tile.id] = controller;

      fetch(url, { signal: controller.signal })
        .then(utilFetchResponse)
        .then(data => {
          cache.loadedTile[tile.id] = true;
          cache.shapes = data;

          for (const shape of data.features) {
            const featureID = this.getNextID();   // Generate a unique id for this feature
            shape.id = featureID;
            shape.__featurehash__ = featureID;    // legacy

            // afaict the shapes never get updates, so the version can just be 0
            // (if we ever need to stitch partial geometries together, this will bump their version)
            shape.v = 0;

            const box = geojsonExtent(shape).bbox();
            box.data = shape;
            cache.rtree.insert(box);
          }

          this.context.deferredRedraw();
          this.emit('loadedData');
        })
        .catch(err => {
          if (err.name === 'AbortError') return;    // ok
          cache.loadedTile[tile.id] = true;         // don't retry
        })
        .finally(() => {
          delete cache.inflightTile[tile.id];
        });
    }
  }


  _abortRequest(requests) {
    for (const controller of Object.values(requests)) {
      controller.abort();
    }
  }


  _abortUnwantedRequests(cache, tiles) {
    Object.keys(cache.inflightTile).forEach(k => {
      const wanted = tiles.find(tile => k === tile.id);
      if (!wanted) {
        this._abortRequest(cache.inflightTile[k]);
        delete cache.inflightTile[k];
      }
    });
  }

}
