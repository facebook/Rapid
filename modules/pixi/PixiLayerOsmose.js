import * as PIXI from 'pixi.js';
import { services } from '../services';
import { PixiLayer } from './PixiLayer';
import { PixiFeaturePoint } from './PixiFeaturePoint';

const LAYERID = 'osmose';
const LAYERZINDEX = 10;
const MINZOOM = 12;


/**
 * PixiLayerOsmose
 * @class
 */
export class PixiLayerOsmose extends PixiLayer {

  /**
   * @constructor
   * @param context
   * @param scene
   * @param dispatch
   */
  constructor(context, scene, dispatch) {
    super(context, LAYERID, LAYERZINDEX);

    this.scene = scene;
    this.dispatch = dispatch;

    this._service = null;
    this.getService();
  }


  /**
   * Services are loosely coupled in iD, so we use a `getService` function
   * to gain access to them, and bind any event handlers a single time.
   */
  getService() {
    if (services.osmose && !this._service) {
      this._service = services.osmose;
      // this._service.event.on('loadedImages', throttledRedraw);
    } else if (!services.osmose && this._service) {
      this._service = null;
    }

    return this._service;
  }


  /**
   * drawMarkers
   * @param projection - a pixi projection
   * @param zoom - the effective zoom to use for rendering
   */
  drawMarkers(projection, zoom) {
    const context = this.context;
    const scene = this.scene;

    const service = this.getService();
    if (!service) return;

    const visibleData = service.getItems(context.projection);

    visibleData.forEach(d => {
      const featureID = `${LAYERID}-${d.id}`;
      let feature = scene.get(featureID);

      if (!feature) {
        const color = service.getColor(d.item);
        const markerStyle = {
          markerName: 'osmose',
          markerTint: PIXI.utils.string2hex(color),
          iconName: d.icon
        };
        feature = new PixiFeaturePoint(context, featureID, d.loc, [], markerStyle);

        // bind data and add to scene
        const dObj = feature.displayObject;
        dObj.__data__ = d;
        this.container.addChild(dObj);

        // // mathematically 0,-15 is center of marker, move up slightly
        // icon.position.set(0, -16);
      }

      if (feature.needsUpdate(projection)) {
        feature.update(projection, zoom);
        scene.update(feature);
      }
    });
  }


  /**
   * render
   * Draw any data we have, and schedule fetching more of it to cover the view
   * @param projection - a pixi projection
   * @param zoom - the effective zoom to use for rendering
   */
  render(projection, zoom) {
    if (!this._enabled) return;

    const context = this.context;
    const service = this.getService();

    if (service && zoom >= MINZOOM) {
      this.visible = true;
      service.loadIssues(context.projection);  // note: context.projection !== pixi projection
      this.drawMarkers(projection, zoom);
    } else {
      this.visible = false;
    }
  }


  /**
   * supported
   * Whether the layer's service exists
   */
  get supported() {
    return !!this.getService();
  }

}
