import { AbstractLayer } from './AbstractLayer.js';
import { PixiFeatureLine } from './PixiFeatureLine.js';
import { PixiFeaturePoint } from './PixiFeaturePoint.js';

const MINZOOM = 12;
const STREETSIDE_TEAL = 0xfffc4;
const STREETSIDE_SELECTED = 0xffee00;

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
   * _handleBearingChange
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


  /**
   * filterImages
   * @param  {Array<image>}  images - all images
   * @return {Array<image>}  images with filtering applied
   */
  filterImages(images) {
    const photos = this.context.systems.photos;
    const fromDate = photos.fromDate;
    const toDate = photos.toDate;
    const usernames = photos.usernames;

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


  /**
   * filterSequences
   * @param  {Array<sequence>}  sequences - all sequences
   * @return {Array<sequence>}  sequences with filtering applied
   */
  filterSequences(sequences) {
    const photos = this.context.systems.photos;
    const fromDate = photos.fromDate;
    const toDate = photos.toDate;
    const usernames = photos.usernames;

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
        feature = new PixiFeaturePoint(this, featureID);
        feature.geometry.setCoords(photo.loc);
        feature.parentContainer = parentContainer;
        feature.setData(dataID, photo);
      }

      this.syncFeatureClasses(feature);

      if (feature.dirty) {
        const style = Object.assign({}, MARKERSTYLE);

        if (feature.active) {
          style.viewfieldAngles = [photo.ca + this._viewerYawAngle];
          style.viewfieldName = 'viewfield';
          style.viewfieldTint = STREETSIDE_SELECTED;
          style.markerTint = STREETSIDE_SELECTED;
          style.scale = 2.0;
        } else {
          if (Number.isFinite(photo.ca)) {
            style.viewfieldAngles = [photo.ca];   // ca = camera angle
          } else {
            style.viewfieldAngles = [];
          }
          style.viewfieldName = photo.isPano ? 'pano' : 'viewfield';
          style.viewfieldTint = STREETSIDE_TEAL;
          style.markerTint = STREETSIDE_TEAL;
          style.scale = 1.0;
        }

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
    const service = this.context.services.streetside;
    if (!this.enabled || !service?.started || zoom < MINZOOM) return;

    service.loadTiles();
    this.renderMarkers(frame, viewport, zoom);
  }

}

