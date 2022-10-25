import { services } from '../services';
import { AbstractLayer } from './AbstractLayer';
import { PixiFeatureLine } from './PixiFeatureLine';
import { PixiFeaturePoint } from './PixiFeaturePoint';

const LAYERID = 'streetside';
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
   * @param  layerZ   z-index to assign to this Layer's container
   */
  constructor(scene, layerZ) {
    super(scene, LAYERID, layerZ);

    this._service = null;
    this.getService();
  }


  /**
   * Services are loosely coupled in RapiD, so we use a `getService` function
   * to gain access to them, and bind any event handlers a single time.
   */
  getService() {
    if (services.streetside && !this._service) {
      this._service = services.streetside;
      this._service.on('loadedImages', () => this.context.map().deferredRedraw());
    } else if (!services.streetside && this._service) {
      this._service = null;
    }

    return this._service;
  }


  filterImages(images) {
    const fromDate = this.context.photos().fromDate;
    const toDate = this.context.photos().toDate;
    const usernames = this.context.photos().usernames;

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
    const fromDate = this.context.photos().fromDate;
    const toDate = this.context.photos().toDate;
    const usernames = this.context.photos().usernames;

    if (fromDate) {
      const fromTimestamp = new Date(fromDate).getTime();
      sequences = sequences.filter(s => new Date(s.properties.captured_at).getTime() >= fromTimestamp);
    }
    if (toDate) {
      const toTimestamp = new Date(toDate).getTime();
      sequences = sequences.filter(s => new Date(s.properties.captured_at).getTime() <= toTimestamp);
    }
    if (usernames) {
      sequences = sequences.filter(s => usernames.indexOf(s.properties.captured_by) !== -1);
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

    const images = service.bubbles(this.context.projection);
    const sequences = service.sequences(this.context.projection);

    const sequenceData = this.filterSequences(sequences);
    const photoData = this.filterImages(images);

    sequenceData.forEach(d => {
      const featureID = `${LAYERID}-sequence-${d.properties.key}`;
      let feature = this.getFeature(featureID);

      if (!feature) {
        feature = new PixiFeatureLine(this, featureID);
        feature.data = d;
        feature.geometry = d.coordinates;
        feature.style = LINESTYLE;
        feature.parentContainer = this.container;
        feature.container.zIndex = -100;  // beneath the markers (which should be [-90..90])
        feature.bindData(d, d.properties.key);
      }

      this.syncFeatureClasses(feature);
      feature.update(projection, zoom);
      this.retainFeature(feature, frame);
    });


    photoData.forEach(d => {
      const featureID = `${LAYERID}-photo-${d.key}`;
      let feature = this.getFeature(featureID);

      if (!feature) {
        const style = Object.assign({}, MARKERSTYLE);
        if (Number.isFinite(d.ca)) {
          style.viewfieldAngles = [d.ca];   // ca = camera angle
        }

        feature = new PixiFeaturePoint(this, featureID);
        feature.data = d;
        feature.geometry = d.loc;
        feature.style = style;
        feature.parentContainer = this.container;
        feature.bindData(d, d.key);

        if (d.sequenceKey) {
          feature.addChildData(d.sequenceKey, d.key);
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

    if (this._enabled && service && zoom >= MINZOOM) {
      this.visible = true;
      service.loadBubbles(this.context.projection);  // note: context.projection !== pixi projection
      this.renderMarkers(frame, projection, zoom);

    } else {
      this.visible = false;
    }
  }


  /**
   * supported
   * Whether the Layer's service exists
   */
  get supported() {
    return !!this.getService();
  }

}

