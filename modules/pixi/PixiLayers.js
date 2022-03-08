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
   * @param scene
   */
  constructor(context, scene, dispatch) {
    this.context = context;
    this.scene = scene;
    this.dispatch = dispatch;

    utilRebind(this, this.dispatch, 'on');  // very sus ??

    this._layers = [
      new PixiLayerImproveOsm(context, scene),
      new PixiLayerKartaPhotos(context, scene),
      new PixiLayerKeepRight(context, scene),
      new PixiLayerMapillaryFeatures(context, scene),
      new PixiLayerMapillaryPhotos(context, scene),
      new PixiLayerMapillarySigns(context, scene),
      new PixiLayerOsm(context, scene),
      new PixiLayerOsmNotes(context, scene),
      new PixiLayerOsmose(context, scene),
      new PixiLayerRapid(context, scene),
      new PixiLayerStreetsidePhotos(context, scene)
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
    this.dispatch.call('change');
    return this;
  }


  disable(ids) {
    const toDisable = new Set([].concat(ids));  // coax ids into a Set
    this._layers.forEach(layer => {
      if (toDisable.has(layer.id)) {
        layer.enabled = false;
      }
    });
    this.dispatch.call('change');
    return this;
  }


  only(ids) {
    const toEnable = new Set([].concat(ids));  // coax ids into a Set
    this._layers.forEach(layer => {
      layer.enabled = toEnable.has(layer.id);
    });
    this.dispatch.call('change');
    return this;
  }


  dimensions() {
    return this;  /* noop */
  }

}
