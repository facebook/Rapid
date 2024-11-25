import * as PIXI from 'pixi.js';

import { AbstractLayer } from './AbstractLayer.js';
import { PixiFeaturePoint } from './PixiFeaturePoint.js';



/**
 * PixiLayerOverture
 * This class contains rendering code for any overture datasets that are set in the Rapid catalog.
 * The data for these are scraped from the RapidSystem's datasets, specifically those with the 'overture' service moniker.
 * There is no actual Overture service yet though.
 * @class
 */
export class PixiLayerOverture extends AbstractLayer {

  /**
   * @constructor
   * @param  scene    The Scene that owns this Layer
   * @param  layerID  Unique string to use for the name of this Layer
   */
  constructor(scene, layerID) {
    super(scene, layerID);
    this._enabled = true;

    const overlays = new PIXI.Container();
    overlays.name = `${this.layerID}`;
    overlays.sortableChildren = false;
    overlays.interactiveChildren = true;
    this.overlaysContainer = overlays;
    this._overlaysDefined = false;

    const datasets = this.context.systems.rapid.datasets;
    for (const dataset of datasets.values()) {
      if (dataset.overlay) {
        this._overlaysDefined = true;
      }
    }

    const basemapContainer = this.scene.groups.get('basemap');
    basemapContainer.addChild(overlays);
  }


  /**
   * supported
   * Whether the Layer's service exists
   */
  get supported() {
    const service = this.context.services;
    return !!service.overture;
  }

  /**
   * render
   * Render the Overture PMTIle data
   * @param  frame      Integer frame being rendered
   * @param  viewport   Pixi viewport to use for rendering
   * @param  zoom       Effective zoom to use for rendering
   */
  render(frame, viewport, zoom) {
    if (!this.enabled) return;

    const datasets = this.context.systems.rapid.datasets;

    for (const dataset of datasets.values()) {
      if (dataset.service === 'overture' && dataset.enabled) {
          this.renderDataset(dataset, frame, viewport, zoom);
      }
    }
  }

  /**
   * renderDataset
   * Render any data we have, and schedule fetching more of it to cover the view
   *
   * @param  dataset    Object
   * @param  frame      Integer frame being rendered
   * @param  viewport   Pixi viewport to use for rendering
   * @param  zoom       Effective zoom to use for rendering
   */
  renderDataset(dataset, frame, viewport, zoom) {
    const context = this.context;

    const service = context.services[dataset.service]; // Should be 'overture' if we've gotten here
    if (!service?.started) return;

    if (zoom >= 16) {  // avoid firing off too many API requests
      service.loadTiles(dataset.id);  // fetch more
    }

    const entities = service.getData(dataset.id);

    this.renderPoints(dataset, frame, viewport, zoom, entities);
  }


  /**
   * renderPoints
   * @param dataset     The Rapid dataset definition
   * @param  frame      Integer frame being rendered
   * @param  viewport   Pixi viewport to use for rendering
   * @param  zoom       Effective zoom to use for rendering
   * @param  lines      Array of point data
   */
  renderPoints(dataset, frame, viewport, zoom, points) {
    const l10n = this.context.systems.l10n;
    const parentContainer = this.scene.groups.get('points');

    const pointStyle = {
      markerName: 'largeCircle',
      markerTint: dataset.color,
      iconName: 'maki-circle-stroked',
      labelTint: dataset.color
    };

    for (const d of points) {
      const dataID = d.id;
      const version = d.v || 0;
      const parts = (d.geojson.geometry.type === 'Point') ? [d.geojson.geometry.coordinates]
        : (d.geometry.type === 'MultiPoint') ? d.geometry.coordinates : [];

      for (let i = 0; i < parts.length; ++i) {
        const coords = parts[i];
        const featureID = `${this.layerID}-${dataID}-${i}`;
        let feature = this.features.get(featureID);

        // If feature existed before as a different type, recreate it.
        if (feature && feature.type !== 'point') {
          feature.destroy();
          feature = null;
        }

        if (!feature) {
          feature = new PixiFeaturePoint(this, featureID);
          feature.style = pointStyle;
          feature.parentContainer = parentContainer;
        }

        // If data has changed.. Replace it.
        if (feature.v !== version) {
          feature.v = version;
          feature.geometry.setCoords(coords);
          feature.label = l10n.displayName(d.geojson.properties);
          feature.setData(dataID, d);
        }

        this.syncFeatureClasses(feature);
        feature.update(viewport, zoom);
        this.retainFeature(feature, frame);
      }
    }
  }

}
