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
 *
 * Events available:
 *   `imageChanged`
 *   'loadedData'
 *   'viewerChanged'
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
      inflightPost: {},
      closed: {},
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


  _encodeScribbleRtree(d, extent) {
    return { minX: extent.min[0], minY: extent.min[1], maxX: extent.max[0], maxY: extent.max[1], data: d };
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
    // determine the needed tiles to cover the view
    const viewport = this.context.viewport;
    const tiles = this._tiler.getTiles(viewport).tiles;

    // abort inflight requests that are no longer needed
    this._abortUnwantedRequests(this._cache, tiles);

    // issue new requests..
    for (const tile of tiles) {
      if (this._cache.loadedTile[tile.id] || this._cache.inflightTile[tile.id]) continue;

      const bbox = tile.wgs84Extent.bbox();
      const scribbleUrl = GEOSCRIBBLE_API + '?' + utilQsString({ bbox: [ bbox.minX, bbox.minY, bbox.maxX, bbox.maxY].join(',') });

      const controller = new AbortController();
      this._cache.inflightTile[tile.id] = controller;

      fetch(scribbleUrl, { signal: controller.signal })
        .then(utilFetchResponse)
        .then(data => {
          this._cache.loadedTile[tile.id] = true;
          this._cache.shapes = data;

          for (const shape of data.features) {
            // Generate a unique id for this feature
            const featureID = this.getNextID();
            shape.id = featureID;
            shape.__featurehash__ = featureID;  // legacy

            this._cache.rtree.insert(this._encodeScribbleRtree(shape, geojsonExtent(shape)));
          }

          this.context.deferredRedraw();
          this.emit('loadedData');
        })
        .catch(err => {
          if (err.name === 'AbortError') return;    // ok
          this._cache.loadedTile[tile.id] = true;   // don't retry
        })
        .finally(() => {
          delete this._cache.inflightTile[tile.id];
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

  _encodeShapeRtree(d) {
    return { minX: d.loc[0], minY: d.loc[1], maxX: d.loc[0], maxY: d.loc[1], data: d };
  }

}
