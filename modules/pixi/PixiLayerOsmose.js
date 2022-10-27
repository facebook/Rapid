import * as PIXI from 'pixi.js';
import { services } from '../services';
import { AbstractLayer } from './AbstractLayer';
import { PixiFeaturePoint } from './PixiFeaturePoint';

const MINZOOM = 12;


/**
 * PixiLayerOsmose
 * @class
 */
export class PixiLayerOsmose extends AbstractLayer {

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
    if (services.osmose && !this._service) {
      this._service = services.osmose;
      this._service.on('loaded', () => this.context.map().deferredRedraw());
    } else if (!services.osmose && this._service) {
      this._service = null;
    }

    return this._service;
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

    const parentContainer = this.scene.groups.get('qa');
    const visibleData = service.getItems(this.context.projection);

    visibleData.forEach(d => {
      const featureID = `${this.layerID}-${d.id}`;
      let feature = this.features.get(featureID);

      if (!feature) {
        const color = service.getColor(d.item);
        const style = {
          markerName: 'osmose',
          markerTint: PIXI.utils.string2hex(color),
          iconName: d.icon
        };

        feature = new PixiFeaturePoint(this, featureID);
        feature.geometry = d.loc;
        feature.style = style;
        feature.parentContainer = parentContainer;
        // // mathematically 0,-15 is center of marker, move up slightly
        // icon.position.set(0, -16);
        feature.bindData(d, d.id);
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
    if (!this.enabled || !service || zoom < MINZOOM) return;

    service.loadIssues(this.context.projection);  // note: context.projection !== pixi projection
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
