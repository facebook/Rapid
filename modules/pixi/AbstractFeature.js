import * as PIXI from 'pixi.js';
import { PixiGeometry } from './PixiGeometry.js';


/**
 * AbstractFeature is the base class from which all Features inherit.
 * It contains properties that used to manage the Feature in the scene graph
 *
 * Properties you can access:
 *   `id`                Unique string to use for the name of this Feature
 *   `type`              String describing what kind of Feature this is ('point', 'line', 'polygon')
 *   `container`         PIXI.Container() that contains all the graphics needed to draw the Feature
 *   `parentContainer`   PIXI.Container() for the parent - this Feature's container will be added to it.
 *   `geometry`          PixiGeometry() class containing all the information about the geometry
 *   `style`             Object containing style info
 *   `label`             String containing the Feature's label (if any)
 *   `data`              Data bound to this Feature (like `__data__` from the D3.js days)
 *   `dataID`            Data bound to this Feature (like `__data__` from the D3.js days)
 *   `visible`           `true` if the Feature is visible (`false` if it is culled)
 *   `allowInteraction`  `true` if the Feature is allowed to be interactive (emits Pixi events)
 *   `active`            `true` if the Feature is currently being interacted with (dragged, etc)
 *   `dirty`             `true` if the Feature needs to be rebuilt
 *   `selected`          `true` if the Feature is selected
 *   `highlighted`       `true` if the Feature is highlighted
 *   `hovered`           `true` if the Feature is hovered
 *   `v`                 Version of the Feature, can be used to detect changes
 *   `lod`               Level of detail for the Feature last time it was styled (0 = off, 1 = simplified, 2 = full)
 *   `halo`              A PIXI.DisplayObject() that contains the graphics for the Feature's halo (if it has one)
 *   `sceneBounds`       PIXI.Rectangle() where 0,0 is the origin of the scene
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
    this._allowInteraction = true;
    this._active = false;
    container.eventMode = 'static';

    this.v = -1;
    this.lod = 2;   // full detail
    this.halo = null;

    this.geometry = new PixiGeometry();
    this._style = null;
    this._styleDirty = true;
    this._label = null;
    this._labelDirty = true;

    this._dataID = null;
    this._data = null;

    this._selected = false;
    this._highlighted = false;
    this._hovered = false;
    this._drawing = false;

    // We will manage our own bounds for now because we can probably do this
    // faster than Pixi's built in bounds calculations.
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

    this.geometry.destroy();
    this.geometry = null;
    this._style = null;
    this._label = null;

    this._dataID = null;
    this._data = null;

    this.sceneBounds = null;
  }


  /**
   * update
   * Every Feature should have an `update()` function that redraws the Feature at the given viewport and zoom.
   * When the Feature is updated, its `dirty` flags should be set to `false`.
   * Override in a subclass with needed logic. It will be passed:
   * @param  viewport  Pixi viewport to use for rendering
   * @param  zoom      Effective zoom to use for rendering
   * @abstract
   */
  update(viewport, zoom) {
    if (!this.dirty) return;  // nothing to do

    this.geometry.update(viewport, zoom);
    this._styleDirty = false;
    // The labeling code will decide what to do with the `_labelDirty` flag
  }


  /**
   * updateHalo
   * Every Feature should have an `updateHalo()` function that redraws any hover or select styling.
   * Override in a subclass with needed logic.
   * @abstract
   */
  updateHalo() {
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
   * allowInteraction
   * Whether the Feature is allowed to be interactive
   */
  get allowInteraction() {
    return this._allowInteraction;
  }
  set allowInteraction(val) {
    if (val === this._allowInteraction) return;  // no change
    this._allowInteraction = val;

    if (this.container) {
      this.container.eventMode = (this._allowInteraction && !this._active) ? 'static' : 'none';
    }
  }


  /**
   * isInteractive
   * Whether the Feature is currently being interacted with
   */
  get active() {
    return this._active;
  }
  set active(val) {
    if (val === this._active) return;  // no change
    this._active = val;

    if (this.container) {
      this.container.eventMode = (this._allowInteraction && !this._active) ? 'static' : 'none';
    }
  }


  /**
   * dirty
   * Whether the Feature needs to be rebuilt
   */
  get dirty() {
    // The labeling code will decide what to do with the `_labelDirty` flag
    return this.geometry.dirty || this._styleDirty;
  }
  set dirty(val) {
    this.geometry.dirty = val;
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
    this._labelDirty = true;
  }


  /**
   * highlighted
   * @param  val  `true` to make the Feature highlighted
   */
  get highlighted() {
    return this._highlighted;
  }
  set highlighted(val) {
    if (val === this._highlighted) return;  // no change
    this._highlighted = val;
    this._styleDirty = true;
    this._labelDirty = true;
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
   * style
   * @param  obj  Style `Object` (contents depends on the Feature type)
   *
   * 'point' - see AbstractFeaturePoint.js
   * 'line'/'polygon' - see styles.js
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
   * Getter only, use `setData()` to change it.
   * (because we need to know an id/key to identify the data by, and these can be anything)
   * @readonly
   */
  get data() {
    return this._data;
  }

  /**
   * dataID
   * Getter only, use `setData()` to change it.
   * (because we need to know an id/key to identify the data by, and these can be anything)
   * @readonly
   */
  get dataID() {
    return this._dataID;
  }


  /**
   * setData
   * This binds the data element to the feature, also lets the layer know about it.
   * @param   dataID   `String` identifer for this data element (e.g. 'n123')
   * @param   data     `Object` data to bind to the feature (e.g. an OSM Node)
   */
  setData(dataID, data) {
    this._dataID = dataID;
    this._data = data;
    this.layer.bindData(this.id, dataID);
    this.dirty = true;
  }

  /**
   * addChildData
   * Adds a mapping from parent data to child data.
   * @param  parentID  `String` dataID of the parent (e.g. 'r123')
   * @param  childID   `String` dataID of the child (e.g. 'w123')
   */
   addChildData(parentID, childID) {
     this.layer.addChildData(parentID, childID);
     this.dirty = true;
   }

  /**
   * clearChildData
   * Removes all child dataIDs for the given parent dataID
   * @param  parentID  `String` dataID of the parent (e.g. 'r123')
   */
   clearChildData(parentID) {
     this.layer.clearChildData(parentID);
     this.dirty = true;
   }

}
