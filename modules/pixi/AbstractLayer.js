import * as PIXI from 'pixi.js';


/**
 * AbstractLayer is the base class from which all Layers inherit.
 * It creates a container to hold the Layer data.
 *
 * Properties you can access:
 *   `container`    PIXI.Container() that contains all the Features for this Layer
 *   `id`           Unique string to use for the name of this Layer
 *   `supported`    Is this Layer supported? (i.e. do we even show it in lists?)
 *   `zIndex`       Where this Layer sits compared to other Layers
 *   `enabled`      Whether the the user has chosen to see the Layer
 *   `visible`      Whether the Layer's data is currently visible  (many Layers become invisible at lower zooms)
 */
export class AbstractLayer {

  /**
   * @constructor
   * @param  scene    The Scene that owns this Layer
   * @param  id       Unique string to use for the name of this Layer
   * @param  layerZ   z-index to assign to this Layer's container
   * @param  parent   Optional parent container for this Layer.  Should be a Pixi Stage, defaults to the main stage
   */
  constructor(scene, id, layerZ, parent) {
    this.scene = scene;
    this.renderer = scene.renderer;
    this.context = scene.context;

    this._enabled = false;  // Whether the user has chosen to see the layer

    // Create Layer container
    const container = new PIXI.Container();
    container.name = id;
    container.zIndex = layerZ;
    container.visible = false;
    container.sortableChildren = true;
    this.container = container;

    if (parent) {
      parent.addChild(container);
    } else {
      this.context.pixi.stage.addChild(container);
    }

    // For now, Layers will have to keep track of their own Feature visiblity
    // and implement their own Feature culling and updating logic
    this.seenFeature = new Map();  // Map (Feature -> seenFrame)
  }


  /**
   * render
   * Every Layer should have a render function that manages the scene under its container
   * Override in a subclass with needed logic. It will be passed:
   * @param  frame        Integer frame being rendered
   * @param  projection   Pixi projection to use for rendering
   * @param  zoom         Effective zoom to use for rendering
   */
  render() {
  }


  /**
   * cull
   * Make invisible any Features that were not seen during the current frame
   * @param  frame    Integer frame being rendered
   */
  cull(frame) {
    for (const [feature, seenFrame] of this.seenFeature) {
      if (seenFrame !== frame) {
        feature.visible = false;
      }
      // todo - if very old, remove from scene entirely
    }
  }


  /**
   * dirtyLayer
   * An easy way to make all the Features on this Layer dirty
   */
  dirtyLayer() {
    for (const feature of this.seenFeature.keys()) {
      feature.dirty = true;
    }
  }


  /**
   * Layer id
   */
  get id() {
    return this.container.name;
  }

  /**
   * supported
   * Is this Layer supported? (i.e. do we even show it in lists?)
   * Can be overridden in a subclass with additional logic
   */
  get supported() {
    return true;
  }

  /**
   * zIndex
   * Where this Layer sits compared to other Layers
   */
  get zIndex() {
    return this.container.zIndex;
  }
  set zIndex(val) {
    this.container.zIndex = val;
  }

  /**
   * visible
   * Whether the Layer's data is currently visible
   * (many Layers become invisible at lower zooms)
   */
  get visible() {
    return this.container.visible;
  }
  set visible(val) {
    this.container.visible = val;
    if (!val) {
      for (const feature of this.seenFeature.keys()) {
        feature.visible = false;
      }
    }
  }

  /**
   * enabled
   * Whether the user has chosen to see the Layer
   */
  get enabled() {
    return this._enabled;
  }
  set enabled(val) {
    this._enabled = val;
    this.visible = val;
    this.dirtyLayer();
  }

}
