import { scaleLinear as d3_scaleLinear } from 'd3-scale';

import { AbstractLayer } from './AbstractLayer.js';
import { PixiFeatureLine } from './PixiFeatureLine.js';
import { PixiFeaturePoint } from './PixiFeaturePoint.js';

const MINZOOM = 12;
const MAPILLARY_GREEN = 0x05CB63;
const MAPILLARY_SELECTED = 0xffee00;

const fovWidthInterp = d3_scaleLinear([90, 10], [1.3, 0.7]);
const fovLengthInterp = d3_scaleLinear([90, 10], [0.7, 1.5]);

const LINESTYLE = {
  casing: { alpha: 0 },  // disable
  stroke: { alpha: 0.9, width: 4, color: MAPILLARY_GREEN }
};

const MARKERSTYLE = {
  markerName: 'mediumCircle',
  markerTint: MAPILLARY_GREEN,
  viewfieldName: 'viewfield',
  viewfieldTint: MAPILLARY_GREEN
};


/**
 * PixiLayerMapillaryPhotos
 * @class
 */
export class PixiLayerMapillaryPhotos extends AbstractLayer {

  /**
   * @constructor
   * @param  scene    The Scene that owns this Layer
   * @param  layerID  Unique string to use for the name of this Layer
   */
  constructor(scene, layerID) {
    super(scene, layerID);

    this._viewerBearing = null;
    this._viewerFov = 55;

    // Make sure the event handlers have `this` bound correctly
    this._bearingchanged = this._bearingchanged.bind(this);
    this._fovchanged = this._fovchanged.bind(this);

    if (this.supported) {
      const service = this.context.services.mapillary;
      service.on('bearingChanged', this._bearingchanged);
      service.on('fovChanged', this._fovchanged);
      service.on('imageChanged', () => {
        this._viewerFov = 55;
      });
    }
  }


  /**
   * _bearingchanged
   * Called whenever the viewer's compass bearing has changed (user pans around)
   * @param {number}  bearing - the new bearing value in degrees
   */
  _bearingchanged(bearing) {
    this._viewerBearing = bearing;
    this._dirtyCurrentPhoto();
  }


  /**
   * _fovchanged
   * Called whenever the viewer's field of view has changed (user zooms/unzooms)
   * @param {number}  fov - the new field of view value in degrees
   */
  _fovchanged(fov) {
    this._viewerFov = fov;
    this._dirtyCurrentPhoto();
  }


  /**
   * _dirtyCurrentPhoto
   * If we are interacting with the viewer (zooming / panning),
   * dirty the current photo so its view cone gets redrawn
   */
  _dirtyCurrentPhoto() {
    const context = this.context;
    const map = context.systems.map;
    const photos = context.systems.photos;

    const currPhotoID = photos.currPhotoID;
    if (!currPhotoID) return;  // shouldn't happen, the user is zooming/panning an image

    // Dirty the feature(s) for this image so they will be redrawn.
    const featureIDs = this._dataHasFeature.get(currPhotoID) ?? new Set();
    for (const featureID of featureIDs) {
      const feature = this.features.get(featureID);
      if (!feature) continue;
      feature._styleDirty = true;
    }
    map.immediateRedraw();
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
   * Note - a 'sequence' is now a FeatureCollection containing a LineString or MultiLineString, post Rapid#776
   * This is because we can get multiple linestrings for sequences that cross a vector tile boundary.
   * We just look at the first item in the features Array to determine whether to keep/filter the sequence.
   * @param  {Array<FeatureCollection>}  sequences - all sequences
   * @return {Array<FeatureCollection>}  sequences with filtering applied
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

    return sequences.filter(sequence => {
      const seq = sequence.features[0];  // Can contain multiple GeoJSON features, use the first one
      if (!seq) return false;
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
    const service = this.context.services.mapillary;
    if (!service?.started) return;

    // const showMarkers = (zoom >= MINMARKERZOOM);
    // const showViewfields = (zoom >= MINVIEWFIELDZOOM);

    const parentContainer = this.scene.groups.get('streetview');
    let sequences = service.getSequences();
    let images = service.getData('images');

    sequences = this.filterSequences(sequences);
    images = this.filterImages(images);

    // render sequences, they are actually FeatureCollections
    for (const fc of sequences) {
      const sequenceID = fc.id;
      const version = fc.v || 0;

      for (let i = 0; i < fc.features.length; ++i) {
        const d = fc.features[i];
        const parts = (d.geometry.type === 'LineString') ? [d.geometry.coordinates]
          : (d.geometry.type === 'MultiLineString') ? d.geometry.coordinates : [];

        for (let j = 0; j < parts.length; ++j) {
          const coords = parts[j];
          const featureID = `${this.layerID}-sequence-${sequenceID}-${i}-${j}`;
          let feature = this.features.get(featureID);

          if (!feature) {
            feature = new PixiFeatureLine(this, featureID);
            feature.style = LINESTYLE;
            feature.parentContainer = parentContainer;
            feature.container.zIndex = -100;  // beneath the markers (which should be [-90..90])
          }

          // If data has changed.. Replace it.
          if (feature.v !== version) {
            feature.v = version;
            feature.geometry.setCoords(coords);
            feature.setData(sequenceID, d);
          }

          this.syncFeatureClasses(feature);
          feature.update(viewport, zoom);
          this.retainFeature(feature, frame);
        }
      }
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
        const style = Object.assign({}, MARKERSTYLE);

        if (feature.selectphoto) {  // selected photo style
          style.viewfieldAngles = [this._viewerBearing ?? d.ca];
          style.viewfieldName = 'viewfield';
          style.viewfieldTint = MAPILLARY_SELECTED;
          style.markerTint = MAPILLARY_SELECTED;
          style.scale = 2.0;
          style.fovWidth = fovWidthInterp(this._viewerFov ?? 55);
          style.fovLength = fovLengthInterp(this._viewerFov ?? 55);

        } else {  // default style
          if (Number.isFinite(d.ca)) {
            style.viewfieldAngles = [d.ca];   // ca = camera angle
          } else {
            style.viewfieldAngles = [];
          }
          style.viewfieldName = d.isPano ? 'pano' : 'viewfield';
          style.viewfieldTint = MAPILLARY_GREEN;
          style.markerTint = MAPILLARY_GREEN;
          style.scale = 1.0;
          style.fovWidth = 1;
          style.fovLength = 1;
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
    const service = this.context.services.mapillary;
    if (!this.enabled || !service?.started || zoom < MINZOOM) return;

    service.loadTiles('images');
    this.renderMarkers(frame, viewport, zoom);
  }

}
