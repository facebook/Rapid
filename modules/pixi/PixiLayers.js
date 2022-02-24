import { dispatch as d3_dispatch } from 'd3-dispatch';
import { utilRebind } from '../util';

import { PixiImproveOSM } from './PixiImproveOSM';
import { PixiKartaPhotos } from './PixiKartaPhotos';
import { PixiKeepRight } from './PixiKeepRight';
import { PixiMapillaryPhotos } from './PixiMapillaryPhotos';
import { PixiMapillaryMapFeatures } from './PixiMapillaryMapFeatures';
import { PixiMapillarySigns } from './PixiMapillarySigns';
import { PixiOsm } from './PixiOsm';
import { PixiOsmNotes } from './PixiOsmNotes';
import { PixiOsmose } from './PixiOsmose';
import { PixiRapidFeatures } from './PixiRapidFeatures';
import { PixiStreetsidePhotos } from './PixiStreetsidePhotos';


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
      new PixiImproveOSM(context, featureCache, this.dispatch),
      new PixiKartaPhotos(context, featureCache, this.dispatch),
      new PixiKeepRight(context, featureCache, this.dispatch),
      new PixiMapillaryMapFeatures(context, featureCache, this.dispatch),
      new PixiMapillaryPhotos(context, featureCache, this.dispatch),
      new PixiMapillarySigns(context, featureCache, this.dispatch),
      new PixiOsm(context, featureCache, this.dispatch),
      new PixiOsmNotes(context, featureCache, this.dispatch),
      new PixiOsmose(context, featureCache, this.dispatch),
      new PixiRapidFeatures(context, featureCache, this.dispatch),
      new PixiStreetsidePhotos(context, featureCache, this.dispatch)
    ];
  }


  /**
   * render
   * @param projection - a pixi projection
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
