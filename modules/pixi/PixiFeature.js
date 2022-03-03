import * as PIXI from 'pixi.js';


/**
 * PixiFeature is the base class from which all features inherit
 * It contains properties that used to manage the feature in the scene graph
 *
 * Properties you can access:
 *  `dirty`
 *  `displayObject`
 *  `k`
 *  `localBounds`
 *  `sceneBounds`
 *
 * @class
 */
export class PixiFeature {

  /**
   * @constructor
   * @param displayObject - root Pixi display object for the feature
   *    (can be a Graphic, Container, Sprite, etc)
   */
  constructor(displayObject) {
    this.displayObject = displayObject;

    this.type = 'unknown';
    this.dirty = true;   // whether the feature's geometry needs to be rebuilt
    this.k = null;       // the projection scale at which the feature was last computed

    // We will manage our own bounds for now because we can probably do this
    // faster than Pixi's built in bounds calculations.
    this.localBounds = new PIXI.Rectangle();   // where 0,0 is the origin of the object
    this.sceneBounds = new PIXI.Rectangle();   // where 0,0 is the origin of the scene
  }


  /**
   * update
   * Every feature should have an update function that redraws the feature at the given projection and zoom.
   * When the feature is updated, its `dirty` flag should be set to `false`.
   * Override in a subclass with needed logic. It will be passed:
   *
   * @param projection - a pixi projection
   * @param zoom - the effective zoom to use for rendering
   */
  update(projection) {
    const k = projection.scale();
    if (!this.dirty && this.k === k) return;  // no change

    this.k = k;
    this.dirty = false;
  }


  /**
   * feature id
   */
  get id() {
    return this.displayObject.name;
  }

  /**
   * visible
   * Whether the displayObject is currently visible
   */
  get visible() {
    return this.displayObject.visible;
  }
  set visible(val) {
    this.displayObject.visible = val;
  }

}
