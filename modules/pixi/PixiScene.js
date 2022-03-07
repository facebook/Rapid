import RBush from 'rbush';

/**
 * PixiScene
 * Keeps track of everything in the scene, manages its statistics
 *
 * @class
 */
export class PixiScene {

  /**
   * @constructor
   * @param context
   */
  constructor(context) {
    this.context = context;

    this._boxes = new Map();       // Map of feature ID -> box Object (rbush uses these)
    this._features = new Map();    // Map of feature ID -> PixiFeature
    this._rbush = new RBush();     // Spatial index (boxes are in wgs84 [lon,lat] coords)
  }

  /**
   * Get a feature by its featureID
   * @param featureID - `String` id
   */
  get(featureID) {
    return this._features.get(featureID);
  }


  /**
   * Call this to add a feature to the scene
   * Feature is expected to already have an Extent
   * @param feature - A `PixiFeature`
   */
  add(feature) {
    const featureID = feature.id;

    // Insert into feature cache
    this._features.set(featureID, feature);

    // Remove any existing box with this id from the rbush
    let box = this._boxes.get(featureID);
    if (box) {
      this._rbush.remove(box);
    }

    // Calculate box and insert into rbush
    box = feature.extent.bbox();
    box.id = featureID;
    this._boxes.set(box);
    this._rbush.insert(box);
  }


  /**
   * Call this whenever a feature's `extent` has changed
   * @param feature - A `PixiFeature`
   */
  update(feature) {
    this.add(feature);  // they do the same thing
  }


  /**
   * Remove a feature from the scene
   * @param feature - A `PixiFeature`
   */
  remove(feature) {
    const featureID = feature.id;

    // Remove any existing box with this id from the rbush
    let box = this._boxes.get(featureID);
    if (box) {
      this._rbush.remove(box);
    }
    this._boxes.delete(featureID);
    this._features.delete(featureID);
  }


  /**
   * Reset everything
   */
  reset() {
    this._rbush.clear();
    this._boxes.clear();
    this._features.clear();
  }

}
