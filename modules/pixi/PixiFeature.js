import * as PIXI from 'pixi.js';
import { Extent } from '@id-sdk/math';


/**
 * PixiFeature is the base class from which all features inherit
 * It contains properties that used to manage the feature in the scene graph
 *
 * Properties you can access:
 *   `context`
 *   `displayObject`
 *   `parent`
 *   `data`
 *   `geometry`
 *   `style`
 *   `dirty`
 *   `extent`
 *   `localBounds`
 *   `sceneBounds`
 */
export class PixiFeature {

  /**
   * @constructor
   * @param  `context`        Global shared context for iD
   * @param  `displayObject`  Root Pixi display object for this feature (can be a Graphic, Container, Sprite, etc)
   * @param  `id`             Unique string to use for the name of this feature
   * @param  `parent`         Parent container for this feature.  The display object will be added to it.
   * @param  `data`           Data to associate with this feature (like `__data__` from the D3.js days)
   */
  constructor(context, displayObject, id, parent, data) {
    this.type = 'unknown';
    this.context = context;
    this.displayObject = displayObject;
    this.parent = parent;
    this.data = data;

    if (parent) displayObject.setParent(parent);
    if (data)   displayObject.__data__ = data;

    // By default, make the display object interactive
    displayObject.name = id;
    displayObject.buttonMode = true;
    displayObject.interactive = true;
    displayObject.interactiveChildren = true;
    displayObject.sortableChildren = false;

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
   * destroy
   * Every feature should have a destroy function that frees all the resources
   * and removes the display object from the scene.
   * Do not use the feature after calling `destroy()`.
   */
  destroy() {
    // Destroying a display object removes it from its parent automatically
    // We also remove the children too
    this.displayObject.__data__ = null;
    this.displayObject.destroy({ children: true });

    this.context = null;
    this.displayObject = null;
    this.parent = null;
    this.data = null;

    this._geometry = null;
    this._style = null;

    this.extent = null;
    this.localBounds = null;
    this.sceneBounds = null;
  }


  /**
   * update
   * Every feature should have an update function that redraws the feature at the given projection and zoom.
   * When the feature is updated, its `dirty` flags should be set to `false`.
   * Override in a subclass with needed logic. It will be passed:
   *
   * @param projection - a pixi projection
   * @param zoom - the effective zoom to use for rendering
   */
  update() {
    if (!this.dirty) return;  // no change

    this._geometryDirty = false;
    this._styleDirty = false;
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

/**
 *
 * @param {*} data d3-style 'datum' bound to this feature.
 * Call this method when you need to update the data attached to a feature, such as after an edit is made.
 */
  rebind(data) {
    this.displayObject.__data__ = data;    // rebind data
    this.data = data;
  }
}
