import { services } from '../services';
import { AbstractLayer } from './AbstractLayer';
import { PixiFeaturePoint } from './PixiFeaturePoint';

const MINZOOM = 12;


/**
 * PixiLayerMapillaryFeatures
 * @class
 */
export class PixiLayerMapillaryFeatures extends AbstractLayer {

  /**
   * @constructor
   * @param  scene    The Scene that owns this Layer
   * @param  layerID  Unique string to use for the name of this Layer
   */
  constructor(scene, layerID) {
    super(scene, layerID);

    this._service = null;
    this.getService();

    // Watch history to keep track of which features have been accepted by the user
    // These features will be filtered out when drawing
    this._actioned = new Set();

    this.context
      .history()
      .on('undone.mapillaryFeatures', onHistoryUndone.bind(this))
      .on('change.mapillaryFeatures', onHistoryChange.bind(this))
      .on('restore.mapillaryFeatures', onHistoryRestore.bind(this));

    function wasRapidEdit(annotation) {
      return (
        annotation && annotation.type && /^mapillary/.test(annotation.type)
      );
    }

    function onHistoryUndone(currentStack, previousStack) {
      const annotation = previousStack.annotation;
      if (!wasRapidEdit(annotation)) return;

      _actioned.delete(annotation.id);
      if (svgRapidMapillaryFeatures.enabled) {
        dispatch.call('change');
      } // redraw
    }

    function onHistoryChange(/* difference */) {
      const annotation = context.history().peekAnnotation();
      if (!wasRapidEdit(annotation)) return;
      _actioned.add(annotation.id);
    }

    function onHistoryRestore() {
      _actioned = new Set();
      context
        .history()
        .peekAllAnnotations()
        .forEach((annotation) => {
          if (wasRapidEdit(annotation)) {
            _actioned.add(annotation.id);
            if (annotation.origid) {
              _actioned.add(annotation.origid);
            }
          }
        });
      if (_actioned.size && svgRapidMapillaryFeatures.enabled) {
        dispatch.call('change'); // redraw
      }
    }
  }


  /**
   * Services are loosely coupled, so we use a `getService` function
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
    const service = this.getService();
    if (!service) return;

    const parentContainer = this.scene.groups.get('points');

    let items = service.mapFeatures(this.context.projection);
    items = this.filterDetections(items);

    for (const d of items) {
      const featureID = `${this.layerID}-${d.id}`;
      let feature = this.features.get(featureID);

      if (!feature) {
        const style = { markerName: d.value };

        feature = new PixiFeaturePoint(this, featureID);
        feature.geometry.setCoords(d.loc);
        feature.style = style;
        feature.parentContainer = parentContainer;
        feature.setData(d.id, d);
        // const marker = feature.marker;
        // const ICONSIZE = 24;
        // marker.width = ICONSIZE;
        // marker.height = ICONSIZE;
      }

      this.syncFeatureClasses(feature);
      feature.update(projection, zoom);
      this.retainFeature(feature, frame);
    }
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
      service.loadMapFeatures(this.context.projection);  // note: context.projection !== pixi projection
      service.showFeatureDetections(true);
      this.renderMarkers(frame, projection, zoom);

    } else {
      service?.showFeatureDetections(false);
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

