import { PixiLayer } from './PixiLayer';

const LAYERID = 'pixiMapUI';


/**
 * PixiLayerMapUI
 * this class contains any UI elements to be 'drawn over' the map canvas, glass-panel style.
 * @class
 */
export class PixiLayerMapUI extends PixiLayer {

  /**
   * @constructor
   * @param context
   * @param scene
   * @param layerZ
   */
  constructor(context, scene, layerZ) {
    super(context, LAYERID, layerZ);
    this.scene = scene;
    this._enabled = true;   // this UI layer should be enabled by default

    // this layer doesn't actually need to be interactive
    const layer = this.container;
    layer.buttonMode = false;
    layer.interactive = false;
    layer.interactiveChildren = false;
  }
}
