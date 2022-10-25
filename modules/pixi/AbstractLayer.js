import * as PIXI from 'pixi.js';


// Convert a single value, an Array of values, or a Set of values.
function asSet(vals) {
  if (vals instanceof Set) return vals;
  return new Set(vals !== undefined && [].concat(vals));
}


/**
 * AbstractLayer is the base class from which all Layers inherit.
 * It creates a container to hold the Layer data.
 *
 * Notes on identifiers:
 *  - `layerID` - A unique identifier for the layer, for example 'osm'
 *    layerIDs are unique for the entire scene.
 *  - `featureID` - A unique identifier for the feature, for example 'osm-w-123-fill'
 *    featureIDs are expected to be unique across the entire scene.
 *  - `dataID` - A feature may have data bound to it, for example OSM identifier like 'w-123'
 *    dataIDs are only expected to be unique *on a given layer*
 *  - `classID` - A class identifier like 'hovered' or 'selected'
 *    classIDs are arbitrary stings
 *
 * Properties you can access:
 *   `container`    PIXI.Container() that contains all the Features for this Layer
 *   `id`           Unique string to use for the name of this Layer
 *   `supported`    Is this Layer supported? (i.e. do we even show it in lists?)
 *   `zIndex`       Where this Layer sits compared to other Layers
 *   `enabled`      Whether the the user has chosen to see the Layer
 *   `visible`      Whether the Layer's data is currently visible  (many Layers become invisible at lower zooms)
 *   `features`     `Map(featureID -> Feature)` of all features on this Layer
 *   `retained`     `Map(featureID -> Integer frame)` last seen
 */
export class AbstractLayer {

  /**
   * @constructor
   * @param  scene    The Scene that owns this Layer
   * @param  id       Unique string to use for the name of this Layer
   * @param  layerZ   z-index to assign to this Layer's container
   */
  constructor(scene, id, layerZ) {
    this.scene = scene;
    this.renderer = scene.renderer;
    this.context = scene.context;

    this._enabled = false;  // Whether the user has chosen to see the layer

    // Create Layer container, add to this renderer's root
    const container = new PIXI.Container();
    container.name = id;
    container.zIndex = layerZ;
    container.visible = false;
    container.sortableChildren = true;
    this.container = container;
    this.renderer.stage.addChild(container);

    // Collection of Features on this Layer
    this.features = new Map();     // Map (featureID -> Feature)
    this.retained = new Map();     // Map (featureID -> frame last seen)

    // Collections of Data on this Layer
    // There is a one-to-many relationship between Data and Features.
    // These lookups capture which features are bound to which data.
    this._dataFeature = new Map();    // Map (dataID -> Set(featureID))
    this._featureData = new Map();    // Map (featureID -> dataID)

    // Data mapped to Data
    // There is a one-to-many relationship between parent data and child data.
    // For example, we need this to know which ways make up a multipolygon relation.
    // Here we're just keeping track of the dataIDs of the direct descendents.
    this._dataChildren = new Map();    // Map (parent dataID -> Set(child dataID))

    // Data classes are strings (like what CSS classes used to do for us).
    // Currently supported "selected", "hovered", "drawing"
    // Can set other ones but it won't do anything (but won't break anything either)
    // Counterintuitively, the Layer needs to be the source of truth for these data classes,
    // because a Feature can be "selected" or "drawing" even before it has been created.
    this._dataClass = new Map();     // Map (dataID -> Set(String))
    this._classData = new Map();     // Map (String -> Set(dataID))
  }


  /**
   * render
   * Every Layer should have a render function that manages the Features in view.
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
   * @param  frame   Integer frame being rendered
   */
  cull(frame) {
    for (const [featureID, feature] of this.features) {
      const seenFrame = this.retained.get(featureID);
      if (seenFrame === frame) continue;

      // Can't see it currently, make it invisible
      feature.visible = false;

      // Haven't seen it in a while, remove completely
      if (frame - seenFrame > 20) {
        feature.destroy();
      }
    }
  }


  /**
   * getFeature
   * Get a Feature by its featureID
   * @param   featureID  `String` id of a Feature
   * @return  The Feature with the given id or `undefined` if not found
   */
  getFeature(featureID) {
    return this.features.get(featureID);
  }


  /**
   * addFeature
   * Add a feature to the layer cache.
   * @param  feature  A Feature derived from `AbstractFeature` (point, line, multipolygon)
   */
  addFeature(feature) {
    this.features.set(feature.id, feature);
  }


  /**
   * removeFeature
   * Remove a Feature from the layer cache.
   * @param  feature  A Feature derived from `AbstractFeature` (point, line, multipolygon)
   */
  removeFeature(feature) {
    this.unbindData(feature.id);
    this.retained.delete(feature.id);
    this.features.delete(feature.id);
  }


  /**
   * retainFeature
   * Retain the feature for the given frame.
   * Features that are not retained may be automatically culled (made invisible) or removed.
   * @param  feature   A Feature derived from `AbstractFeature` (point, line, multipolygon)
   * @param  frame     Integer frame being rendered
   */
  retainFeature(feature, frame) {
    if (feature.lod > 0) {
      feature.visible = true;
    }
    // If it's in the user's view, retain it regardless of whether it's actually visible.
    // We want to avoid continuously creating invisible things just to dispose of them a few frames later.
    // For example points when zoomed out far.
    this.retained.set(feature.id, frame);
  }


  /**
   * syncFeatureClasses
   * Set the feature's various state properties (e.g. selected, hovered, etc.)
   * Counterintuitively, the Layer needs to be the source of truth for these properties,
   * because a Feature can be "selected" or "drawing" even before it has been created.
   *
   * Setting these state properties may dirty the feature if the it causes the state to change.
   * Therefore this should be called after the Feature has been created but before any updates happen.
   *
   * @param  feature   A Feature derived from `AbstractFeature` (point, line, multipolygon)
   */
  syncFeatureClasses(feature) {
    const featureID = feature.id;
    const dataID = this._featureData.get(featureID);
    if (!dataID) return;

    const activeData = this.context.activeData();
    feature.interactive = !activeData.has(dataID);  // is this the same as drawing??

    feature.selected = this._classData.get('selected')?.has(dataID);
    feature.hovered = this._classData.get('hovered')?.has(dataID);
    feature.drawing = this._classData.get('drawing')?.has(dataID);
  }


  /**
   * bindData
   * Adds (or replaces) a data binding from featureID to a dataID
   * @param  featureID  `String` featureID  (e.g. 'osm-w-123-fill')
   * @param  dataID     `String` dataID     (e.g. 'w-123')
   */
  bindData(featureID, dataID) {
    this.unbindData(featureID);

    let featureIDs = this._dataFeature.get(dataID);   // one-to-many data-to-features
    if (!featureIDs) {
      featureIDs = new Set();
      this._dataFeature.set(dataID, featureIDs);
    }
    featureIDs.add(featureID);

    this._featureData.set(featureID, dataID);   // reverse feature-to-data
  }


  /**
   * unbindData
   * Removes the data bindings for a given featureID
   * @param  featureID  `String` featureID  (e.g. 'osm-w-123-fill')
   */
  unbindData(featureID) {
    const dataID = this._featureData.get(featureID);
    if (!dataID) return;

    const featureIDs = this._dataFeature.get(dataID);   // one-to-many data-to-features
    if (featureIDs) {
      featureIDs.delete(featureID);

      if (!featureIDs.size) {  // no features are bound to this data anymore
        this._dataFeature.delete(dataID);
        this._dataChildren.delete(dataID);
        // Note that we don't touch the data classes here..
        // If a selected feature leaves the scene and comes back later, it's still selected!
      }
    }

    this._featureData.delete(featureID);   // reverse feature-to-data
  }


  /**
   * addChildData
   * This adds a mapping from parent data to child data.
   * @param  parentID  `String` dataID of the parent (e.g. 'r123')
   * @param  childID   `String` dataID of the child (e.g. 'w123')
   */
  addChildData(parentID, childID) {
    let childIDs = this._dataChildren.get(parentID);   // one-to-many parent-to-children
    if (!childIDs) {
      childIDs = new Set();
      this._dataChildren.set(parentID, childIDs);
    }
    childIDs.add(childID);
  }


  /**
   * removeChildData
   * Removes mapping from parent data to child data.
   * @param  parentID  `String` dataID (e.g. 'r123')
   * @param  childID   `String` dataID to remove as a child (e.g. 'w1')
   */
  removeChildData(parentID, childID) {
    this._dataChildren.get(parentID)?.delete(childID);
  }


  /**
   * clearChildData
   * Removes all child dataIDs for the given parent dataID
   * @param  parentID  `String` dataID (e.g. 'r123')
   */
  clearChildData(parentID) {
    this._dataChildren.delete(parentID);
  }


  /**
   * addDataClass
   * Sets a dataID as being classed a certain way (e.g. 'hovered')
   * @param  dataID   `String` dataID (e.g. 'r123')
   * @param  classID  `String` classID (e.g. 'hovered')
   */
  addDataClass(dataID, classID) {
    let classIDs = this._dataClass.get(dataID);
    if (!classIDs) {
      classIDs = new Set();
      this._dataClass.set(dataID, classIDs);
    }
    classIDs.add(classID);

    let dataIDs = this._classData.get(classID);
    if (!dataIDs) {
      dataIDs = new Set();
      this._classData.set(classID, dataIDs);
    }
    dataIDs.add(dataID);
  }


  /**
   * removeDataClass
   * Unsets a dataID from being classed a certain way (e.g. 'hovered')
   * @param  dataID   `String` dataID (e.g. 'r123')
   * @param  classID  `String` classID (e.g. 'hovered')
   */
  removeDataClass(dataID, classID) {
    let classIDs = this._dataClass.get(dataID);
    if (classIDs) {
      classIDs.delete(classID);
      if (!classIDs.size) {
        this._dataClass.delete(dataID);
      }
    }

    let dataIDs = this._classData.get(classID);
    if (dataIDs) {
      dataIDs.delete(dataID);
      if (!dataIDs.size) {
        this._classData.delete(classID);
      }
    }
  }


  /**
   * clearDataClasses
   * Remove all classIDs for a given dataID
   * @param  dataID    `String` dataID (e.g. 'r123')
   */
  clearDataClasses(dataID) {
    const classIDs = this._dataClass.get(dataID);
    classIDs?.forEach(classID => {
      this.removeDataClass(dataID, classID);
    });
  }


  /**
   * clearClassData
   * Remove all dataIDs for a given classID
   * @param  classID   `String` classID (e.g. 'hovered')
   */
  clearClassData(classID) {
    const dataIDs = this._classData.get(classID);
    dataIDs?.forEach(dataID => {
      this.removeDataClass(dataID, classID);
    });
  }


  /**
   * dirtyLayer
   * Mark all features on this layer as `dirty`.
   * During the next "app" pass, dirty features will be rebuilt.
   */
  dirtyLayer() {
    for (const feature of this.features.values()) {
      feature.dirty = true;
    }
  }

  /**
   * dirtyFeatures
   * Mark specific features features as `dirty`
   * During the next "app" pass, dirty features will be rebuilt.
   * @param  featureIDs  A `Set` or `Array` of featureIDs, or single `String` featureID
   */
  dirtyFeatures(featureIDs) {
    for (const featureID of asSet(featureIDs)) {   // coax ids into a Set
      const feature = this.features.get(featureID);
      if (feature) {
        feature.dirty = true;
      }
    }
  }

  /**
   * dirtyData
   * Mark any features bound to a given dataID as `dirty`
   * During the next "app" pass, dirty features will be rebuilt.
   * @param  dataIDs  A `Set` or `Array` of dataIDs, or single `String` dataID
   */
  dirtyData(dataIDs) {
    for (const dataID of asSet(dataIDs)) {   // coax ids into a Set
      const featureIDs = this._dataFeature.get(dataID);
      if (featureIDs) {
        this.dirtyFeatures(featureIDs);
      }
    }
  }


  /**
   * Layer id
   * @readonly
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
    if (val === this.container.zIndex) return;  // no change
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
    if (val === this.container.visible) return;  // no change
    this.container.visible = val;
    if (!val) {
      for (const feature of this.features.values()) {
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
    if (val === this._enabled) return;  // no change
    this._enabled = val;
    this.visible = val;
    this.dirtyLayer();
  }

}
