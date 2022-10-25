import { EventEmitter } from '@pixi/utils';

import { PixiLayerBackgroundTiles } from './PixiLayerBackgroundTiles';
import { PixiLayerEditBlocks } from './PixiLayerEditBlocks';
import { PixiLayerImproveOsm } from './PixiLayerImproveOsm';
import { PixiLayerKartaPhotos } from './PixiLayerKartaPhotos';
import { PixiLayerKeepRight } from './PixiLayerKeepRight';
import { PixiLayerLabels } from './PixiLayerLabels';
import { PixiLayerMapillaryFeatures } from './PixiLayerMapillaryFeatures';
import { PixiLayerMapillaryPhotos } from './PixiLayerMapillaryPhotos';
import { PixiLayerMapillarySigns } from './PixiLayerMapillarySigns';
import { PixiLayerOsm } from './PixiLayerOsm';
import { PixiLayerOsmNotes } from './PixiLayerOsmNotes';
import { PixiLayerOsmose } from './PixiLayerOsmose';
import { PixiLayerRapid } from './PixiLayerRapid';
import { PixiLayerMapUI } from './PixiLayerMapUI';
import { PixiLayerStreetsidePhotos } from './PixiLayerStreetsidePhotos';
import { PixiLayerCustomData } from './PixiLayerCustomData';


// Convert a single value, an Array of values, or a Set of values.
function asSet(vals) {
  if (vals instanceof Set) return vals;
  return new Set(vals !== undefined && [].concat(vals));
}


/**
 * PixiScene
 * The "scene" maintains useful collections of Features.
 * Features are organized into Layers that can be enabled or disabled if needed.
 * Each Layer is responsible for the data that it is for, and for the features used to render that data.
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
 *   `layers`     `Map (layerID -> Layer)` of all layers in the scene
 *   `features`   `Map (featureID -> Feature)` of all features in the scene
 *
 * Events available:
 *   `layerchange`   Fires when layers are toggled from enabled/disabled
 */
export class PixiScene extends EventEmitter {

  /**
   * @constructor
   * @param  renderer   The Renderer that owns this Scene
   */
  constructor(renderer) {
    super();
    this.renderer = renderer;
    this.context = renderer.context;

    this.features = new Map();   // Map (featureID -> Feature)
    this.layers = new Map();     // Map (layerID -> Layer)

    // Instantiate layers
    [
      new PixiLayerBackgroundTiles(this, 1),

      new PixiLayerOsm(this, 5),
      new PixiLayerRapid(this, 6),

      new PixiLayerCustomData(this, 8),
      new PixiLayerOsmNotes(this, 10),
      new PixiLayerImproveOsm(this, 11),
      new PixiLayerKeepRight(this, 12),
      new PixiLayerOsmose(this, 13),

      new PixiLayerMapillaryPhotos(this, 20),
      new PixiLayerMapillaryFeatures(this, 21),
      new PixiLayerMapillarySigns(this, 22),
      new PixiLayerKartaPhotos(this, 25),
      new PixiLayerStreetsidePhotos(this, 26),

      new PixiLayerLabels(this, 30),

      new PixiLayerEditBlocks(this, 90),
      new PixiLayerMapUI(this, 99)
    ].forEach(layer => this.layers.set(layer.id, layer));

  }


  /**
   * render
   * Calls each Layer's `render` and `cull` methods
   * - `render` will create and update the objects that belong in the scene
   * - `cull` will make invisible or destroy objects that aren't in the scene anymore
   *
   * This process happens on a layer-by-layer basis for several reasons.
   * - We don't have a full picture of what all will be included in the scene until we actually
   *   call down to each layer's render method. It depends on where on the map the user is
   *   looking. This is different from a normal game where the scene is set up ahead of time.
   * - For proper label placement, we really need to cull the feature layers
   *   before we render the label layer, so we do these calls in layer order.
   *
   * @param  frame        Integer frame being rendered
   * @param  projection   Pixi projection to use for rendering
   * @param  zoom         Effective zoom to use for rendering
   */
  render(frame, projection, zoom) {
    for (const layer of this.layers.values()) {
      layer.render(frame, projection, zoom);
      layer.cull(frame);
    }
  }


  /**
   * enableLayers
   * Enables the layers with the given layerIDs, other layers will not be affected
   * @param  layerIDs  A `Set` or `Array` of layerIDs, or single `String` layerID
   */
  enableLayers(layerIDs) {
    for (const layerID of asSet(layerIDs)) {   // coax ids into a Set
      const layer = this.layers.get(layerID);
      if (layer) {
        layer.enabled = true;
      }
    }
    this.emit('layerchange');
  }


  /**
   * disableLayers
   * Disables the layers with the given layerIDs, other layers will not be affected
   * @param  layerIDs  A `Set` or `Array` of layerIDs, or single `String` layerID
   */
  disableLayers(layerIDs) {
    for (const layerID of asSet(layerIDs)) {   // coax ids into a Set
      const layer = this.layers.get(layerID);
      if (layer) {
        layer.enabled = false;
      }
    }
    this.emit('layerchange');
  }


  /**
   * toggleLayers
   * Toggles the layers with the given layerIDs, other layers will not be affected
   * @param  layerIDs  A `Set` or `Array` of layerIDs, or single `String` layerID
   */
  toggleLayers(layerIDs) {
    for (const layerID of asSet(layerIDs)) {  // coax ids into a Set
      const layer = this.layers.get(layerID);
      if (layer) {
        layer.enabled = !layer.enabled;
      }
    }
    this.emit('layerchange');
  }


  /**
   * onlyLayers
   * LayerIDs in the given list will be enabled, all others will be disabled
   * @param  layerIDs  A `Set` or `Array` of layerIDs, or single `String` layerID
   */
  onlyLayers(layerIDs) {
    const toEnable = asSet(layerIDs);  // coax ids into a Set
    for (const layer of this.layers.values()) {
      layer.enabled = toEnable.has(layer.id);
    }
    this.emit('layerchange');
  }


  /**
   * addFeature
   * Add a feature to the scene feature cache.
   * @param  feature  A Feature derived from `AbstractFeature` (point, line, multipolygon)
   */
  addFeature(feature) {
    this.features.set(feature.id, feature);
  }


  /**
   * removeFeature
   * Remove a Feature from the scene feature cache.
   * @param  feature  A Feature derived from `AbstractFeature` (point, line, multipolygon)
   */
  removeFeature(feature) {
    this.features.delete(feature.id);
  }


  /**
   * addDataClass
   * Sets a dataID as being classed a certain way (e.g. 'hovered')
   * @param  layerID  `String` layerID (e.g. 'osm')
   * @param  dataID   `String` dataID (e.g. 'r123')
   * @param  classID  `String` classID (e.g. 'hovered')
   */
  addDataClass(layerID, dataID, classID) {
    this.layers.get(layerID)?.addDataClass(dataID, classID);
  }

  /**
   * removeDataClass
   * Unsets a dataID from being classed a certain way (e.g. 'hovered')
   * @param  layerID  `String` layerID (e.g. 'osm')
   * @param  dataID   `String` dataID (e.g. 'r123')
   * @param  classID  `String` classID (e.g. 'hovered')
   */
  removeDataClass(layerID, dataID, classID) {
    this.layers.get(layerID)?.removeDataClass(layerID, dataID, classID);
  }


  /**
   * clearDataClasses
   * Remove all classIDs for a given dataID
   * @param  layerID   `String` layerID (e.g. 'osm')
   * @param  dataID    `String` dataID (e.g. 'r123')
   */
  clearDataClasses(layerID, dataID) {
    this.layers.get(layerID)?.clearDataClasses(dataID);
  }


  /**
   * clearClassData
   * Remove all dataIDs for a given classID
   * @param  layerID   `String` layerID (e.g. 'osm')
   * @param  classID   `String` classID (e.g. 'hovered')
   */
  clearClassData(layerID, classID) {
    this.layers.get(layerID)?.clearClassData(classID);
  }


  /**
   * dirtyScene
   * Mark the whole scene as `dirty`, for example when changing zooms.
   * During the next "app" pass, dirty features will be rebuilt.
   */
  dirtyScene() {
    for (const feature of this.features.values()) {
      feature.dirty = true;
    }
  }


  /**
   * dirtyLayers
   * Mark all features on a given layer as `dirty`
   * @param  layerIDs  A `Set` or `Array` of layerIDs, or single `String` layerID
   */
  dirtyLayers(layerIDs) {
    for (const layerID of asSet(layerIDs)) {   // coax ids into a Set
      this.layers.get(layerID)?.dirtyLayer();
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
   * DataIDs are only consistent within a Layer, therefore the layerID is required here.
   * @param  layerID  `String` id of a Layer
   * @param  dataIDs  A `Set` or `Array` of dataIDs, or single `String` dataID
   */
  dirtyData(layerID, dataIDs) {
    this.layers.get(layerID)?.dirtyData(dataIDs);
  }

}
