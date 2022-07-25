import { services } from '../services';
import { AbstractLayer } from './AbstractLayer';
import { PixiFeaturePoint } from './PixiFeaturePoint';

const LAYERID = 'mapillary-signs';
const MINZOOM = 12;


/**
 * PixiLayerMapillarySigns
 * @class
 */
export class PixiLayerMapillarySigns extends AbstractLayer {

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
   * Services are loosely coupled in iD, so we use a `getService` function
   * to gain access to them, and bind any event handlers a single time.
   */
  getService() {
    if (services.mapillary && !this._service) {
      this._service = services.mapillary;
      this._service.on('loadedSigns', () => this.context.map().deferredRedraw());
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
   * @param  frame        Integer frame being rendered
   * @param  projection   Pixi projection to use for rendering
   * @param  zoom         Effective zoom to use for rendering
   */
  drawMarkers(frame, projection, zoom) {
    const scene = this.scene;

    const service = this.getService();
    if (!service) return;

    const spritesheet = this.context._mapillarySignSheet;
    if (!spritesheet) return;  // wait for spritesheet to load

    let detections = service.signs(this.context.projection);
    detections = this.filterDetections(detections);

    detections.forEach(d => {
      const featureID = `${LAYERID}-${d.id}`;
      let feature = scene.getFeature(featureID);

      if (!feature) {
        const style = {
          markerTexture: spritesheet.textures[d.value + '.svg']
        };

        feature = new PixiFeaturePoint(this, featureID, this.container, d, d.loc, style);

        // const marker = feature.marker;
        // const ICONSIZE = 24;
        // marker.width = ICONSIZE;
        // marker.height = ICONSIZE;
      }

      if (feature.dirty) {
        feature.update(projection, zoom);
        scene.updateFeature(feature);
      }

      if (feature.lod > 0 || feature.selected) {
        feature.visible = true;
        this.seenFeature.set(feature, frame);
      }
    });
  }


  /**
   * render
   * Draw any data we have, and schedule fetching more of it to cover the view
   * @param  frame        Integer frame being rendered
   * @param  projection   Pixi projection to use for rendering
   * @param  zoom         Effective zoom to use for rendering
   */
  render(frame, projection, zoom) {
    const context = this.context;
    const service = this.getService();

    if (this._enabled && service && zoom >= MINZOOM) {
      this.visible = true;
      service.loadSigns(context.projection);  // note: context.projection !== pixi projection
      service.showSignDetections(true);

      this.drawMarkers(frame, projection, zoom);
      this.cull(frame);

    } else {
      this.visible = false;
      if (service) service.showSignDetections(false);
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
