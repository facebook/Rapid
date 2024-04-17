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

    this._handleBearingChange = this._handleBearingChange.bind(this);
    this._handleFovChange = this._handleFovChange.bind(this);
    this._handleZoomRetrieval = this._handleZoomRetrieval.bind(this);
    this._viewerCompassAngle = null;
    this._viewerZoom = MAPILLARY_ZOOM.min; //no zoom

    if (this.supported) {
      const service = this.context.services.mapillary;
      service.on('bearingChanged', this._handleBearingChange);
      service.on('fovChanged', this._handleFovChange);
    }
  }


  /**
   * _handleBearingCHange
   * Handle the user dragging inside of a panoramic photo.
   */
  _handleBearingChange(event) {
    this._viewerCompassAngle = event.bearing;
  }


  /**
   * _handleBearingCHange
   * Handle the user dragging inside of a panoramic photo.
   */
  _handleFovChange() {
    this.context.services.mapillary._mlyViewer.getZoom().then(this._handleZoomRetrieval);
  }


  // MLY 4.0 viewer will vary zoom from 0 (no zoom) to 3 (most zoomed)
  _handleZoomRetrieval(zoom) {
      this._viewerZoom = zoom;
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


  filterImages(images) {
    const photoSystem = this.context.systems.photos;
    const fromDate = photoSystem.fromDate;
    const toDate = photoSystem.toDate;
    const usernames = photoSystem.usernames;
    const showFlatPhotos = photoSystem.showsPhotoType('flat');
    const showPanoramicPhotos = photoSystem.showsPhotoType('panoramic');

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
      images = images.filter(i => usernames.indexOf(i.captured_by) !== -1);
    }
    return images;
  }


  filterSequences(sequences) {
    const photoSystem = this.context.systems.photos;
    const fromDate = photoSystem.fromDate;
    const toDate = photoSystem.toDate;
    const usernames = photoSystem.usernames;


    const showFlatPhotos = photoSystem.showsPhotoType('flat');
    const showPanoramicPhotos = photoSystem.showsPhotoType('panoramic');

    if (!showFlatPhotos && !showPanoramicPhotos) {
      return [];
    } else if (showPanoramicPhotos && !showFlatPhotos) {
      sequences = sequences.filter(seq => seq[0].properties.is_pano);
    } else if (!showPanoramicPhotos && showFlatPhotos){
      sequences =  sequences.filter(seq => !seq[0].properties.is_pano);
    }

    // note - Sequences now contains an Array of Linestrings, post #776
    // This is because we can get multiple linestrings for sequences that cross a tile boundary.
    // We just look at the first item in the array to determine whether to keep/filter the sequence.
    if (fromDate) {
      const fromTimestamp = new Date(fromDate).getTime();
      sequences = sequences.filter(s => new Date(s[0].properties.captured_at).getTime() >= fromTimestamp);
    }
    if (toDate) {
      const toTimestamp = new Date(toDate).getTime();
      sequences = sequences.filter(s => new Date(s[0].properties.captured_at).getTime() <= toTimestamp);
    }
    if (usernames) {
      sequences = sequences.filter(s => usernames.indexOf(s[0].properties.captured_by) !== -1);
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

    //We want the active image, which may or may not be the selected image.
    const activeIDs = this._classHasData.get('active') ?? new Set();

    if (!service?.started) return;

    // const showMarkers = (zoom >= MINMARKERZOOM);
    // const showViewfields = (zoom >= MINVIEWFIELDZOOM);

    const parentContainer = this.scene.groups.get('streetview');
    const sequences = service.getSequences();
    const images = service.getData('images');

    const sequenceData = this.filterSequences(sequences);
    const photoData = this.filterImages(images);

    // For each sequence, expect an Array of LineStrings
    for (const lineStrings of sequenceData) {
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


    for (const d of photoData) {
      const featureID = `${this.layerID}-photo-${d.id}`;
      let feature = this.features.get(featureID);

      if (!feature) {
        const style = Object.assign({}, MARKERSTYLE);
        if (Number.isFinite(d.ca)) {
          style.viewfieldAngles = [d.ca];   // ca = camera angle
        }
        if (d.isPano) {
          style.viewfieldName = 'pano';
        }

        feature = new PixiFeaturePoint(this, featureID);
        feature.geometry.setCoords(d.loc);
        feature.style = style;
        feature.parentContainer = parentContainer;
        feature.setData(d.id, d);

        if (d.sequenceID) {
          feature.addChildData(d.sequenceID, d.id);
        }
      }

      this.syncFeatureClasses(feature);

      if (activeIDs.has(d.id)) {
        feature.active = true;
        feature.style.viewfieldAngles = [this._viewerCompassAngle];
        feature.style.viewfieldName = 'viewfield';
        //Change highlight color and make the point/viewfield larger so the mapper can see it.
        feature.style.viewfieldTint = MAPILLARY_SELECTED;
        feature.style.markerTint = MAPILLARY_SELECTED;
        feature.style.scale = 2.0;

        //Vary the length and width of the viewfield as we zoom in.
        feature.style.fovWidth = fovWidthInterp(this._viewerZoom);
        feature.style.fovLength = fovLengthInterp(this._viewerZoom);
      } else  {
        feature.active = false;
        feature.style.viewfieldName = d.isPano ? 'pano' : 'viewfield';
        feature.style.viewfieldTint = MAPILLARY_GREEN;
        feature.style.markerTint = MAPILLARY_GREEN;
        feature.style.scale = 1.0;
        feature.style.fovWidth = 1;
        feature.style.fovLength = 1;
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
