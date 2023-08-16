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

    // Watch history to keep track of which features have been accepted by the user
    // These features will be filtered out when drawing
    this._actioned = new Set();

    // Make sure the event handlers have `this` bound correctly
    this._onUndone = this._onUndone.bind(this);
    this._onChange = this._onChange.bind(this);
    this._onRestore = this._onRestore.bind(this);

    this.context.systems.edits
      .on('undone', this._onUndone)
      .on('change', this._onChange)
      .on('restore', this._onRestore);
  }


  wasRapidEdit(annotation) {
    return (
      annotation && annotation.type && /^rapid/.test(annotation.type)
    );
  }

  _onUndone(currentStack, previousStack) {
    const annotation = previousStack.annotation;
    if (!this.wasRapidEdit(annotation)) return;

    this._actioned.delete(annotation.id);
    this.context.systems.map.immediateRedraw();
  }

  _onChange(/* difference */) {
    const annotation = this.context.systems.edits.peekAnnotation();
    if (!this.wasRapidEdit(annotation)) return;
    this._actioned.add(annotation.id);
    this.context.systems.map.immediateRedraw();
  }

  _onRestore() {
    this._actioned = new Set();
    this.context
      .systems
      .edits
      .peekAllAnnotations()
      .forEach((annotation) => {
        if (this.wasRapidEdit(annotation)) {
          this._actioned.add(annotation.id);
          if (annotation.origid) {
            this._actioned.add(annotation.origid);
          }
        }
      });
    this.context.systems.map.immediateRedraw();
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

    if (val) {
      this.dirtyLayer();
      this.context.services.mapillary.startAsync();
    }
  }


  filterDetections(detections) {
    const photoSystem = this.context.systems.photos;
    const fromDate = photoSystem.fromDate;
    const toDate = photoSystem.toDate;

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

    //Finally, filter out any detections that have been added to the map.
    detections = detections.filter(detection => !this._actioned.has(detection.id));

    return detections;
  }


  /**
   * renderMarkers
   * @param  frame        Integer frame being rendered
   * @param  projection   Pixi projection to use for rendering
   * @param  zoom         Effective zoom to use for rendering
   */
  renderMarkers(frame, projection, zoom) {
    const service = this.context.services.mapillary;
    if (!service?.started) return;

    const parentContainer = this.scene.groups.get('points');

    let items = service.getData('points');
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

    // If the feature has an FBID, that means it's part of a dataset with a color, so use it!
      if (feature.data.__fbid__) {
        const mlyDataset = this.context.systems.rapid.datasets.get('rapidMapFeatures');
      feature.style.markerTint = mlyDataset.color;
    }
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
    const service = this.context.services.mapillary;

    if (this.enabled && service?.started && zoom >= MINZOOM) {
      service.loadTiles('points');
      service.showFeatureDetections(true);
      this.renderMarkers(frame, projection, zoom);

    } else {
      service?.showFeatureDetections(false);
    }
  }

}

