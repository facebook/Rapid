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
 *
 * A note on identifiers:
 *  `layerID` - Unique identifier for the layer, for example 'osm'
 *  `dataID` - A feature may have data bound to it, for example OSM identifier like 'w-123'
 *  `featureID` - Unique identifier for the feature, for example 'osm-w-123'
 *
 * Properties you can access:
 *   `layers`      `Array` of all layers
 *   `features`    `Map(featureID -> Feature)` of all features we know about
 *   `selected`    `Set` of hovered featureIDs
 *   `hovered`     `Set` of selected featureIDs
 *   `drawing`     `Set` of drawing featureIDs
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
    this.retained = new Map();     // Map of featureID -> frame last seen

    this.selected = new Set();     // Set of selected featureIDs
    this.selected.v = 0;           // Version counter that increments as the selection changes
    this.hovered = new Set();      // Set of hovered featureIDs
    this.hovered.v = 0;            // Version counter that increments as the hover changes
    this.drawing = new Set();      // Set of featureIDs that are currently drawing
    this.drawing.v = 0;            // Version counter that increments as the drawing changes

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
   * Calls each Layer's `render` and `cull` methods
   * - `render` will create and update the objects that belong in the scene
   * - `cull` will make invisible or destroy objects that aren't in the scene anymore
   *
   * This process happens on a layer-by-layer basis for several reasons.
   * - We don't have a full picture of what all will be included in the scene until we actually
   *   call down to each layer's render method. It depends on where on the map the user is
   *   looking. This is different from a normal game where the scene is set up ahead of time.
   * - For proper label placement, we really need to cull the feature layers
   *    before we render the label layer, so we do these calls in layer order.
   *
   * @param  frame        Integer frame being rendered
   * @param  projection   Pixi projection to use for rendering
   * @param  zoom         Effective zoom to use for rendering
   */
  render(frame, projection, zoom) {
    for (const layer of this.layers) {
      layer.render(frame, projection, zoom);
      layer.cull(frame);
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
   * @param  layerIDs  A `Set` or `Array` of layerIDs, or single `String` layerID
   */
  enableLayers(layerIDs) {
    const toEnable = asSet(layerIDs);  // coax ids into a Set
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
   * @param  layerIDs  A `Set` or `Array` of layerIDs, or single `String` layerID
   */
  disableLayers(layerIDs) {
    const toDisable = asSet(layerIDs);  // coax ids into a Set
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
   * @param  layerIDs  A `Set` or `Array` of layerIDs, or single `String` layerID
   */
  toggleLayers(layerIDs) {
    const toToggle = asSet(layerIDs);  // coax ids into a Set
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
   * @param  layerIDs  A `Set` or `Array` of layerIDs, or single `String` layerID
   */
  onlyLayers(layerIDs) {
    const toEnable = asSet(layerIDs);  // coax ids into a Set
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
   * Add a feature to the scene and layer caches.
   * @param  feature  A Feature derived from `AbstractFeature` (point, line, multipolygon)
   */
  addFeature(feature) {
    const featureID = feature.id;
    const layer = feature.layer;

    this.features.set(featureID, feature);
    layer.features.set(featureID, feature);
  }


  /**
   * syncFeatureState
   * Call this to set the feature's various state properties (e.g. selected, hovered, etc.)
   *
   * Counterintuitively, the scene needs to be the source of truth for these properties,
   * because a feature can be "selected" or "drawing" even before it has been created.
   *
   * Setting these state properties may dirty the feature if the it causes the state to change.
   * Therefore this should be called after the feature has been created but before any updates happen.
   *
   * @param  feature   A Feature derived from `AbstractFeature` (point, line, multipolygon)
   */
  syncFeatureState(feature) {
    const featureID = feature.id;
    const activeData = this.context.activeData();
    feature.interactive = !activeData.has(featureID);
    feature.selected = this.selected.has(featureID);
    feature.hovered = this.hovered.has(featureID);
    feature.drawing = this.drawing.has(featureID);
  }


  /**
   * retainFeature
   * Call this to retain the feature for the given frame.
   * Features that are not retained may be automatically culled (made invisible) or removed.
   * @param  feature   A Feature derived from `AbstractFeature` (point, line, multipolygon)
   * @param  frame     Integer frame being rendered
   */
  retainFeature(feature, frame) {
    if (feature.lod > 0) {
      feature.visible = true;
      this.retained.set(feature.id, frame);
    }
  }


  /**
   * removeFeature
   * Remove a Feature from the scene.
   * @param  feature  A Feature derived from `AbstractFeature` (point, line, multipolygon)
   */
  removeFeature(feature) {
    const featureID = feature.id;
    const layer = feature.layer;

    layer.features.delete(featureID);
    this.retained.delete(featureID);
    this.features.delete(featureID);

    feature.destroy();
  }


  /**
   * drawingFeatures
   * Mark these featureIDs as `drawing`
   * A few things to note:
   * - the `featureID` may not exist in the scene yet
   *   (for example, a new point that hasn't yet been rendered)
   * - `featureIDs` should contain the complete list of featureIDs to put in the 'drawing' state.
   *   (in other words, anything not in this list will be styled normally, without 'drawing' consideration)
   * @param  featureIDs   `Array` or `Set` of feature IDs to draw
   */
  drawingFeatures(featureIDs) {
    const toDraw = asSet(featureIDs);  // coax ids into a Set
    let didChange = false;

    // Remove drawing status where not needed
    for (const featureID of this.drawing) {
      if (toDraw.has(featureID)) continue;   // it should stay drawing
      this.drawing.delete(featureID);
      didChange = true;
    }

    // Add drawing where needed
    for (const featureID of toDraw) {
      if (this.drawing.has(featureID)) continue;   // it's already drawing
      this.drawing.add(featureID);
      didChange = true;
    }

    if (didChange) {
      this.drawing.v++;
    }
  }



  /**
   * select
   * Mark these featureIDs as `selected`
   * A few things to note:
   * - the `featureID` may not exist in the scene yet
   *   (for example, a new point that hasn't yet been rendered)
   * - `featureIDs` should contain the complete list of featureIDs to select.
   *   (in other words, anything not in this list will get unselected)
   * @param  featureIDs   `Array` or `Set` of feature IDs to select
   */
  selectFeatures(featureIDs) {
    const toSelect = asSet(featureIDs);  // coax ids into a Set
    let didChange = false;

    // Remove select where not needed
    for (const featureID of this.selected) {
      if (toSelect.has(featureID)) continue;   // it should stay selected
      this.selected.delete(featureID);
      didChange = true;
    }

    // Add select where needed
    for (const featureID of toSelect) {
      if (this.selected.has(featureID)) continue;   // it's already selected
      this.selected.add(featureID);
      didChange = true;
    }

    if (didChange) {
      this.selected.v++;
    }
  }


  /**
   * hover
   * Mark these featureIDs as `hovered`
   * A few things to note:
   * - the `featureID` may not exist in the scene yet
   *   (for example, a new point that hasn't yet been rendered)
   * - `featureIDs` should contain the complete list of featureIDs to hover.
   *   (in other words, anything not in this list will get unhovered)
   * @param  featureIDs   `Array` or `Set` of feature IDs to hover
   */
  hoverFeatures(featureIDs) {
    const toHover = asSet(featureIDs);  // coax ids into a Set
    let didChange = false;

    // Remove hover where not needed
    for (const featureID of this.hovered) {
      if (toHover.has(featureID)) continue;   // it should stay hovered
      this.hovered.delete(featureID);
      didChange = true;
    }

    // Add hover where needed
    for (const featureID of toHover) {
      if (this.hovered.has(featureID)) continue;   // it's already hovered
      this.hovered.add(featureID);
      didChange = true;
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
    const toDirty = asSet(layerIDs);  // coax ids into a Set
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
    const toDirty = asSet(featureIDs);  // coax ids into a Set
    toDirty.forEach(featureID => {
      const feature = this.features.get(featureID);
      if (feature) {
        feature.dirty = true;
      }
    });
  }

}
