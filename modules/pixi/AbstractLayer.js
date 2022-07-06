import * as PIXI from 'pixi.js';


/**
 * AbstractLayer is the base class from which all layers inherit.
 * It creates a container to hold the layer data.
 *
 * Properties you can access:
 *   `container`    PIXI.Container() that contains all the features for this layer
 *   `id`           Unique string to use for the name of this layer
 *   `supported`    Is this layer supported? (i.e. do we even show it in lists?)
 *   `zIndex`       Where this layer sits compared to other layers
 *   `enabled`      Whether the the user has chosen to see the layer
 *   `visible`      Whether the layer's data is currently visible  (many layers become invisible at lower zooms)
 */
export class AbstractLayer {

  /**
   * @constructor
   * @param  context  Global shared application context
   * @param  id       Unique string to use for the name of this layer
   * @param  layerZ   z-index to assign to this layer's container
   * @param  parent   Optional parent container for this feature.  Should be a Pixi Stage, defaults to the main stage
   */
  constructor(context, id, layerZ, parent) {
    this.context = context;

    this._enabled = false;  // Whether the user has chosen to see the layer

    // Create layer container
    const container = new PIXI.Container();
    container.name = id;
    container.zIndex = layerZ;
    container.visible = false;
    container.sortableChildren = true;
    this.container = container;

    if (parent) {
      parent.addChild(container);
    } else {
      context.pixi.stage.addChild(container);
    }

    // For now, layers will have to keep track of their own feature visiblity
    // and implement their own feature culling and updating logic
    this.seenFeature = new Map();  // Map (feature -> timestamp)
  }


  /**
   * render
   * Every layer should have a render function that manages the scene under its container
   * Override in a subclass with needed logic. It will be passed:
   *
   * @param  timestamp    timestamp in milliseconds
   * @param  projection   pixi projection to use for rendering
   * @param  zoom         effective zoom to use for rendering
   */
  render() {
    return true;
  }


  /**
   * cull
   * Make invisible any features that were not seen during this frame
   * @param  timestamp   timestamp in milliseconds
   */
  cull(timestamp) {
    this.seenFeature.forEach((ts, feature) => {
      if (ts !== timestamp) {
        feature.visible = false;
      }
    });
  }


  /**
   * makeDirty
   * An easy way to make all the features on this layer dirty
   */
  makeDirty() {
    this.seenFeature.forEach((ts, feature) => feature.dirty = true);
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
    if (!val) {
      this.seenFeature.forEach((ts, feature) => feature.visible = false);
    }
  }

  /**
   * enabled
   * Whether the user has chosen to see the layer
   */
  get enabled() {
    return this._enabled;
  }
  set enabled(val) {
    this._enabled = val;
    this.visible = val;
    this.makeDirty();
  }

}
