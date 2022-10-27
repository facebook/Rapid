import { services } from '../services';
import { AbstractLayer } from './AbstractLayer';
import { PixiFeatureLine } from './PixiFeatureLine';
import { PixiFeaturePoint } from './PixiFeaturePoint';

const MINZOOM = 12;
const MAPILLARY_GREEN = 0x55ff22;

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
   * Services are loosely coupled in RapiD, so we use a `getService` function
   * to gain access to them, and bind any event handlers a single time.
   */
  getService() {
    if (services.mapillary && !this._service) {
      this._service = services.mapillary;
      this._service.on('loadedImages', () => this.context.map().deferredRedraw());
    } else if (!services.mapillary && this._service) {
      this._service = null;
    }

    return this._service;
  }
//
//
//  filterImages(images) {
//    const fromDate = this.context.photos().fromDate;
//    const toDate = this.context.photos().toDate;
//    const usernames = this.context.photos().usernames;
//
//    if (fromDate) {
//      const fromTimestamp = new Date(fromDate).getTime();
//      images = images.filter(i => new Date(i.captured_at).getTime() >= fromTimestamp);
//    }
//    if (toDate) {
//      const toTimestamp = new Date(toDate).getTime();
//      images = images.filter(i => new Date(i.captured_at).getTime() <= toTimestamp);
//    }
//    if (usernames) {
//      images = images.filter(i => usernames.indexOf(i.captured_by) !== -1);
//    }
//    return images;
//  }
//
//
//  filterSequences(sequences) {
//    const fromDate = this.context.photos().fromDate;
//    const toDate = this.context.photos().toDate;
//    const usernames = this.context.photos().usernames;
//
//    if (fromDate) {
//      const fromTimestamp = new Date(fromDate).getTime();
//      sequences = sequences.filter(s => new Date(s.properties.captured_at).getTime() >= fromTimestamp);
//    }
//    if (toDate) {
//      const toTimestamp = new Date(toDate).getTime();
//      sequences = sequences.filter(s => new Date(s.properties.captured_at).getTime() <= toTimestamp);
//    }
//    if (usernames) {
//      sequences = sequences.filter(s => usernames.indexOf(s.properties.captured_by) !== -1);
//    }
//    return sequences;
//  }


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
    const sequenceData = service.sequences(this.context.projection);
    const photoData = service.images(this.context.projection);

    // const sequenceData = this.filterSequences(sequences);
    // const photoData = this.filterImages(images);

    sequenceData.forEach(d => {
      const featureID = `${this.layerID}-sequence-${d.properties.id}`;
      let feature = this.features.get(featureID);

      if (!feature) {
        feature = new PixiFeatureLine(this, featureID);
        feature.geometry = d.geometry.coordinates;
        feature.style = LINESTYLE;
        feature.parentContainer = parentContainer;
        feature.container.zIndex = -100;  // beneath the markers (which should be [-90..90])
        feature.bindData(d, d.properties.id);
      }

      this.syncFeatureClasses(feature);
      feature.update(projection, zoom);
      this.retainFeature(feature, frame);
    });


    photoData.forEach(d => {
      const featureID = `${this.layerID}-photo-${d.id}`;
      let feature = this.features.get(featureID);

      if (!feature) {
        const style = Object.assign({}, MARKERSTYLE);
        if (Number.isFinite(d.ca)) {
          style.viewfieldAngles = [d.ca];   // ca = camera angle
        }

        feature = new PixiFeaturePoint(this, featureID);
        feature.geometry = d.loc;
        feature.style = style;
        feature.parentContainer = parentContainer;
        feature.bindData(d, d.id);

        if (d.sequence_id) {
          feature.addChildData(d.sequence_id, d.id);
        }
      }

      this.syncFeatureClasses(feature);
      feature.update(projection, zoom);
      this.retainFeature(feature, frame);
    });

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
