import { EventEmitter } from '@pixi/utils';
import RBush from 'rbush';

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


/**
 * PixiScene
 * The "scene" maintains useful collections of Features.
 * Features are organized into layers that can be enabled or disabled if needed.
 *
 * Properties you can access:
 *   `layers`      `Array` of all layers
 *   `features`    `Map(featureID -> Feature)` of all features we know about
 *   `rbush`       `RBush` spatial index (boxes are in wgs84 [lon,lat] coords)
 *   `selected`    `Set` of hovered featureIDs
 *   `hovered`     `Set` of selected featureIDs
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

    this.features = new Map();     // Map of featureID -> Feature
    this.boxes = new Map();        // Map of featureID -> box Object (rbush uses these)
    this.rbush = new RBush();      // Spatial index (boxes are in wgs84 [lon,lat] coords)

    this.selected = new Set();     // Set of selected featureIDs
    this.selected.v = 0;           // Version counter that increments as the selection changes
    this.hovered = new Set();      // Set of hovered featureIDs
    this.hovered.v = 0;            // Version counter that increments as the hover changes

    this.layers = [
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
    ];

  }


  /**
   * render
   * Calls each Layer's `render` method.
   * @param  frame        Integer frame being rendered
   * @param  projection   Pixi projection to use for rendering
   * @param  zoom         Effective zoom to use for rendering
   */
  render(frame, projection, zoom) {
    for (const layer of this.layers) {
      layer.render(frame, projection, zoom);
    }
  }


  /**
   * getLayer
   * Get a Layer by its layerID
   * @param   layerID  `String` id of a Layer
   * @return  The Layer with the given id or `undefined` if not found
   */
  getLayer(layerID) {
    return this.layers.find(layer => layer.id === layerID);
  }


  /**
   * enableLayers
   * Enables the layers with the given layerIDs, other layers will not be affected
   * @param  ids  A `Set` or `Array` of layerIDs, or single `String` layerID
   */
  enableLayers(ids) {
    const toEnable = new Set([].concat(ids));  // coax ids into a Set
    for (const layer of this.layers) {
      if (toEnable.has(layer.id)) {
        layer.enabled = true;
      }
    }
    this.emit('layerchange');
  }


  /**
   * disableLayers
   * Disables the layers with the given layerIDs, other layers will not be affected
   * @param  ids  A `Set` or `Array` of layerIDs, or single `String` layerID
   */
  disableLayers(ids) {
    const toDisable = new Set([].concat(ids));  // coax ids into a Set
    for (const layer of this.layers) {
      if (toDisable.has(layer.id)) {
        layer.enabled = false;
      }
    }
    this.emit('layerchange');
  }


  /**
   * toggleLayers
   * Toggles the layers with the given layerIDs, other layers will not be affected
   * @param  ids  A `Set` or `Array` of layerIDs, or single `String` layerID
   */
  toggleLayers(ids) {
    const toToggle = new Set([].concat(ids));  // coax ids into a Set
    for (const layer of this.layers) {
      if (toToggle.has(layer.id)) {
        layer.enabled = !layer.enabled;
      }
    }
    this.emit('layerchange');
  }


  /**
   * onlyLayers
   * LayerIDs in the given list will be enabled, all others will be disabled
   * @param  ids  A `Set` or `Array` of layerIDs, or single `String` layerID
   */
  onlyLayers(ids) {
    const toEnable = new Set([].concat(ids));  // coax ids into a Set
    for (const layer of this.layers) {
      layer.enabled = toEnable.has(layer.id);
    }
    this.emit('layerchange');
  }


  /**
   * getFeature
   * Get a Feature by its layerID
   * @param   featureID  `String` id of a Feature
   * @return  The Feature with the given id or `undefined` if not found
   */
  getFeature(featureID) {
    return this.features.get(featureID);
  }


  /**
   * addFeature
   * Add a feature to the scene. The Feature is expected to already have an Extent.
   * @param  feature  A Feature derived from `AbstractFeature` (point, line, multipolygon)
   */
  addFeature(feature) {
    const featureID = feature.id;

    // Update the `features` cache
    this.features.set(featureID, feature);

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
   * updateFeature
   * Call this whenever a Feature's `extent` has changed.
   * @param  feature  A Feature derived from `AbstractFeature` (point, line, multipolygon)
   */
  updateFeature(feature) {
    this.addFeature(feature);  // they do the same thing
  }


  /**
   * removeFeature
   * Remove a Feature from the scene.
   * @param  feature  A Feature derived from `AbstractFeature` (point, line, multipolygon)
   */
  removeFeature(feature) {
    const featureID = feature.id;

    // Remove any existing box with this id from the rbush
    let box = this.boxes.get(featureID);
    if (box) {
      this.rbush.remove(box);
    }

    // If feature was hovered or selected, update those collections
    if (this.selected.has(featureID)) {
      this.selected.delete(featureID);
      this.selected.v++;
    }
    if (this.hovered.has(featureID)) {
      this.hovered.delete(featureID);
      this.hovered.v++;
    }

    this.boxes.delete(featureID);
    this.features.delete(featureID);
    // feature.destroy() ??
  }


  /**
   * select
   * Mark these features as `selected`
   * A few things to note:
   * - the `featureID` may not exist in the scene yet
   *   (for example, a new point that hasn't yet been rendered)
   * - `featureIDs` should contain the complete list of featureIDs to select.
   *   (in other words, anything not in this list will get unselected)
   * @param  featureIDs   `Array` or `Set` of feature IDs to select
   */
  selectFeatures(featureIDs) {
    const toSelect = new Set([].concat(featureIDs));  // coax ids into a Set
    let didChange = false;

    // Remove select where not needed
    for (const featureID of this.selected) {
      if (toSelect.has(featureID)) continue;   // it should stay selected

      this.selected.delete(featureID);
      didChange = true;

      const feature = this.features.get(featureID);
      if (feature) {
        feature.selected = false;
      }
    }

    // Add select where needed
    for (const featureID of toSelect) {
      if (this.selected.has(featureID)) continue;   // it's already selected

      this.selected.add(featureID);
      didChange = true;

      const feature = this.features.get(featureID);
      if (feature) {
        feature.selected = true;
      }
    }

    if (didChange) {
      this.selected.v++;
    }
  }


  /**
   * hover
   * Mark these features as `hovered` if they are in the scene.
   * A few things to note:
   * - the `featureID` may not exist in the scene yet
   *   (for example, a new point that hasn't yet been rendered)
   * - `featureIDs` should contain the complete list of featureIDs to hover.
   *   (in other words, anything not in this list will get unhovered)
   * @param  featureIDs   `Array` or `Set` of feature IDs to hover
   */
  hoverFeatures(featureIDs) {
    const toHover = new Set([].concat(featureIDs));  // coax ids into a Set
    let didChange = false;

    // Remove hover where not needed
    for (const featureID of this.hovered) {
      if (toHover.has(featureID)) continue;   // it should stay hovered

      this.hovered.delete(featureID);
      didChange = true;

      const feature = this.features.get(featureID);
      if (feature) {
        feature.hovered = false;
      }
    }

    // Add hover where needed
    for (const featureID of toHover) {
      if (this.hovered.has(featureID)) continue;   // it's already hovered

      this.hovered.add(featureID);
      didChange = true;

      const feature = this.features.get(featureID);
      if (feature) {
        feature.hovered = true;
      }
    }

    if (didChange) {
      this.hovered.v++;
    }
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
    const toDirty = new Set([].concat(layerIDs));  // coax ids into a Set
    for (const layer of this.layers) {
      if (toDirty.has(layer.id)) {
        layer.dirtyLayer();
      }
    }
  }


  /**
   * dirtyFeatures
   * Mark specific features features as `dirty`
   * During the next "app" pass, dirty features will be rebuilt.
   * @param  featureIDs  A `Set` or `Array` of featureIDs
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
