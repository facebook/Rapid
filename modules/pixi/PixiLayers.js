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
   * @param  scene   The Scene that owns these Layers
   */
  constructor(scene) {
    super();
    this.scene = scene;
    this.context = scene.context;

    this._layers = [
      new PixiLayerBackgroundTiles(scene, 1),

      new PixiLayerOsm(scene, 5),
      new PixiLayerRapid(scene, 6),

      new PixiLayerCustomData(scene, 8),
      new PixiLayerOsmNotes(scene, 10),
      new PixiLayerImproveOsm(scene, 11),
      new PixiLayerKeepRight(scene, 12),
      new PixiLayerOsmose(scene, 13),

      new PixiLayerMapillaryPhotos(scene, 20),
      new PixiLayerMapillaryFeatures(scene, 21),
      new PixiLayerMapillarySigns(scene, 22),
      new PixiLayerKartaPhotos(scene, 25),
      new PixiLayerStreetsidePhotos(scene, 26),

      new PixiLayerLabels(scene, 30),

      new PixiLayerEditBlocks(scene, 90),
      new PixiLayerMapUI(scene, 99)
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
