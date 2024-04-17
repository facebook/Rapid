import { AbstractLayer } from './AbstractLayer.js';
import { PixiFeatureLine } from './PixiFeatureLine.js';
import { PixiFeaturePoint } from './PixiFeaturePoint.js';

const MINZOOM = 12;
const STREETSIDE_TEAL = 0xfffc4;

const LINESTYLE = {
  casing: { alpha: 0 },  // disable
  stroke: { alpha: 0.9, width: 4, color: STREETSIDE_TEAL }
};

const MARKERSTYLE = {
  markerName: 'mediumCircle',
  markerTint: STREETSIDE_TEAL,
  viewfieldName: 'viewfield',
  viewfieldTint: STREETSIDE_TEAL
};


/**
 * PixiLayerStreetsidePhotos
 * @class
 */
export class PixiLayerStreetsidePhotos extends AbstractLayer {

  /**
   * @constructor
   * @param  scene    The Scene that owns this Layer
   * @param  layerID  Unique string to use for the name of this Layer
   */
  constructor(scene, layerID) {
    super(scene, layerID);

    this._handleBearingChange = this._handleBearingChange.bind(this);
    this._viewerYawAngle = 0;

    if (this.supported) {
      const service = this.context.services.streetside;
      service.on('viewerChanged', this._handleBearingChange);
    }
  }



  /**
   * _handleBearingCHange
   * Handle the user dragging inside of a panoramic photo.
   */
  _handleBearingChange() {
    const service = this.context.services.streetside;

    this._viewerYawAngle = service._pannellumViewer.getYaw();
  }


  /**
   * supported
   * Whether the Layer's service exists
   */
  get supported() {
    return !!this.context.services.streetside;
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
      this.context.services.streetside.startAsync();
    }
  }


  filterImages(images) {
    const photoSystem = this.context.systems.photos;
    const fromDate = photoSystem.fromDate;
    const toDate = photoSystem.toDate;
    const usernames = photoSystem.usernames;

    if (fromDate) {
      const fromTimestamp = new Date(fromDate).getTime();
      images = images.filter(i => new Date(i.captured_at).getTime() >= fromTimestamp);
    }
    if (toDate) {
      const toTimestamp = new Date(toDate).getTime();
      images = images.filter(i => new Date(i.captured_at).getTime() <= toTimestamp);
    }
    if (usernames) {
      images = images.filter(i => usernames.includes(i.captured_by));
    }
    return images;
  }


  filterSequences(sequences) {
    const photoSystem = this.context.systems.photos;
    const fromDate = photoSystem.fromDate;
    const toDate = photoSystem.toDate;
    const usernames = photoSystem.usernames;

    if (fromDate) {
      const fromTimestamp = new Date(fromDate).getTime();
      sequences = sequences.filter(s => new Date(s.captured_at).getTime() >= fromTimestamp);
    }
    if (toDate) {
      const toTimestamp = new Date(toDate).getTime();
      sequences = sequences.filter(s => new Date(s.captured_at).getTime() <= toTimestamp);
    }
    if (usernames) {
      sequences = sequences.filter(s => usernames.includes(s.captured_by));
    }
    return sequences;
  }


  /**
   * renderMarkers
   * @param  frame      Integer frame being rendered
   * @param  viewport   Pixi viewport to use for rendering
   * @param  zoom       Effective zoom to use for rendering
   */
  renderMarkers(frame, viewport, zoom) {
    const service = this.context.services.streetside;

    //We want the active image, which may or may not be the selected image.
    const activeIDs = this._classHasData.get('active') ?? new Set();

    if (!service?.started) return;

    const parentContainer = this.scene.groups.get('streetview');
    const images = service.getImages();
    const sequences = service.getSequences();

    const sequenceData = this.filterSequences(sequences);
    const photoData = this.filterImages(images);

    for (const sequence of sequenceData) {
      const dataID =  sequence.id;
      const featureID = `${this.layerID}-sequence-${dataID}`;
      const sequenceVersion = sequence.v || 0;
      let feature = this.features.get(featureID);

      if (!feature) {
        feature = new PixiFeatureLine(this, featureID);
        feature.style = LINESTYLE;
        feature.parentContainer = parentContainer;
        feature.container.zIndex = -100;  // beneath the markers (which should be [-90..90])
      }

      // If sequence has changed, update data and coordinates.
      if (feature.v !== sequenceVersion) {
        feature.v = sequenceVersion;
        feature.geometry.setCoords(sequence.coordinates);
        feature.setData(dataID, sequence);
        feature.clearChildData(dataID);
        sequence.bubbleIDs.forEach(bubbleID => feature.addChildData(dataID, bubbleID));
      }

      this.syncFeatureClasses(feature);
      feature.update(viewport, zoom);
      this.retainFeature(feature, frame);
    }


    for (const photo of photoData) {
      const dataID = photo.id;
      const featureID = `${this.layerID}-photo-${dataID}`;
      let feature = this.features.get(featureID);

      if (!feature) {
        const style = Object.assign({}, MARKERSTYLE);
        if (Number.isFinite(photo.ca)) {
          style.viewfieldAngles = [photo.ca];   // ca = camera angle
        }
        if (photo.isPano) {
          style.viewfieldName = 'pano';
        }

        feature = new PixiFeaturePoint(this, featureID);
        feature.geometry.setCoords(photo.loc);
        feature.style = style;
        feature.parentContainer = parentContainer;
        feature.setData(dataID, photo);
      }
      if (activeIDs.has(photo.id)) {
        feature.drawing = true;
        feature.style.viewfieldAngles = [photo.ca + this._viewerYawAngle];
        feature.style.viewfieldName = 'viewfield';
      } else  {
        feature.drawing = false;
        feature.style.viewfieldName = photo.isPano ? 'pano' : 'viewfield';
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
    const service = this.context.services.streetside;
    if (!this.enabled || !service?.started || zoom < MINZOOM) return;

    service.loadTiles();
    this.renderMarkers(frame, viewport, zoom);
  }

}

