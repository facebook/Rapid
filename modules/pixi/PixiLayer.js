import * as PIXI from 'pixi.js';


/**
 * PixiLayer is the base class from which all layers inherit
 * It creates a container to hold the layer data.
 *
 * Properties you can access:
 *  `container`  PIXI.Container() contains the display objects for this layer
 *  `supported`  Is this layer supported? (i.e. do we even show it in lists?)
 *  `zIndex`     Where this layer sits compared to other layers
 *  `enabled`    Whether the the user has chosen to see the layer
 *  `visible`    Whether the layer's data is currently visible  (many layers become invisible at lower zooms)
 *
 * @class
 */
export class PixiLayer {

  /**
   * @constructor
   * @param context
   * @param layerID
   * @param layerZ
   */
  constructor(context, layerID, layerZ) {
    this.context = context;

    this._enabled = false;  // whether the user has chosen to see the layer

    // Create layer container
    const container = new PIXI.Container();
    container.name = layerID;
    container.zIndex = layerZ;
    container.visible = false;
    container.interactive = true;
    container.buttonMode = true;
    container.sortableChildren = true;
    context.pixi.stage.addChild(container);
    this.container = container;
  }

  /**
   * render
   * Every layer should have a render function that manages the scene under its container
   * Override in a subclass with needed logic. It will be passed:
   *
   * @param projection - a pixi projection
   * @param zoom - the effective zoom to use for rendering
   */
  render() {
    return true;
  }

  /**
   * layer id
   */
  get id() {
    return this.container.name;
  }

  /**
   * supported
   * Is this layer supported? (i.e. do we even show it in lists?)
   * Can be overridden in a subclass with additional logic
   */
  get supported() {
    return true;
  }

  /**
   * zIndex
   * Where this layer sits compared to other layers
   */
  get zIndex() {
    return this.container.zIndex;
  }
  set zIndex(val) {
    this.container.zIndex = val;
  }

  /**
   * visible
   * Whether the layer's data is currently visible
   * (many layers become invisible at lower zooms)
   */
  get visible() {
    return this.container.visible;
  }
  set visible(val) {
    this.container.visible = val;
  }

  /**
   * enabled
   * Whether the the user has chosen to see the layer
   */
  get enabled() {
    return this._enabled;
  }
  set enabled(val) {
    this._enabled = val;
    this.visible = val;
  }

}
