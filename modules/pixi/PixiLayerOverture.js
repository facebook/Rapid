import * as PIXI from 'pixi.js';

import { AbstractLayer } from './AbstractLayer.js';



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
    const rapid = context.systems.rapid;


    const service = context.services[dataset.service]; // Should be 'overture' if we've gotten here
    if (!service?.started) return;
    if (zoom >= 16) {  // avoid firing off too many API requests
      service.loadTiles(dataset.id);  // fetch more
    }
  }

  /**
   * _clear
   * Clear state to prepare for new custom data
   */
  _clear() {
  }

}
