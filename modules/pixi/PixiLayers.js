import { EventEmitter } from '@pixi/utils';

import { PixiLayerBackgroundTiles } from './PixiLayerBackgroundTiles';
import { PixiLayerEditBlocks } from './PixiLayerEditBlocks';
import { PixiLayerImproveOsm } from './PixiLayerImproveOsm';
import { PixiLayerKartaPhotos } from './PixiLayerKartaPhotos';
import { PixiLayerKeepRight } from './PixiLayerKeepRight';
import { PixiLayerLabels } from './PixiLayerLabels';
import { PixiLayerMapillaryFeatures } from './PixiLayerMapillaryFeatures';
import { PixiLayerMapillaryPhotos } from './PixiLayerMapillaryPhotos';
import { PixiLayerMapillarySigns } from './PixiLayerMapillarySigns';
import { PixiLayerOsm } from './PixiLayerOsm';
import { PixiLayerOsmNotes } from './PixiLayerOsmNotes';
import { PixiLayerOsmose } from './PixiLayerOsmose';
import { PixiLayerRapid } from './PixiLayerRapid';
import { PixiLayerMapUI } from './PixiLayerMapUI';
import { PixiLayerStreetsidePhotos } from './PixiLayerStreetsidePhotos';
import { PixiLayerCustomData } from './PixiLayerCustomData';


/**
 * PixiLayers

 * Events available:
 *   `layerchange`   Fires when layers are toggled from enabled/disabled
 */
export class PixiLayers extends EventEmitter {

  /**
   * @constructor
   * @param  context   Global shared application context
   * @param  scene
   */
  constructor(context, scene) {
    super();
    this.context = context;
    this.scene = scene;

    this._layers = [
      new PixiLayerBackgroundTiles(context, scene, 1),

      new PixiLayerOsm(context, scene, 5),
      new PixiLayerRapid(context, scene, 6),

      new PixiLayerCustomData(context, scene, 8),
      new PixiLayerOsmNotes(context, scene, 10),
      new PixiLayerImproveOsm(context, scene, 11),
      new PixiLayerKeepRight(context, scene, 12),
      new PixiLayerOsmose(context, scene, 13),

      new PixiLayerMapillaryPhotos(context, scene, 20),
      new PixiLayerMapillaryFeatures(context, scene, 21),
      new PixiLayerMapillarySigns(context, scene, 22),
      new PixiLayerKartaPhotos(context, scene, 25),
      new PixiLayerStreetsidePhotos(context, scene, 26),

      new PixiLayerLabels(context, scene, 30),

      new PixiLayerEditBlocks(context, scene, 90),
      new PixiLayerMapUI(context, scene, 99)
    ];
  }


  /**
   * render
   * @param  timestamp    timestamp in milliseconds
   * @param  projection   pixi projection to use for rendering
   * @param  zoom         effective zoom to use for rendering
   */
  render(timestamp, projection, zoom) {
    this._layers.forEach(layer => layer.render(timestamp, projection, zoom));
  }


  all() {
    return this._layers;  // seems dangerous
  }


  getLayer(id) {
    return this._layers.find(layer => layer.id === id);
  }

  getLayers() {
    return this._layers;
  }

  enable(ids) {
    const toEnable = new Set([].concat(ids));  // coax ids into a Set
    this._layers.forEach(layer => {
      if (toEnable.has(layer.id)) {
        layer.enabled = true;
      }
    });
    this.emit('layerchange');
    return this;
  }


  disable(ids) {
    const toDisable = new Set([].concat(ids));  // coax ids into a Set
    this._layers.forEach(layer => {
      if (toDisable.has(layer.id)) {
        layer.enabled = false;
      }
    });
    this.emit('layerchange');
    return this;
  }


  toggle(ids) {
    const toToggle = new Set([].concat(ids));  // coax ids into a Set
    this._layers.forEach(layer => {
      if (toToggle.has(layer.id)) {
        layer.enabled = !layer.enabled;
      }
    });
    this.emit('layerchange');
    return this;
  }


  only(ids) {
    const toEnable = new Set([].concat(ids));  // coax ids into a Set
    this._layers.forEach(layer => {
      layer.enabled = toEnable.has(layer.id);
    });
    this.emit('layerchange');
    return this;
  }

}
