import { AbstractLayer } from './AbstractLayer.js';
import { PixiFeaturePoint } from './PixiFeaturePoint.js';

const MINZOOM = 12;
const MAPILLARY_GREEN = 0x05cb63;
const SELECTED = 0xffee00;


/**
 * PixiLayerMapillaryDetections
 * @class
 */
export class PixiLayerMapillaryDetections extends AbstractLayer {

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


  /**
   * reset
   * Every Layer should have a reset function to replace any Pixi objects and internal state.
   */
  reset() {
    super.reset();
  }


  /**
   * filterDetections
   * @param  {Array<detection>}  detections - all detections
   * @return {Array<detection>}  detections with filtering applied
   */
  filterDetections(detections) {
    const photos = this.context.systems.photos;
    const fromDate = photos.fromDate;
    const fromTimestamp = fromDate && new Date(fromDate).getTime();
    const toDate = photos.toDate;
    const toTimestamp = toDate && new Date(toDate).getTime();

    return detections.filter(detection => {
      const detectionTimestamp = new Date(detection.first_seen_at).getTime();
      if (fromTimestamp && fromTimestamp > detectionTimestamp) return false;
      if (toTimestamp && toTimestamp < detectionTimestamp) return false;

      return true;
    });
  }


  /**
   * renderMarkers
   * @param  frame      Integer frame being rendered
   * @param  viewport   Pixi viewport to use for rendering
   * @param  zoom       Effective zoom to use for rendering
   */
  renderMarkers(frame, viewport, zoom) {
    const context = this.context;
    const presets = context.systems.presets;

    const mapillary = context.services.mapillary;
    if (!mapillary?.started) return;

    const parentContainer = this.scene.groups.get('qa');

    let items = mapillary.getData('detections');
    items = this.filterDetections(items);

    for (const d of items) {
      const featureID = `${this.layerID}-${d.id}`;
      let feature = this.features.get(featureID);

      if (!feature) {
        feature = new PixiFeaturePoint(this, featureID);
        feature.geometry.setCoords(d.loc);
        feature.parentContainer = parentContainer;
        feature.setData(d.id, d);
      }

      this.syncFeatureClasses(feature);

      if (feature.dirty) {
        const isSelected = feature.hasClass('selectdetection');
        const presetID = mapillary.getDetectionPresetID(d.value);
        const preset = presetID && presets.item(presetID);

        const style = {
          markerName: 'xlargeCircle',
          markerTint: '#000000',
          iconName: preset?.icon || 'fas-question',
          iconSize: 16,
          iconTint: isSelected ? SELECTED : MAPILLARY_GREEN
        };

        feature.style = style;
      }

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

    mapillary.loadTiles('detections');
    this.renderMarkers(frame, viewport, zoom);
  }

}

