import * as PIXI from 'pixi.js';

import { geojsonFeatures } from '../util/util.js';
import { AbstractLayer } from './AbstractLayer.js';



/**
 * PixiLayerRapidOverlay
 * This class contains any overlay vectors that should be 'drawn over' the map, usually at low zooms.
 * The data for these are scraped from the RapidSystem's datasets, specifically the 'overlay' field.
 * @class
 */
export class PixiLayerRapidOverlay extends AbstractLayer {

  /**
   * @constructor
   * @param  scene    The Scene that owns this Layer
   * @param  layerID  Unique string to use for the name of this Layer
   */
  constructor(scene, layerID) {
    super(scene, layerID);
    this._clear();
    this._enabled = true;

    const overlays = new PIXI.Container();
    overlays.name = `${this.layerID}`;
    overlays.sortableChildren = false;
    overlays.interactiveChildren = true;
    this.overlaysContainer = overlays;
    this._overlaysDefined = false;

    const datasets = this.context.systems.rapid.datasets;
    for (const [key, dataset] of datasets.entries()) {
      console.log(key);
      if (dataset.overlay) {
        this._overlaysDefined = true;
      }
    }


    const basemapContainer = this.scene.groups.get('basemap');
    basemapContainer.addChild(overlays);
  }


  /**
   * render
   * Render the GeoJSON custom data
   * @param  frame      Integer frame being rendered
   * @param  viewport   Pixi viewport to use for rendering
   * @param  zoom       Effective zoom to use for rendering
   */
  render(frame, viewport, zoom) {
    if (!this.enabled || !(this.hasData())) return;

    const vtService = this.context.services.vectortile;
    const datasets = this.context.systems.rapid.datasets;
    const parentContainer = this.overlaysContainer;

    //Extremely inefficient but we're not drawing anything else at this zoom
    parentContainer.removeChildren();

    for (const [key, dataset] of datasets.entries()) {
      console.log(key);
      if (dataset.overlay && dataset.enabled) {
        const customColor = new PIXI.Color(dataset.color);
        const overlay = dataset.overlay;
        if (vtService) {
          if ((zoom >= overlay.minZoom ) && (zoom <= overlay.maxZoom)) {  // avoid firing off too many API requests
              vtService.loadTiles(overlay.url);
            }
          const overlayData = vtService.getData(overlay.url).map(d => d.geojson);
          const points = overlayData.filter(d => d.geometry.type === 'Point' || d.geometry.type === 'MultiPoint');
          this.renderPoints(frame, viewport, zoom, points, customColor);
        }
      }
    }
  }


  /**
   * renderPoints
   * @param  frame      Integer frame being rendered
   * @param  viewport   Pixi viewport to use for rendering
   * @param  zoom       Effective zoom to use for rendering
   * @param  lines      Array of point data
   * @param  color      The color to use
   */
  renderPoints(frame, viewport, zoom, points, color) {
    const parentContainer = this.overlaysContainer;
    for (const d of points) {
      const parts = (d.geometry.type === 'Point') ? [d.geometry.coordinates]
        : (d.geometry.type === 'MultiPoint') ? d.geometry.coordinates : [];

      for (let i = 0; i < parts.length; ++i) {
        const coords = parts[i];

          const xyCoords = viewport.project(coords);
          const feature = new PIXI.Graphics().
          beginFill(color, 0.05).
          drawCircle(0, 0, 40).
          endFill();

          feature.x = xyCoords[0];
          feature.y = xyCoords[1];
          parentContainer.addChild(feature);
      }
    }
  }


  /**
   * hasData
   * Return true if there is no overlay data to display
   * @return {boolean}  `true` if there is a vector tile template or geojson to display
   */
  hasData() {
    return this._overlaysDefined;
  }

  /**
   * _ensureIDs
   * After loading GeoJSON data, check the Features and make sure they have unique IDs.
   * This function modifies the GeoJSON features in place and then returns it.
   * @param  {Object}  geojson - A GeoJSON Feature or FeatureCollection
   * @return {Object}  The GeoJSON, but with IDs added
   */
  _ensureIDs(geojson) {
    if (!geojson) return null;

    for (const feature of geojsonFeatures(geojson)) {
      this._ensureFeatureID(feature);
    }
    return geojson;
  }


  /**
   * _ensureFeatureID
   * Ensure that this GeoJSON Feature has a unique ID.
   * This function modifies the GeoJSON Feature in place and then returns it.
   * @param  {Object}  A GeoJSON feature
   * @return {Object}  The GeoJSON Feature, but with an ID added
   */
  _ensureFeatureID(feature) {
    if (!feature) return;

    const vtService = this.context.services.vectortile;
    const featureID = vtService.getNextID();
    feature.id = featureID;
    feature.__featurehash__ = featureID;
    return feature;
  }

  /**
   * _clear
   * Clear state to prepare for new custom data
   */
  _clear() {
    this._overlaysDefined = false;
  }

}
