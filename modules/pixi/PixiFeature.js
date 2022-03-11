import * as PIXI from 'pixi.js';
import { Extent } from '@id-sdk/math';


/**
 * PixiFeature is the base class from which all features inherit
 * It contains properties that used to manage the feature in the scene graph
 *
 * Properties you can access:
 *   `dirty`
 *   `displayObject`
 *   `geometry`
 *   `style`
 *   `extent`
 *   `localBounds`
 *   `sceneBounds`
 *
 * @class
 */
export class PixiFeature {

  /**
   * @constructor
   * @param `displayObject` Root Pixi display object for the feature (can be a Graphic, Container, Sprite, etc)
   */
  constructor(displayObject) {
    this.displayObject = displayObject;

    this.type = 'unknown';
    this._k = null;          // The projection scale at which the feature was last computed
    this._geometry = null;
    this._geometryDirty = true;
    this._style = null;
    this._styleDirty = true;

    // We will manage our own bounds for now because we can probably do this
    // faster than Pixi's built in bounds calculations.
    this.extent = new Extent();                // in WGS84 coordinates ([0,0] is null island)
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
    // when scale changes, geometry must be reprojected
    const k = projection.scale();
    if (this._k !== k) {
      this._geometryDirty = true;
    }

    if (!this._geometryDirty && !this._styleDirty && this._k === k) return;  // no change

    this._geometryDirty = false;
    this._styleDirty = false;
    this._k = k;
  }

  /**
   * needsUpdate
   * @param projection - a pixi projection
   */
  needsUpdate(projection) {
    const k = projection.scale();
    return (this._geometryDirty || this._styleDirty || this._k !== k);
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


  /**
   * dirty
   * Whether the feature needs to be rebuilt
   */
  get dirty() {
    return this._geometryDirty || this._styleDirty;
  }
  set dirty(val) {
    this._geometryDirty = val;
    this._styleDirty = val;
  }


  /**
   * geometry
   * @param arr   Geometry `Array` (contents depends on the feature type)
   *
   * 'point' - Single wgs84 coordinate
   *    [lon, lat]
   *
   * 'line' - Array of coordinates
   *    [ [lon, lat], [lon, lat],  … ]
   *
   * 'multipolygon' - Array of Arrays of Arrays
   *   [
   *     [                                  // polygon 1
   *       [ [lon, lat], [lon, lat], … ],   // outer ring
   *       [ [lon, lat], [lon, lat], … ],   // inner rings
   *       …
   *     ],
   *     [                                  // polygon 2
   *       [ [lon, lat], [lon, lat], … ],   // outer ring
   *       [ [lon, lat], [lon, lat], … ],   // inner rings
   *       …
   *     ],
   *     …
   *   ]
   */
  get geometry() {
    return this._geometry;
  }
  set geometry(arr) {
    this._geometry = arr;
    this._geometryDirty = true;
  }

  /**
   * style
   * @param obj   Style `Object` (contents depends on the feature type)
   *
   * 'point' - see PixiFeaturePoint.js
   * 'line'/'multipolygon' - see styles.js
   */
  get style() {
    return this._style;
  }
  set style(obj) {
    this._style = obj;
    this._styleDirty = true;
  }

}
