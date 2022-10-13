import * as PIXI from 'pixi.js';
import { Extent } from '@id-sdk/math';


/**
 * AbstractFeature is the base class from which all Features inherit.
 * It contains properties that used to manage the Feature in the scene graph
 *
 * Properties you can access:
 *   `container`      PIXI.Container() that contains all the graphics for this Feature
 *   `id`             Unique string to use for the name of this Feature
 *   `type`           String describing what kind of Feature this is ('point', 'line', 'multipolygon')
 *   `geometry`       Array containing geometry info
 *   `style`          Object containing style info
 *   `data`           Data bound to this Feature (like `__data__` from the D3.js days)
 *   `related`        Data related to this Feature (usually the parent)
 *   `label`          String containing the Feature's label (if any)
 *   `parent`         PIXI.Container() for the parent - this Feature's container will be added to it.
 *   `visible`        `true` if the Feature is visible (`false` if it is culled)
 *   `interactive`    `true` if the Feature is interactive (emits Pixi events)
 *   `dirty`          `true` if the Feature needs to be rebuilt
 *   `selected`       `true` if the Feature is selected
 *   `hovered`        `true` if the Feature is hovered
 *   `v`              Version of the Feature, can be used to detect changes
 *   `lod`            Level of detail for the Feature last time it was styled (0 = off, 1 = simplified, 2 = full)
 *   `halo`           A PIXI.DisplayObject() that contains the graphics for the Feature's halo (if it has one)
 *   `extent`         Bounds of the Feature (in WGS84 long/lat)
 *   `localBounds`    PIXI.Rectangle() where 0,0 is the origin of the Feature
 *   `sceneBounds`    PIXI.Rectangle() where 0,0 is the origin of the scane
 */


export class AbstractFeature {
  /**
   * @constructor
   * @param  layer    The Layer that owns this Feature
   * @param  id       Unique string to use for the name of this Feature
   */
  constructor(layer, id) {
    const container = new PIXI.Container();
    this.container = container;

    container.__feature__ = this;   // Link the container back to `this`
    container.name = id;
    container.sortableChildren = false;
    container.visible = true;

    // By default, make the Feature interactive
    container.buttonMode = true;
    container.interactive = true;
    container.interactiveChildren = true;

    this.type = 'unknown';
    this.layer = layer;
    this.scene = layer.scene;
    this.renderer = layer.renderer;
    this.context = layer.context;
    this.data = null;
    this.related = null;
    this.v = -1;
    this.lod = 2;   // full detail
    this.halo = null;

    this._geometry = null;
    this._geometryDirty = true;
    this._style = null;
    this._styleDirty = true;
    this._label = null;
    this._labelDirty = true;

    this._selected = false;
    this._hovered = false;
    this._drawing = false;

    // We will manage our own bounds for now because we can probably do this
    // faster than Pixi's built in bounds calculations.
    this.extent = new Extent();                // in WGS84 coordinates ([0,0] is null island)
    this.localBounds = new PIXI.Rectangle();   // where 0,0 is the origin of the object
    this.sceneBounds = new PIXI.Rectangle();   // where 0,0 is the origin of the scene
  }


  /**
   * destroy
   * Every Feature should have a destroy function that frees all the resources
   * Do not use the Feature after calling `destroy()`.
   */
  destroy() {
    // Destroying a container removes it from its parent automatically
    // We also remove the children too
    this.container.filters = null;
    this.container.__feature__ = null;
    this.container.destroy({ children: true });
    this.container = null;

    this.layer = null;
    this.scene = null;
    this.renderer = null;
    this.context = null;
    this.data = null;
    this.related = null;

    if (this.halo) {
      this.halo.destroy({ children: true });
      this.halo = null;
    }

    this._geometry = null;
    this._style = null;
    this._label = null;

    this.extent = null;
    this.localBounds = null;
    this.sceneBounds = null;
  }


  /**
   * update
   * Every Feature should have an update function that redraws the Feature at the given projection and zoom.
   * When the Feature is updated, its `dirty` flags should be set to `false`.
   * Override in a subclass with needed logic. It will be passed:
   *
   * @param  projection  Pixi projection to use for rendering
   * @param  zoom        Effective zoom to use for rendering
   */
  update() {
    if (!this.dirty) return;  // no change

    this._geometryDirty = false;
    this._styleDirty = false;
    // The labeling code will decide what to do with the `_labelDirty` flag
  }


  /**
   * Feature id
   */
  get id() {
    return this.container.name;
  }


  /**
   * visible
   * Whether the Feature is currently visible
   */
  get visible() {
    return this.container.visible;
  }
  set visible(val) {
    if (this.container.visible !== val) {
      this.container.visible = val;
      this.updateHalo();
      this._labelDirty = true;
    }
  }


  /**
   * interactive
   * Whether the Feature is currently interactive
   */
  get interactive() {
    return this.container.interactive;
  }
  set interactive(val) {
    if (this.container.interactive !== val) {
      this.container.buttonMode = val;
      this.container.interactive = val;
      this.container.interactiveChildren = val;
    }
  }

  /**
   * dirty
   * Whether the Feature needs to be rebuilt
   */
  get dirty() {
    // The labeling code will decide what to do with the `_labelDirty` flag
    return this._geometryDirty || this._styleDirty;
  }
  set dirty(val) {
    this._geometryDirty = val;
    this._styleDirty = val;
    this._labelDirty = val;
  }


  /**
   * hovered
   * @param  val  `true` to make the Feature hovered
   */
  get hovered() {
    return this._hovered;
  }
  set hovered(val) {
    if (this._hovered !== val) {
      this._hovered = val;
      this._styleDirty = true;
    }
  }


  /**
   * selected
   * @param  val  `true` to make the Feature selected
   */
  get selected() {
    return this._selected;
  }
  set selected(val) {
    if (this._selected !== val) {
      this._selected = val;
      this._styleDirty = true;
    }
  }

  /**
   * drawing
   * @param  val  `true` to make the Feature drawing
   */
  get drawing() {
    return this._drawing;
  }
  set drawing(val) {
    if (this._drawing !== val) {
      this._drawing = val;
      this._styleDirty = true;
    }
  }

  /**
   * geometry
   * @param  arr  Geometry `Array` (contents depends on the Feature type)
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
   * @param  obj  Style `Object` (contents depends on the Feature type)
   *
   * 'point' - see AbstractFeaturePoint.js
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
   * label
   * @param  str  String containing the label to use
   */
  get label() {
    return this._label;
  }
  set label(str) {
    if (this._label !== str) {
      this._label = str;
      this._labelDirty = true;
    }
  }


  /**
   * parent
   * @param  val  PIXI.Container() for the parent - this Feature's container will be added to it.
   */
  get parent() {
    return this.container.parent;
  }
  set parent(val) {
    const currParent = this.container.parent;
    if (val && val !== currParent) {   // put this feature under a different parent container
      this.container.setParent(val);
    } else if (!val && currParent) {   // remove this feature from its parent container
      currParent.removeChild(this.container);
    }
  }

}
