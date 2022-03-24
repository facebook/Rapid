import * as PIXI from 'pixi.js';
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
    this._enabled = false;   // this UI layer should be enabled by default
    this._loc = [];
    // this layer shouldn't be interactive out of the box-
    // in fact, The geolocate button on the right sidebar won't work if it starts out enabled!
    const layer = this.container;
    layer.buttonMode = false;
    layer.interactive = false;
    layer.interactiveChildren = false;
  }


  get geoLocation() {
    return this._location;
  }

  // This setter allows the geolocate UI to set the coordinate we need to draw.
  set geoLocation(loc) {
    this._location = loc;
  }

  /**
   * render
   * Draw the circle on the map for geolocation
   */

  render(_, projection) {
    if (this._enabled) {
      this.visible = true;

      let container = this.container.getChildByName('locator');

      if (!container) {
        container = new PIXI.Container();
        container.name = 'locator';
        const locatorCircle = new PIXI.Graphics()
          .lineStyle(1.5, 0xffffff, 1.0)
          .beginFill(0x0e60ff, 1.0)
          .drawCircle(0, 0, 6.5)
          .endFill();

        const locatorAura = new PIXI.Graphics()
          .beginFill(0xe60ff, 0.3)
          .drawCircle(0, 0, 120)
          .endFill();

        container.addChild(locatorAura, locatorCircle);
        this.container.addChild(container);
      }
      const [x, y] = projection.project([this._location.longitude, this._location.latitude]);



      this.container.x = x;
      this.container.y = y;
    } else {
      this.visible = false;
    }
  }
}
