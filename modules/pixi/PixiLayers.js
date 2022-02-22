import * as PIXI from 'pixi.js';
import { dispatch as d3_dispatch } from 'd3-dispatch';
import { utilRebind } from '../util';

import {
  PixiImproveOSM,
  PixiKartaPhotos,
  PixiKeepRight,
  PixiMapillaryPhotos,
  PixiMapillaryMapFeatures,
  PixiMapillarySigns,
  PixiOsm,
  PixiOsmNotes,
  PixiOsmose,
  PixiRapidFeatures,
  PixiStreetsidePhotos
} from './index';


/**
 * PixiLayers
 * @class
 */
export class PixiLayers {

  /**
   * @constructor
   * @param context
   * @param featureCache
   */
  constructor(context, featureCache) {
    this.context = context;
    this.featureCache = featureCache;

    this.dispatch = d3_dispatch('change');
    utilRebind(this, this.dispatch, 'on');

    this._layers = [
      new PixiImproveOSM(context, featureCache, this.dispatch)
      // { id: 'osm',             renderer: PixiOsm(projection, context, dispatch) },
      // { id: 'rapid',           renderer: PixiRapidFeatures(context, featureCache, dispatch)},
      // { id: 'notes',           renderer: PixiOsmNotes(context, featureCache, dispatch)},
      // { id: 'mapillary',       renderer: PixiMapillaryPhotos(context, featureCache, dispatch)},
      // { id: 'streetside',      renderer: PixiStreetsidePhotos(context, featureCache, dispatch)},
      // { id: 'openstreetcam',   renderer: PixiKartaPhotos(context, featureCache, dispatch) },
      // { id: 'mapillary-map-features',  renderer: PixiMapillaryMapFeatures(context, featureCache, dispatch) },
      // { id: 'mapillary-signs', renderer: PixiMapillarySigns(context, featureCache, dispatch) },
      // { id: 'keepRight',       renderer: PixiKeepRight(context, featureCache, dispatch) },
      // { id: 'improveOSM',      renderer: new PixiImproveOSM(context, featureCache, dispatch)  }
      // { id: 'osmose',          renderer: PixiOsmose(context, featureCache, dispatch)  },
    ];
  }


  /**
   * render
   */
  render(projection) {
    const map = this.context.map();
    const effectiveZoom = map.effectiveZoom();
    this._layers.forEach(layer => layer.render(projection, effectiveZoom));
  }


  all() {
    return this._layers;  // seems dangerous
  }


  getLayer(id) {
    return this._layers.find(layer => layer.id === id);
  }


  enable(ids) {
    const stage = this.context.pixi.stage;
    const toEnable = new Set([].concat(ids));  // coax ids into a Set
    this._layers.forEach(layer => {
      if (toEnable.has(layer.id)) {
        layer.enabled = true;
      }
    });
    // this.dispatch.call('change');
    return this;
  }


  disable(ids) {
    const stage = this.context.pixi.stage;
    const toDisable = new Set([].concat(ids));  // coax ids into a Set
    this._layers.forEach(layer => {
      if (toDisable.has(layer.id)) {
        layer.enabled = false;
      }
    });
    // this.dispatch.call('change');
    return this;
  }


  only(ids) {
    const stage = this.context.pixi.stage;
    const toEnable = new Set([].concat(ids));  // coax ids into a Set
    this._layers.forEach(layer => {
      layer.enabled = toEnable.has(layer.id);
    });
    // this.dispatch.call('change');
    return this;
  }


  dimensions() {
    return this;  /* noop */
  }

}
