import { AbstractLayer } from './AbstractLayer.js';
import { PixiFeatureLine } from './PixiFeatureLine.js';
import { PixiFeaturePoint } from './PixiFeaturePoint.js';

const MINZOOM = 12;
const KARTA_BLUE = 0x20c4ff;
const KARTA_SELECTED = 0xffee00;

const LINESTYLE = {
  casing: { alpha: 0 },  // disable
  stroke: { alpha: 0.9, width: 4, color: KARTA_BLUE }
};

const MARKERSTYLE = {
  markerName: 'mediumCircle',
  markerTint: KARTA_BLUE,
  viewfieldName: 'viewfield',
  viewfieldTint: KARTA_BLUE
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

    if (val) {
      this.dirtyLayer();
      this.context.services.kartaview.startAsync();
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
    const showFlatPhotos = photos.showsPhotoType('flat');
    const showPanoramicPhotos = photos.showsPhotoType('panoramic');

    if (!showFlatPhotos && !showPanoramicPhotos) {
      return [];
    } else if (showPanoramicPhotos && !showFlatPhotos) {
      images = images.filter(i => i.isPano);
    } else if (!showPanoramicPhotos && showFlatPhotos){
      images = images.filter(i => !i.isPano);
    }

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
   * Each sequence is represented as a GeoJSON LineString.
   * @param  {Array<sequence>}  sequences - all sequences
   * @return {Array<sequence>}  sequences with filtering applied
   */
  filterSequences(sequences) {
    const photos = this.context.systems.photos;
    const fromDate = photos.fromDate;
    const toDate = photos.toDate;
    const usernames = photos.usernames;

    const showFlatPhotos = photos.showsPhotoType('flat');
    const showPanoramicPhotos = photos.showsPhotoType('panoramic');

    if (!showFlatPhotos && !showPanoramicPhotos) {
      return [];
    } else if (showPanoramicPhotos && !showFlatPhotos) {
      sequences = sequences.filter(s => s.properties.isPano);
    } else if (!showPanoramicPhotos && showFlatPhotos){
      sequences =  sequences.filter(s => !s.properties.isPano);
    }

    if (fromDate) {
      const fromTimestamp = new Date(fromDate).getTime();
      sequences = sequences.filter(s => new Date(s.properties.captured_at).getTime() >= fromTimestamp);
    }
    if (toDate) {
      const toTimestamp = new Date(toDate).getTime();
      sequences = sequences.filter(s => new Date(s.properties.captured_at).getTime() <= toTimestamp);
    }
    if (usernames) {
      sequences = sequences.filter(s => usernames.includes(s.properties.captured_by));
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
    const service = this.context.services.kartaview;
    if (!service?.started) return;

    const parentContainer = this.scene.groups.get('streetview');
    let images = service.getImages();
    let sequences = service.getSequences();

    sequences = this.filterSequences(sequences);
    images = this.filterImages(images);

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
        const style = Object.assign({}, MARKERSTYLE);
// todo handle pano
        if (feature.active) {  // active style
          // style.viewfieldAngles = [this._viewerCompassAngle ?? d.ca];
          if (Number.isFinite(d.ca)) {
            style.viewfieldAngles = [d.ca];   // ca = camera angle
          } else {
            style.viewfieldAngles = [];
          }
          style.viewfieldName = 'viewfield';
          style.viewfieldTint = KARTA_SELECTED;
          style.markerTint = KARTA_SELECTED;
          style.scale = 2.0;
          //style.fovWidth = fovWidthInterp(this._viewerZoom);
          //style.fovLength = fovLengthInterp(this._viewerZoom);

        } else {  // default style
          if (Number.isFinite(d.ca)) {
            style.viewfieldAngles = [d.ca];   // ca = camera angle
          } else {
            style.viewfieldAngles = [];
          }
          style.viewfieldName = d.isPano ? 'pano' : 'viewfield';
          style.viewfieldTint = KARTA_BLUE;
          style.markerTint = KARTA_BLUE;
          style.scale = 1.0;
          //style.fovWidth = 1;
          //style.fovLength = 1;
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
    const service = this.context.services.kartaview;
    if (!this.enabled || !service?.started || zoom < MINZOOM) return;

    service.loadTiles();
    this.renderMarkers(frame, viewport, zoom);
  }

}
