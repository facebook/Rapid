import * as PIXI from 'pixi.js';
import { Extent } from '@id-sdk/math';


/**
 * AbstractFeature is the base class from which all Features inherit.
 * It contains properties that used to manage the Feature in the scene graph
 *
 * Properties you can access:
 *   `id`               Unique string to use for the name of this Feature
 *   `type`             String describing what kind of Feature this is ('point', 'line', 'multipolygon')
 *   `container`        PIXI.Container() that contains all the graphics needed to draw the Feature
 *   `parentContainer`  PIXI.Container() for the parent - this Feature's container will be added to it.
 *   `geometry`         Array containing geometry info
 *   `style`            Object containing style info
 *   `label`            String containing the Feature's label (if any)
 *   `data`             Data bound to this Feature (like `__data__` from the D3.js days)
 *   `dataID`           Data bound to this Feature (like `__data__` from the D3.js days)
 *   `visible`          `true` if the Feature is visible (`false` if it is culled)
 *   `interactive`      `true` if the Feature is interactive (emits Pixi events)
 *   `dirty`            `true` if the Feature needs to be rebuilt
 *   `selected`         `true` if the Feature is selected
 *   `hovered`          `true` if the Feature is hovered
 *   `v`                Version of the Feature, can be used to detect changes
 *   `lod`              Level of detail for the Feature last time it was styled (0 = off, 1 = simplified, 2 = full)
 *   `halo`             A PIXI.DisplayObject() that contains the graphics for the Feature's halo (if it has one)
 *   `extent`           Bounds of the Feature (in WGS84 long/lat)
 *   `localBounds`      PIXI.Rectangle() where 0,0 is the origin of the Feature
 *   `sceneBounds`      PIXI.Rectangle() where 0,0 is the origin of the scane
 */
export class AbstractFeature {

  /**
   * @constructor
   * @param  layer       The Layer that owns this Feature
   * @param  featureID   Unique string to use for the name of this Feature
   */
  constructor(layer, featureID) {
    this.type = 'unknown';
    this.layer = layer;
    this.scene = layer.scene;
    this.renderer = layer.renderer;
    this.context = layer.context;
    this.featureID = featureID;

    const container = new PIXI.Container();
    this.container = container;

    container.__feature__ = this;   // Link the container back to `this`
    container.name = featureID;
    container.sortableChildren = false;
    container.visible = true;

    // By default, make the Feature interactive
    container.buttonMode = true;
    container.interactive = true;
    container.interactiveChildren = true;

    this.v = -1;
    this.lod = 2;   // full detail
    this.halo = null;

    this._geometry = null;
    this._geometryDirty = true;
    this._style = null;
    this._styleDirty = true;
    this._label = null;
    this._labelDirty = true;

    this._data = null;

    this._selected = false;
    this._hovered = false;
    this._drawing = false;

    // We will manage our own bounds for now because we can probably do this
    // faster than Pixi's built in bounds calculations.
    this.extent = new Extent();                // in WGS84 coordinates ([0,0] is null island)
    this.localBounds = new PIXI.Rectangle();   // where 0,0 is the origin of the object
    this.sceneBounds = new PIXI.Rectangle();   // where 0,0 is the origin of the scene

    this.layer.addFeature(this);
    this.scene.addFeature(this);
  }


  /**
   * destroy
   * Every Feature should have a destroy function that frees all the resources
   * Do not use the Feature after calling `destroy()`.
   */
  destroy() {
    this.layer.removeFeature(this);
    this.scene.removeFeature(this);

    // Destroying a container removes it from its parent container automatically
    // We also remove the children too
    this.container.filters = null;
    this.container.__feature__ = null;
    this.container.destroy({ children: true });
    this.container = null;

    this.layer = null;
    this.scene = null;
    this.renderer = null;
    this.context = null;

    if (this.halo) {
      this.halo.destroy({ children: true });
      this.halo = null;
    }

    this._geometry = null;
    this._style = null;
    this._label = null;
    this._data = null;

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
    if (!this.dirty) return;  // nothing to do

    this._geometryDirty = false;
    this._styleDirty = false;
    // The labeling code will decide what to do with the `_labelDirty` flag
  }


  /**
   * Feature id
   * @readonly
   */
  get id() {
    return this.featureID;
  }

  /**
   * parentContainer
   * @param  val  PIXI.Container() for the parent - this Feature's container will be added to it.
   */
  get parentContainer() {
    return this.container.parent;
  }
  set parentContainer(val) {
    const currParent = this.container.parent;
    if (val && val !== currParent) {   // put this feature under a different parent container
      this.container.setParent(val);
    } else if (!val && currParent) {   // remove this feature from its parent container
      currParent.removeChild(this.container);
    }
  }


  /**
   * visible
   * Whether the Feature is currently visible
   */
  get visible() {
    return this.container.visible;
  }
  set visible(val) {
    if (val === this.container.visible) return;  // no change
    this.container.visible = val;
    this.updateHalo();
    this._labelDirty = true;
  }


  /**
   * interactive
   * Whether the Feature is currently interactive
   */
  get interactive() {
    return this.container.interactive;
  }
  set interactive(val) {
    if (val === this.container.interactive) return;  // no change
    this.container.buttonMode = val;
    this.container.interactive = val;
    this.container.interactiveChildren = val;
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
    if (val === this._hovered) return;  // no change
    this._hovered = val;
    this._styleDirty = true;
  }


  /**
   * selected
   * @param  val  `true` to make the Feature selected
   */
  get selected() {
    return this._selected;
  }
  set selected(val) {
    if (val === this._selected) return;  // no change
    this._selected = val;
    this._styleDirty = true;
  }

  /**
   * drawing
   * @param  val  `true` to make the Feature drawing
   */
  get drawing() {
    return this._drawing;
  }
  set drawing(val) {
    if (val === this._drawing) return;  // no change
    this._drawing = val;
    this._styleDirty = true;
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
    if (str === this._label) return;  // no change
    this._label = str;
    this._labelDirty = true;
  }


  /**
   * data
   * Getter only, use `bindData` to change it.
   * (because we need to know an id/key to identify the data by, and these can be anything)
   * @readonly
   */
  get data() {
    return this._data;
  }


  /**
   * bindData
   * This binds the data element to the feature, also lets the layer know about it.
   * @param   data     `Object` data to bind to the feature (e.g. an OSM Node)
   * @param   dataID   `String` identifer for this data element (e.g. 'n123')
   */
  bindData(data, dataID) {
    this._data = data;
    this.dataID = dataID;
    this.layer.bindData(this.id, dataID);
    this.dirty = true;
  }


  /**
   * addChildData
   * This adds a mapping from parent data to child data.
   * @param  parentID  `String` dataID of the parent (e.g. 'r123')
   * @param  childID   `String` dataID of the child (e.g. 'w123')
   */
   addChildData(parentID, childID) {
     this.layer.addChildData(parentID, childID);
     this.dirty = true;
   }

}
