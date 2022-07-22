import * as PIXI from 'pixi.js';
import { GlowFilter } from '@pixi/filter-glow';
import { Extent } from '@id-sdk/math';

const SELECTGLOW = new GlowFilter({ distance: 15, outerStrength: 3, color: 0xf6634f });
SELECTGLOW.resolution = 2;

const HOVERGLOW = new GlowFilter({ distance: 15, outerStrength: 3, color: 0xffff00 });
HOVERGLOW.resolution = 2;


/**
 * AbstractFeature is the base class from which all features inherit.
 * It contains properties that used to manage the feature in the scene graph
 *
 * Properties you can access:
 *   `container`      PIXI.Container() that contains all the graphics for this feature
 *   `id`             Unique string to use for the name of this feature
 *   `type`           String describing what kind of feature this is ('point', 'line', 'multipolygon')
 *   `geometry`       Array containing geometry info
 *   `style`          Object containing style info
 *   `label`          String containing the feature's label
 *   `data`           Data to associate with this feature (like `__data__` from the D3.js days)
 *   `visible`        `true` if the feature is visible (`false` if it is culled)
 *   `interactive`    `true` if the feature is interactive (emits Pixi events)
 *   `dirty`          `true` if the feature needs to be rebuilt
 *   `selected`       `true` if the feature is selected
 *   `hovered`        `true` if the feature is hovered
 *   `v`              Version of the feature, can be used to detect changes
 *   `lod`            Level of detail for the feature last time it was styled (0 = off, 1 = simplified, 2 = full)
 *   `extent`         Bounds of the feature (in WGS84 long/lat)
 *   `localBounds`    PIXI.Rectangle() where 0,0 is the origin of the feature
 *   `sceneBounds`    PIXI.Rectangle() where 0,0 is the origin of the scane
 */


export class AbstractFeature {
  /**
   * @constructor
   * @param  layer    The Layer that owns this Feature
   * @param  id       Unique string to use for the name of this feature
   * @param  parent   Parent container for this feature.  The feature's container will be added to it.
   * @param  data     Data to associate with this feature (like `__data__` from the D3.js days)
   */
  constructor(layer, id, parent, data) {
    const container = new PIXI.Container();
    this.container = container;

    container.__feature__ = this;   // Link the container back to `this`
    container.name = id;
    container.sortableChildren = false;
    container.visible = true;

    if (parent) {
      container.setParent(parent);
    }

    // By default, make the feature interactive
    container.buttonMode = true;
    container.interactive = true;
    container.interactiveChildren = true;

    this.type = 'unknown';
    this.layer = layer;
    this.scene = layer.scene;
    this.renderer = layer.renderer;
    this.context = layer.context;
    this.data = data;
    this.v = -1;
    this.lod = 2;   // full detail

    this._geometry = null;
    this._geometryDirty = true;
    this._style = null;
    this._styleDirty = true;
    this._label = null;
    this._labelDirty = true;

    this._selected = false;
    this._hovered = false;

    // We will manage our own bounds for now because we can probably do this
    // faster than Pixi's built in bounds calculations.
    this.extent = new Extent();                // in WGS84 coordinates ([0,0] is null island)
    this.localBounds = new PIXI.Rectangle();   // where 0,0 is the origin of the object
    this.sceneBounds = new PIXI.Rectangle();   // where 0,0 is the origin of the scene
  }


  /**
   * destroy
   * Every feature should have a destroy function that frees all the resources
   * Do not use the feature after calling `destroy()`.
   */
  destroy() {
    // Destroying a container removes it from its parent automatically
    // We also remove the children too
    this.container.__feature__ = null;
    this.container.destroy({ children: true });

    this.context = null;
    this.container = null;

    this._geometry = null;
    this._style = null;
    this._label = null;

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
   * updateHalo
   * Every feature should have an update function that redraws the features halo when selected or hovered
   * Override in a subclass with needed logic.
   */
  updateHalo() {
    let filters = [];
    if (this._hovered) {
      filters.push(HOVERGLOW);
    }
    if (this._selected) {
      filters.push(SELECTGLOW);
    }
    this.container.filters = filters;
  }


  /**
   * Feature id
   */
  get id() {
    return this.container.name;
  }


  /**
   * visible
   * Whether the feature is currently visible
   */
  get visible() {
    return this.container.visible;
  }
  set visible(val) {
    if (this.container.visible !== val) {
      this.container.visible = val;
      this._labelDirty = true;
    }
  }


  /**
   * interactive
   * Whether the feature is currently interactive
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
   * Whether the feature needs to be rebuilt
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
   * @param  val  `true` to make the feature hovered
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
   * @param  val  `true` to make the feature selected
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
   * geometry
   * @param  arr  Geometry `Array` (contents depends on the feature type)
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
   * @param  obj  Style `Object` (contents depends on the feature type)
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

}
