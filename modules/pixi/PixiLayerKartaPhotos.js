import { AbstractLayer } from './AbstractLayer.js';
import { PixiFeatureLine } from './PixiFeatureLine.js';
import { PixiFeaturePoint } from './PixiFeaturePoint.js';

const MINZOOM = 12;
const KARTAVIEW_BLUE = 0x20c4ff;
const SELECTED = 0xffee00;

const LINESTYLE = {
  casing: { alpha: 0 },  // disable
  stroke: { alpha: 0.7, width: 4, color: KARTAVIEW_BLUE }
};

const MARKERSTYLE = {
  markerAlpha:     0.8,
  markerName:      'mediumCircle',
  markerTint:      KARTAVIEW_BLUE,
  viewfieldAlpha:  0.7,
  viewfieldName:   'viewfield',
  viewfieldTint:   KARTAVIEW_BLUE,
  scale:           1.0,
  fovWidth:        1,
  fovLength:       1
};


/**
 * PixiLayerKartaPhotos
 * @class
 */
export class PixiLayerKartaPhotos extends AbstractLayer {

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
    return !!this.context.services.kartaview;
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
    const kartaview = context.services.kartaview;
    if (val && kartaview) {
      kartaview.startAsync()
        .then(() => gfx.immediateRedraw());
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
    const fromTimestamp = fromDate && new Date(fromDate).getTime();
    const toDate = photos.toDate;
    const toTimestamp = toDate && new Date(toDate).getTime();
    const usernames = photos.usernames;
    const showFlatPhotos = photos.showsPhotoType('flat');
    const showPanoramicPhotos = photos.showsPhotoType('panoramic');

    return images.filter(image => {
      if (image.id === photos.currPhotoID) return true;  // always show current image - Rapid#1512

      if (!showFlatPhotos && !image.isPano) return false;
      if (!showPanoramicPhotos && image.isPano) return false;

      const imageTimestamp = new Date(image.captured_at).getTime();
      if (fromTimestamp && fromTimestamp > imageTimestamp) return false;
      if (toTimestamp && toTimestamp < imageTimestamp) return false;

      if (usernames && !usernames.includes(image.captured_by)) return false;

      return true;
    });
  }


  /**
   * filterSequences
   * Each sequence is represented as a GeoJSON LineString.
   * @param  {Array<sequence>}  sequences - all sequences
   * @return {Array<sequence>}  sequences with filtering applied
   */
  filterSequences(sequences) {
    const photos = this.context.systems.photos;
    const fromDate = photos.fromDate;
    const fromTimestamp = fromDate && new Date(fromDate).getTime();
    const toDate = photos.toDate;
    const toTimestamp = toDate && new Date(toDate).getTime();
    const usernames = photos.usernames;
    const showFlatPhotos = photos.showsPhotoType('flat');
    const showPanoramicPhotos = photos.showsPhotoType('panoramic');

    return sequences.filter(seq => {
      if (!showFlatPhotos && !seq.properties.is_pano) return false;
      if (!showPanoramicPhotos && seq.properties.is_pano) return false;

      const sequenceTimestamp = new Date(seq.properties.captured_at).getTime();
      if (fromTimestamp && fromTimestamp > sequenceTimestamp) return false;
      if (toTimestamp && toTimestamp < sequenceTimestamp) return false;

      if (usernames && !usernames.includes(seq.properties.captured_by)) return false;

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
    const kartaview = this.context.services.kartaview;
    if (!kartaview?.started) return;

    const parentContainer = this.scene.groups.get('streetview');
    let images = kartaview.getImages();
    let sequences = kartaview.getSequences();

    sequences = this.filterSequences(sequences);
    images = this.filterImages(images);

    // render sequences
    for (const d of sequences) {
      const featureID = `${this.layerID}-sequence-${d.properties.id}`;
      const sequenceVersion = d.properties.v || 0;
      let feature = this.features.get(featureID);

      if (!feature) {
        feature = new PixiFeatureLine(this, featureID);
        feature.style = LINESTYLE;
        feature.parentContainer = parentContainer;
        feature.container.zIndex = -100;  // beneath the markers (which should be [-90..90])
      }

      // If sequence data has changed, replace it.
      if (feature.v !== sequenceVersion) {
        feature.v = sequenceVersion;
        feature.geometry.setCoords(d.coordinates);
        feature.setData(d.properties.id, d);
      }

      this.syncFeatureClasses(feature);
      feature.update(viewport, zoom);
      this.retainFeature(feature, frame);
    }

    // render markers
    for (const d of images) {
      const featureID = `${this.layerID}-photo-${d.id}`;
      let feature = this.features.get(featureID);

      if (!feature) {
        feature = new PixiFeaturePoint(this, featureID);
        feature.geometry.setCoords(d.loc);
        feature.parentContainer = parentContainer;
        feature.setData(d.id, d);

        if (d.sequenceID) {
          feature.addChildData(d.sequenceID, d.id);
        }
      }

      this.syncFeatureClasses(feature);

      if (feature.dirty) {
        // Start with default style, and apply adjustments
        const style = Object.assign({}, MARKERSTYLE);

// todo handle pano
        if (feature.hasClass('selectphoto')) {  // selected photo style
          // style.viewfieldAngles = [this._viewerCompassAngle ?? d.ca];
          style.viewfieldAngles = Number.isFinite(d.ca) ? [d.ca] : [];
          style.viewfieldName = 'viewfield';
          style.viewfieldAlpha = 1;
          style.viewfieldTint = SELECTED;
          style.markerTint = SELECTED;
          style.scale = 2.0;
          //style.fovWidth = fovWidthInterp(this._viewerZoom);
          //style.fovLength = fovLengthInterp(this._viewerZoom);

        } else {
          style.viewfieldAngles = Number.isFinite(d.ca) ? [d.ca] : [];  // ca = camera angle
          style.viewfieldName = d.isPano ? 'pano' : 'viewfield';

          if (feature.hasClass('highlightphoto')) {  // highlighted photo style
            style.viewfieldAlpha = 1;
            style.viewfieldTint = SELECTED;
            style.markerTint = SELECTED;
          }
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
    const kartaview = this.context.services.kartaview;
    if (!this.enabled || !kartaview?.started || zoom < MINZOOM) return;

    kartaview.loadTiles();
    this.renderMarkers(frame, viewport, zoom);
  }

}
