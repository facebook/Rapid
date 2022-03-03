import { utilRebind } from '../util';

import { PixiLayerImproveOsm } from './PixiLayerImproveOsm';
import { PixiLayerKartaPhotos } from './PixiLayerKartaPhotos';
import { PixiLayerKeepRight } from './PixiLayerKeepRight';
import { PixiLayerMapillaryFeatures } from './PixiLayerMapillaryFeatures';
import { PixiLayerMapillaryPhotos } from './PixiLayerMapillaryPhotos';
import { PixiLayerMapillarySigns } from './PixiLayerMapillarySigns';
import { PixiLayerOsm } from './PixiLayerOsm';
import { PixiLayerOsmNotes } from './PixiLayerOsmNotes';
import { PixiLayerOsmose } from './PixiLayerOsmose';
import { PixiLayerRapid } from './PixiLayerRapid';
import { PixiLayerStreetsidePhotos } from './PixiLayerStreetsidePhotos';


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
  constructor(context, featureCache, dispatch) {
    this.context = context;
    this.featureCache = featureCache;
    this.dispatch = dispatch;


    utilRebind(this, this.dispatch, 'on');

    this._layers = [
      new PixiLayerImproveOsm(context, featureCache, this.dispatch),
      new PixiLayerKartaPhotos(context, featureCache, this.dispatch),
      new PixiLayerKeepRight(context, featureCache, this.dispatch),
      new PixiLayerMapillaryFeatures(context, featureCache, this.dispatch),
      new PixiLayerMapillaryPhotos(context, featureCache, this.dispatch),
      new PixiLayerMapillarySigns(context, featureCache, this.dispatch),
      new PixiLayerOsm(context, featureCache, this.dispatch),
      new PixiLayerOsmNotes(context, featureCache, this.dispatch),
      new PixiLayerOsmose(context, featureCache, this.dispatch),
      new PixiLayerRapid(context, featureCache, this.dispatch),
      new PixiLayerStreetsidePhotos(context, featureCache, this.dispatch)
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
