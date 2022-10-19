import { services } from '../services';
import { AbstractLayer } from './AbstractLayer';
import { PixiFeaturePoint } from './PixiFeaturePoint';

const LAYERID = 'mapillary-map-features';
const MINZOOM = 12;


/**
 * PixiLayerMapillaryFeatures
 * @class
 */
export class PixiLayerMapillaryFeatures extends AbstractLayer {

  /**
   * @constructor
   * @param  scene    The Scene that owns this Layer
   * @param  layerZ   z-index to assign to this Layer's container
   */
  constructor(scene, layerZ) {
    super(scene, LAYERID, layerZ);

    this._service = null;
    this.getService();
  }


  /**
   * Services are loosely coupled in RapiD, so we use a `getService` function
   * to gain access to them, and bind any event handlers a single time.
   */
  getService() {
    if (services.mapillary && !this._service) {
      this._service = services.mapillary;
      this._service.on('loadedMapFeatures', () => this.context.map().deferredRedraw());
    } else if (!services.mapillary && this._service) {
      this._service = null;
    }

    return this._service;
  }


  filterDetections(detections) {
    const fromDate = this.context.photos().fromDate;
    const toDate = this.context.photos().toDate;

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
   * renderMarkers
   * @param  frame        Integer frame being rendered
   * @param  projection   Pixi projection to use for rendering
   * @param  zoom         Effective zoom to use for rendering
   */
  renderMarkers(frame, projection, zoom) {
    const scene = this.scene;

    const service = this.getService();
    if (!service) return;

    const spritesheet = this.context._mapillarySheet;
    if (!spritesheet) return;  // wait for spritesheet to load

    let detections = service.mapFeatures(this.context.projection);
    detections = this.filterDetections(detections);

    detections.forEach(d => {
      const featureID = `${LAYERID}-${d.id}`;
      let feature = scene.getFeature(featureID);

      if (!feature) {
        const style = {
          markerTexture: spritesheet.textures[d.value + '.svg']
        };

        feature = new PixiFeaturePoint(this, featureID);
        feature.geometry = d.loc;
        feature.style = style;
        feature.parentContainer = this.container;
        feature.bindData(d, d.id);
        // const marker = feature.marker;
        // const ICONSIZE = 24;
        // marker.width = ICONSIZE;
        // marker.height = ICONSIZE;
      }

      scene.syncFeatureState(feature);
      feature.update(projection, zoom);
      scene.retainFeature(feature, frame);
    });
  }


  /**
   * render
   * Render any data we have, and schedule fetching more of it to cover the view
   * @param  frame        Integer frame being rendered
   * @param  projection   Pixi projection to use for rendering
   * @param  zoom         Effective zoom to use for rendering
   */
  render(frame, projection, zoom) {
    const service = this.getService();

    if (this._enabled && service && zoom >= MINZOOM) {
      this.visible = true;
      service.loadMapFeatures(this.context.projection);  // note: context.projection !== pixi projection
      service.showFeatureDetections(true);
      this.renderMarkers(frame, projection, zoom);

    } else {
      this.visible = false;
      if (service) {
        service.showFeatureDetections(false);
      }
    }
  }


  /**
   * supported
   * Whether the Layer's service exists
   */
  get supported() {
    return !!this.getService();
  }

}

