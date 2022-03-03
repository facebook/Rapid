import * as PIXI from 'pixi.js';
// import _throttle from 'lodash-es/throttle';

import { services } from '../services';
import { PixiLayer } from './PixiLayer';


const LAYERID = 'mapillary-signs';
const LAYERZINDEX = 10;
const MINZOOM = 12;


/**
 * PixiLayerMapillarySigns
 * @class
 */
export class PixiLayerMapillarySigns extends PixiLayer {

  /**
   * @constructor
   * @param context
   * @param featureCache
   * @param dispatch
   */
  constructor(context, featureCache, dispatch) {
    super(context, LAYERID, LAYERZINDEX);

    this.featureCache = featureCache;
    this.dispatch = dispatch;

    this._service = null;
    this.getService();
  }


  /**
   * Services are loosely coupled in iD, so we use a `getService` function
   * to gain access to them, and bind any event handlers a single time.
   */
  getService() {
    if (services.mapillary && !this._service) {
      this._service = services.mapillary;
      // this._service.event.on('loadedMapFeatures', throttledRedraw);
    } else if (!services.mapillary && this._service) {
      this._service = null;
    }

    return this._service;
  }


  filterDetections(detections) {
    const fromDate = this.context.photos().fromDate();
    const toDate = this.context.photos().toDate();

    if (fromDate) {
      const fromTimestamp = new Date(fromDate).getTime();
      detections = detections
        .filter(detection => new Date(detection.last_seen_at).getTime() >= fromTimestamp);
    }
    if (toDate) {
      const toTimestamp = new Date(toDate).getTime();
      detections = detections
        .filter(detection => new Date(detection.first_seen_at).getTime() >= toTimestamp);
    }

    return detections;
  }


  /**
   * drawMarkers
   * @param projection - a pixi projection
   */
  drawMarkers(projection) {
    const context = this.context;
    const featureCache = this.featureCache;
    const k = projection.scale();

    const service = this.getService();
    if (!service) return;

    const spritesheet = context._mapillarySignSheet;
    if (!spritesheet) return;  // wait for spritesheet to load

    let detections = service.signs(context.projection);
    detections = this.filterDetections(detections);

    detections.forEach(d => {
      const featureID = `${LAYERID}-sign-${d.id}`;
      let feature = featureCache.get(featureID);

      if (!feature) {
        const ICONSIZE = 24;
        const marker = new PIXI.Sprite(spritesheet.textures[d.value + '.svg']);
        marker.name = featureID;
        marker.interactive = true;
        marker.buttonMode = true;
        marker.zIndex = -d.loc[1];    // sort by latitude ascending
        marker.anchor.set(0.5, 0.5);  // middle, middle
        marker.width = ICONSIZE;
        marker.height = ICONSIZE;
        this.container.addChild(marker);

        feature = {
          displayObject: marker,
          loc: d.loc
        };

        featureCache.set(featureID, feature);
      }

      if (k === feature.k) return;
      feature.k = k;

      // Reproject and recalculate the bounding box
      const [x, y] = projection.project(feature.loc);
      feature.displayObject.position.set(x, y);
    });
  }


  /**
   * render
   * Draw any data we have, and schedule fetching more of it to cover the view
   * @param projection - a pixi projection
   * @param zoom - the effective zoom to use for rendering
   */
  render(projection, zoom) {
    if (!this._enabled) return;

    const context = this.context;
    const service = this.getService();

    if (service && zoom >= MINZOOM) {
      this.visible = true;
      service.loadSigns(context.projection);  // note: context.projection !== pixi projection
      service.showSignDetections(true);
      this.drawMarkers(projection);
    } else {
      this.visible = false;
      service.showSignDetections(false);
    }
  }


  /**
   * supported
   * Whether the layer's service exists
   */
  get supported() {
    return !!this.getService();
  }

}
