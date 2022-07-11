import RBush from 'rbush';

/**
 * PixiScene
 * The "scene" maintains useful collections of Features.
 *
 * Properties you can access:
 *   `features`    `Map` of all features we know about
 *   `rbush`       `RBush` spatial index (boxes are in wgs84 [lon,lat] coords)
 *   `selected`    `Set` of hovered featureIDs
 *   `selectTick`   counter that increments as the selection changes
 *   `hovered`     `Set` of selected featureIDs
 *   `hoverTick`    counter that increments as the hover changes
 */
export class PixiScene {

  /**
   * @constructor
   * @param  context  Global shared application context
   */
  constructor(context) {
    this.context = context;

    this.features = new Map();     // Map of featureID -> Feature
    this.boxes = new Map();        // Map of featureID -> box Object (rbush uses these)
    this.rbush = new RBush();      // Spatial index (boxes are in wgs84 [lon,lat] coords)

    this.selected = new Set();     // Set of selected featureIDs
    this.selectTick = 0;

    this.hovered = new Set();      // Set of hovered featureIDs
    this.hoverTick = 0;
  }


  /**
   * get
   * Get a feature by its featureID
   * @param  featureID  `String` id of a Feature
   */
  get(featureID) {
    return this.features.get(featureID);
  }


  /**
   * add
   * Add a feature to the scene. The Feature is expected to already have an Extent.
   * @param  feature  A feature derived from `AbstractFeature` (point, line, multipolygon)
   */
  add(feature) {
    const featureID = feature.id;

    // Update the `features` cache
    this.features.set(featureID, feature);

    // If feature is hovered or selected, update those collections
    if (feature.hovered && !this.hovered.has(featureID)) {
      this.hovered.add(featureID);
      this.hoverTick++;
    } else if (!feature.hovered && this.hovered.has(featureID)) {
      this.hovered.delete(featureID);
      this.hoverTick++;
    }

    if (feature.selected && !this.selected.has(featureID)) {
      this.selected.add(featureID);
      this.selectTick++;
    } else if (!feature.selected && this.selected.has(featureID)) {
      this.selected.delete(featureID);
      this.selectTick++;
    }

    // Update RBush spatial index (feature must have an extent)
    let box = this.boxes.get(featureID);
    if (box) {
      this.rbush.remove(box);
    }
    if (feature.extent) {
      box = feature.extent.bbox();
      box.id = featureID;
      this.boxes.set(box);
      this.rbush.insert(box);
    }
  }


  /**
   * update
   * Call this whenever a feature's `extent` has changed.
   * @param  feature  A feature derived from `AbstractFeature` (point, line, multipolygon)
   */
  update(feature) {
    this.add(feature);  // they do the same thing
  }


  /**
   * remove
   * Remove a feature from the scene.
   * @param  feature  A feature derived from `AbstractFeature` (point, line, multipolygon)
   */
  remove(feature) {
    const featureID = feature.id;

    // Remove any existing box with this id from the rbush
    let box = this.boxes.get(featureID);
    if (box) {
      this.rbush.remove(box);
    }

    // If feature was hovered or selected, update those collections
    if (this.selected.has(featureID)) {
      this.selected.delete(featureID);
      this.selectTick++;
    }
    if (this.hovered.has(featureID)) {
      this.hovered.delete(featureID);
      this.hoverTick++;
    }

    this.boxes.delete(featureID);
    this.features.delete(featureID);
    // feature.destroy() ??
  }


  /**
   * select
   * Mark these features as `selected` if they are in the scene.
   * Note that `featureIDs` should contain the complete list of featureIDs to select.
   * (in other words, anything not in this list will get unselected)
   * @param  featureIDs   `Array` or `Set` of feature IDs to select
   */
  select(featureIDs) {
    const toSelect = new Set([].concat(featureIDs));  // coax ids into a Set
    let didChange = false;

    // Remove select where not needed
    for (const featureID of this.selected) {
      const feature = this.features.get(featureID);
      if (!feature) continue;                  // not in the scene?
      if (toSelect.has(featureID)) continue;   // it should stay selected

      this.selected.delete(featureID);
      feature.selected = false;
      didChange = true;
    }

    // Add select where needed
    for (const featureID of toSelect) {
      const feature = this.features.get(featureID);
      if (!feature) continue;                       // not in the scene?
      if (this.selected.has(featureID)) continue;   // it's already selected

      this.selected.add(featureID);
      feature.selected = true;
      didChange = true;
    }

    if (didChange) {
      this.selectTick++;
    }
  }


  /**
   * hover
   * Mark these features as `hovered` if they are in the scene.
   * Note that `featureIDs` should contain the complete list of featureIDs to hover.
   * (in other words, anything not in this list will get unhovered)
   * @param  featureIDs   `Array` or `Set` of feature IDs to hover
   */
  hover(featureIDs) {
    const toHover = new Set([].concat(featureIDs));  // coax ids into a Set
    let didChange = false;

    // Remove hover where not needed
    for (const featureID of this.hovered) {
      const feature = this.features.get(featureID);
      if (!feature) continue;                  // not in the scene?
      if (toHover.has(featureID)) continue;   // it should stay hovered

      this.hovered.delete(featureID);
      feature.hovered = false;
      didChange = true;
    }

    // Add hover where needed
    for (const featureID of toHover) {
      const feature = this.features.get(featureID);
      if (!feature) continue;                       // not in the scene?
      if (this.hovered.has(featureID)) continue;    // it's already hovered

      this.hovered.add(featureID);
      feature.hovered = true;
      didChange = true;
    }

    if (didChange) {
      this.hoverTick++;
    }
  }


  /**
   * dirtyScene
   * Mark the whole scene as `dirty`, for example when changing zooms.
   * During the next "app" pass, dirty features will be rebuilt.
   */
  dirtyScene() {
    this.features.forEach(feature => feature.dirty = true);
  }


  /**
   * dirtyFeatures
   * Mark specific features features as `dirty`
   * During the next "app" pass, dirty features will be rebuilt.
   * @param  featureIDs   `Array` or `Set` of feature IDs to dirty
   */
  dirtyFeatures(featureIDs) {
    (featureIDs || []).forEach(featureID => {
      const feature = this.features.get(featureID);
      if (feature) {
        feature.dirty = true;
      }
    });
  }

}
