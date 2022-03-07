import { services } from '../services';
import { PixiLayer } from './PixiLayer';
import { PixiFeaturePoint } from './PixiFeaturePoint';

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
   * @param scene
   * @param dispatch
   */
  constructor(context, scene, dispatch) {
    super(context, LAYERID, LAYERZINDEX);

    this.scene = scene;
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
   * @param zoom - the effective zoom to use for rendering
   */
  drawMarkers(projection, zoom) {
    const context = this.context;
    const scene = this.scene;

    const service = this.getService();
    if (!service) return;

    const spritesheet = context._mapillarySignSheet;
    if (!spritesheet) return;  // wait for spritesheet to load

    let detections = service.signs(context.projection);
    detections = this.filterDetections(detections);

    detections.forEach(d => {
      const featureID = `${LAYERID}-${d.id}`;
      let feature = scene.get(featureID);

      if (!feature) {
        const markerStyle = {
          markerTexture: spritesheet.textures[d.value + '.svg']
        };
        feature = new PixiFeaturePoint(context, featureID, d.loc, [], markerStyle);

        const marker = feature.displayObject;
        // const ICONSIZE = 24;
        // marker.width = ICONSIZE;
        // marker.height = ICONSIZE;

        // bind data and add to scene
        marker.__data__ = d;
        this.container.addChild(marker);

        scene.add(feature);
      }

      feature.update(projection, zoom);
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
      this.drawMarkers(projection, zoom);
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
