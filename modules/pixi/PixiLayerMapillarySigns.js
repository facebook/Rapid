import { AbstractLayer } from './AbstractLayer.js';
import { PixiFeaturePoint } from './PixiFeaturePoint.js';

const MINZOOM = 12;


/**
 * PixiLayerMapillarySigns
 * @class
 */
export class PixiLayerMapillarySigns extends AbstractLayer {

  /**
   * @constructor
   * @param  scene    The Scene that owns this Layer
   * @param  layerID  Unique string to use for the name of this Layer
   */
  constructor(scene, layerID) {
    super(scene, layerID);
  }


  /**
   * supported
   * Whether the Layer's service exists
   */
  get supported() {
    return !!this.context.services.mapillary;
  }


  /**
   * enabled
   * Whether the user has chosen to see the Layer
   * Make sure to start the service first.
   */
  get enabled() {
    return this._enabled;
  }
  set enabled(val) {
    if (!this.supported) {
      val = false;
    }

    if (val === this._enabled) return;  // no change
    this._enabled = val;

    const context = this.context;
    const gfx = context.systems.gfx;
    const mapillary = context.services.mapillary;
    if (val && mapillary) {
      mapillary.startAsync()
        .then(() => gfx.immediateRedraw());
    }
  }


  filterDetections(detections) {
    const photos = this.context.systems.photos;
    const fromDate = photos.fromDate;
    const toDate = photos.toDate;

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
   * @param  frame      Integer frame being rendered
   * @param  viewport   Pixi viewport to use for rendering
   * @param  zoom       Effective zoom to use for rendering
   */
  renderMarkers(frame, viewport, zoom) {
    const context = this.context;
    const mapillary = context.services.mapillary;
    if (!mapillary?.started) return;

    const container = context.container();
    const parentContainer = this.scene.groups.get('qa');

    let items = mapillary.getData('signs');
    items = this.filterDetections(items);

    for (const d of items) {
      const featureID = `${this.layerID}-${d.id}`;
      let feature = this.features.get(featureID);

      if (!feature) {
        // Some values we don't have icons for, check first - Rapid#1518
        const hasIcon = container.selectAll(`#rapid-defs #${d.value}`).size();

        let style;
        if (hasIcon) {
          style = {
            markerName: d.value
          };
        } else {
          style = {
            markerName: 'xlargeSquare',
            iconName: 'fas-question',
            iconSize: 16
          };
        }

        feature = new PixiFeaturePoint(this, featureID);
        feature.geometry.setCoords(d.loc);
        feature.style = style;
        feature.parentContainer = parentContainer;
        feature.setData(d.id, d);

        const marker = feature.marker;
        const ICONSIZE = 24;
        marker.width = ICONSIZE;
        marker.height = ICONSIZE;
      }

      this.syncFeatureClasses(feature);
      feature.update(viewport, zoom);
      this.retainFeature(feature, frame);
    }
  }


  /**
   * render
   * Render any data we have, and schedule fetching more of it to cover the view
   * @param  frame      Integer frame being rendered
   * @param  viewport   Pixi viewport to use for rendering
   * @param  zoom       Effective zoom to use for rendering
   */
  render(frame, viewport, zoom) {
    const mapillary = this.context.services.mapillary;
    if (!this.enabled || !mapillary?.started || zoom < MINZOOM) return;

    mapillary.loadTiles('signs');
    this.renderMarkers(frame, viewport, zoom);
  }

}
