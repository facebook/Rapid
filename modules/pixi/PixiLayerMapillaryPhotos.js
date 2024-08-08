import { scaleLinear as d3_scaleLinear } from 'd3-scale';

import { AbstractLayer } from './AbstractLayer.js';
import { PixiFeatureLine } from './PixiFeatureLine.js';
import { PixiFeaturePoint } from './PixiFeaturePoint.js';

const MINZOOM = 12;
const MAPILLARY_GREEN = 0x05CB63;
const MAPILLARY_SELECTED = 0xffee00;

//3: most zoomed- 0: no zoom
const MAPILLARY_ZOOM = { min: 0, max: 3 };

//Fully zoomed in = FOV width of 0.5 and length of 2
const fovWidthInterp = d3_scaleLinear([MAPILLARY_ZOOM.min, MAPILLARY_ZOOM.max], [1, 0.5], );
const fovLengthInterp = d3_scaleLinear([MAPILLARY_ZOOM.min, MAPILLARY_ZOOM.max],[1, 2]);

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

    this._viewerCompassAngle = null;
    this._viewerZoom = MAPILLARY_ZOOM.min; //no zoom

    // Make sure the event handlers have `this` bound correctly
    this._bearingchanged = this._bearingchanged.bind(this);
    this._fovchanged = this._fovchanged.bind(this);

    if (this.supported) {
      const service = this.context.services.mapillary;
      service.on('bearingChanged', this._bearingchanged);
      service.on('fovChanged', this._fovchanged);
    }
  }


  /**
   * _bearingchanged
   * Called whenever the viewer's compass bearing has changed (user pans around)
   */
  _bearingchanged(e) {
    this._viewerCompassAngle = e.bearing;
  }


  /**
   * _fovchanged
   * Called whenever the viewer's field of view has changed (user zooms/unzooms)
   */
  _fovchanged(e) {
    const viewer = e?.target?.viewer;
    if (!viewer) return;

    viewer.getZoom().then(val => this._viewerZoom = val);
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
   * Note - a 'sequence' is now an Array of Linestrings, post Rapid#776
   * This is because we can get multiple linestrings for sequences that cross a tile boundary.
   * We just look at the first item in the array to determine whether to keep/filter the sequence.
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
      sequences = sequences.filter(s => s[0].properties.is_pano);
    } else if (!showPanoramicPhotos && showFlatPhotos){
      sequences =  sequences.filter(s => !s[0].properties.is_pano);
    }

    if (fromDate) {
      const fromTimestamp = new Date(fromDate).getTime();
      sequences = sequences.filter(s => new Date(s[0].properties.captured_at).getTime() >= fromTimestamp);
    }
    if (toDate) {
      const toTimestamp = new Date(toDate).getTime();
      sequences = sequences.filter(s => new Date(s[0].properties.captured_at).getTime() <= toTimestamp);
    }
    if (usernames) {
      sequences = sequences.filter(s => usernames.includes(s[0].properties.captured_by));
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
    const service = this.context.services.mapillary;
    if (!service?.started) return;

    // const showMarkers = (zoom >= MINMARKERZOOM);
    // const showViewfields = (zoom >= MINVIEWFIELDZOOM);

    const parentContainer = this.scene.groups.get('streetview');
    let sequences = service.getSequences();
    let images = service.getData('images');

    sequences = this.filterSequences(sequences);
    images = this.filterImages(images);

    // render sequences
    for (const lineStrings of sequences) {
      for (let i = 0; i < lineStrings.length; ++i) {
        const d = lineStrings[i];
        const sequenceID = d.properties.id;
        const featureID = `${this.layerID}-sequence-${sequenceID}-${i}`;
        let feature = this.features.get(featureID);

        if (!feature) {
          feature = new PixiFeatureLine(this, featureID);
          feature.geometry.setCoords(d.geometry.coordinates);
          feature.style = LINESTYLE;
          feature.parentContainer = parentContainer;
          feature.container.zIndex = -100;  // beneath the markers (which should be [-90..90])
          feature.setData(sequenceID, d);
        }

        this.syncFeatureClasses(feature);
        feature.update(viewport, zoom);
        this.retainFeature(feature, frame);
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

        if (feature.active) {  // active style
          style.viewfieldAngles = [this._viewerCompassAngle];
          style.viewfieldName = 'viewfield';
          style.viewfieldTint = MAPILLARY_SELECTED;
          style.markerTint = MAPILLARY_SELECTED;
          style.scale = 2.0;
          style.fovWidth = fovWidthInterp(this._viewerZoom);
          style.fovLength = fovLengthInterp(this._viewerZoom);

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
