import * as PIXI from 'pixi.js';
import { EventEmitter } from 'pixi.js';

import { PixiLayerBackgroundTiles } from './PixiLayerBackgroundTiles.js';
import { PixiLayerCustomData } from './PixiLayerCustomData.js';
import { PixiLayerEditBlocks } from './PixiLayerEditBlocks.js';
import { PixiLayerKartaPhotos } from './PixiLayerKartaPhotos.js';
import { PixiLayerKeepRight } from './PixiLayerKeepRight.js';
import { PixiLayerLabels } from './PixiLayerLabels.js';
import { PixiLayerMapillaryDetections } from './PixiLayerMapillaryDetections.js';
import { PixiLayerMapillaryPhotos } from './PixiLayerMapillaryPhotos.js';
import { PixiLayerMapillarySigns } from './PixiLayerMapillarySigns.js';
import { PixiLayerMapRoulette } from './PixiLayerMapRoulette.js';
import { PixiLayerMapUI } from './PixiLayerMapUI.js';
import { PixiLayerOsm } from './PixiLayerOsm.js';
import { PixiLayerOsmNotes } from './PixiLayerOsmNotes.js';
import { PixiLayerOsmose } from './PixiLayerOsmose.js';
import { PixiLayerRapid } from './PixiLayerRapid.js';
import { PixiLayerRapidOverlay } from './PixiLayerRapidOverlay.js';
import { PixiLayerStreetsidePhotos } from './PixiLayerStreetsidePhotos.js';
import { PixiLayerGeoScribble } from './PixiLayerGeoScribble.js';


// Convert a single value, an Array of values, or a Set of values.
function asSet(vals) {
  if (vals instanceof Set) return vals;
  return new Set(vals !== undefined && [].concat(vals));
}


/**
 * PixiScene
 * The "scene" maintains useful collections of Features.
 *
 * Features are organized into thematic Layers that can be enabled or disabled if needed.
 * Each Layer is responsible for managing its own data and Features.
 * Features must be added to an appropriate group parent container.
 *
 * Notes on identifiers:
 *  - `groupID` - A unique identifier for the group (a parent PIXI.container)
 *  - `layerID` - A unique identifier for the layer, for example 'osm'
 *  - `featureID` - A unique identifier for the feature, for example 'osm-w-123-fill'
 *  - `dataID` - A feature may have data bound to it, for example OSM identifier like 'w-123'
 *  - `classID` - A pseudoclass identifier like 'hover' or 'select'
 *
 * Properties you can access:
 *   `groups`     `Map (groupID -> PIXI.Container)` of all groups
 *   `layers`     `Map (layerID -> Layer)` of all layers in the scene
 *   `features`   `Map (featureID -> Feature)` of all features in the scene
 *
 * Events available:
 *   `layerchange`   Fires when layers are toggled from enabled/disabled
 */
export class PixiScene extends EventEmitter {

  /**
   * @constructor
   * @param  gfx   The GraphicsSystem that owns this Scene
   */
  constructor(gfx) {
    super();
    this.gfx = gfx;
    this.context = gfx.context;

    this.groups = new Map();     // Map (groupID -> PIXI.Container)
    this.layers = new Map();     // Map (layerID -> Layer)
    this.features = new Map();   // Map (featureID -> Feature)

    // Create Groups, and add them to the origin..
    // Groups are pre-established Containers that the Layers can add
    // their Features to, so that the scene can be sorted reasonably.
    [
      'background',   // Background imagery
      'basemap',      // Editable basemap (OSM/Rapid)
      'points',       // Editable points (OSM/Rapid)
      'streetview',   // Streetview imagery, sequences
      'qa',           // Q/A items, issues, notes
      'labels',       // Text labels
      'blocks',       // Blocked out regions
      'ui'            // Misc UI draw above everything (select lasso, geocoding circle, debug shapes)
    ].forEach((groupID, i) => {
      const container = new PIXI.Container();
      container.label = groupID;
      container.sortableChildren = true;
      container.zIndex = i;
      gfx.origin.addChild(container);
      this.groups.set(groupID, container);
    });

    // Create Layers
    [
      new PixiLayerBackgroundTiles(this, 'background'),
      new PixiLayerGeoScribble(this, 'geoScribble'),
      new PixiLayerOsm(this, 'osm'),
      new PixiLayerRapid(this, 'rapid'),
      new PixiLayerRapidOverlay(this, 'rapid-overlay'),

      new PixiLayerMapillaryDetections(this, 'mapillary-detections'),
      new PixiLayerMapillarySigns(this, 'mapillary-signs'),

      new PixiLayerCustomData(this, 'custom-data'),
      new PixiLayerMapRoulette(this, 'maproulette'),
      new PixiLayerOsmNotes(this, 'notes'),
      new PixiLayerKeepRight(this, 'keepRight'),
      new PixiLayerOsmose(this, 'osmose'),

      new PixiLayerMapillaryPhotos(this, 'mapillary'),
      new PixiLayerKartaPhotos(this, 'kartaview'),
      new PixiLayerStreetsidePhotos(this, 'streetside'),

      new PixiLayerLabels(this, 'labels'),
      new PixiLayerEditBlocks(this, 'edit-blocks'),
      new PixiLayerMapUI(this, 'map-ui'),
    ].forEach(layer => this.layers.set(layer.id, layer));

  }


  /**
   * reset
   * Calls each Layer's `reset' method.
   * This is used to clear out any state when a reset occurs.
   */
  reset() {
    for (const layer of this.layers.values()) {
      layer.reset();
    }
  }


  /**
   * render
   * Calls each Layer's `render` and `cull` methods
   * - `render` will create and update the Features that belong in the scene
   * - `cull` will make invisible or destroy Features that aren't in the scene anymore
   *
   * This process happens on a layer-by-layer basis for several reasons.
   * - We don't have a full picture of what all will be included in the scene until we actually
   *   call down to each layer's render method. It depends on where on the map the user is
   *   looking. This is different from a normal game where the scene is set up ahead of time.
   * - For proper label placement, we really need to cull the feature layers
   *   before we render the label layer, so we do these calls in layer order.
   *
   * @param  frame      Integer frame being rendered
   * @param  viewport   Pixi viewport to use for rendering
   * @param  zoom       Effective zoom to use for rendering
   */
  render(frame, viewport, zoom) {
    for (const layer of this.layers.values()) {
      layer.render(frame, viewport, zoom);
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
   * setClass
   * Sets a dataID as being classed a certain way (e.g. 'hover')
   * @param  classID  `String` classID (e.g. 'hover')
   * @param  layerID  `String` layerID (e.g. 'osm')
   * @param  dataID   `String` dataID (e.g. 'r123')
   */
  setClass(classID, layerID, dataID) {
    this.layers.get(layerID)?.setClass(classID, dataID);
  }


  /**
   * unsetClass
   * Unsets a dataID from being classed a certain way (e.g. 'hover')
   * @param  classID  `String` classID (e.g. 'hover')
   * @param  layerID  `String` layerID (e.g. 'osm')
   * @param  dataID   `String` dataID (e.g. 'r123')
   */
  unsetClass(classID, layerID, dataID) {
    this.layers.get(layerID)?.unsetClass(classID, dataID);
  }


  /**
   * clearClass
   * Clear out all uses of the given classID across all layers.
   * @param  classID   `String` classID (e.g. 'hover')
   */
  clearClass(classID) {
    for (const layer of this.layers.values()) {
      layer.clearClass(classID);
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
