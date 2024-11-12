import * as PIXI from 'pixi.js';

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
    overlays.label = `${this.layerID}`;
    overlays.sortableChildren = false;
    overlays.interactiveChildren = true;
    this.overlaysContainer = overlays;
    this._overlaysDefined = null;


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

    for (const dataset of datasets.values()) {
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
        const loc = parts[i];

        const point = viewport.project(loc);
        const feature = new PIXI.Graphics()
          .circle(0, 0, 40)
          .fill({color, alpha:0.05});

        feature.x = point[0];
        feature.y = point[1];
        parentContainer.addChild(feature);
      }
    }
  }


  /**
   * hasData
   * Return true if there is any overlay endpoint URLs defined in the rapid datasets.
   * @return {boolean}  `true` if there is a vector tile template or geojson to display
   */
  hasData() {

    if (this._overlaysDefined === null) {
      const datasets = this.context.systems.rapid.datasets;
      this._overlaysDefined = false;
      for (const dataset of datasets.values()) {
        if (dataset.overlay) {
          this._overlaysDefined = true;
        }
      }

    }

    return this._overlaysDefined;
  }


  /**
   * _clear
   * Clear state to prepare for new custom data
   */
  _clear() {
    this._overlaysDefined = null;
  }

}
