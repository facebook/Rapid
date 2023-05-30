import { AbstractLayer } from './AbstractLayer';
import { PixiFeatureLine } from './PixiFeatureLine';
import { PixiFeaturePoint } from './PixiFeaturePoint';

const MINZOOM = 12;
const MAPILLARY_GREEN = 0x05CB63;

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

    this._service = null;
    this.getService();
  }


  /**
   * Services are loosely coupled, so we use a `getService` function
   * to gain access to them, and bind any event handlers a single time.
   */
  getService() {
    const mapillary = this.context.services.get('mapillary');
    if (mapillary && !this._service) {
      mapillary.on('loadedImages', () => this.context.mapSystem().deferredRedraw());
      this._service = mapillary;
    } else if (!mapillary && this._service) {
      this._service = null;
    }

    return this._service;
  }


  filterImages(images) {
    const photoSystem = this.context.photoSystem();
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
    const photoSystem = this.context.photoSystem();
    const fromDate = photoSystem.fromDate;
    const toDate = photoSystem.toDate;
    const usernames = photoSystem.usernames;

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
   * @param  frame        Integer frame being rendered
   * @param  projection   Pixi projection to use for rendering
   * @param  zoom         Effective zoom to use for rendering
   */
  renderMarkers(frame, projection, zoom) {
    const service = this.getService();
    if (!service) return;

    // const showMarkers = (zoom >= MINMARKERZOOM);
    // const showViewfields = (zoom >= MINVIEWFIELDZOOM);

    const parentContainer = this.scene.groups.get('streetview');
    const sequences = service.sequences(this.context.projection);
    const images = service.images(this.context.projection);

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
        feature.update(projection, zoom);
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
    if (!this._enabled || !service || zoom < MINZOOM) return;

    service.loadImages(this.context.projection);  // note: context.projection !== pixi projection
    this.renderMarkers(frame, projection, zoom);
  }


  /**
   * supported
   * Whether the Layer's service exists
   */
  get supported() {
    return !!this.getService();
  }

}
