import { services } from '../services';
import { AbstractLayer } from './AbstractLayer';
import { PixiFeaturePoint } from './PixiFeaturePoint';

const LAYERID = 'improveOSM';
const MINZOOM = 12;

// A mapping of improveOSM rule numbers and their respective tint colors.
const TINTS = new Map();
TINTS.set('tr', 0xec1c24);         // turn restrictions
TINTS.set('ow', 0x1e90ff);         // oneway restrictions
TINTS.set('mr-road', 0xb452cd);    // missing missing road
TINTS.set('mr-path', 0xa0522d);    // missing path
TINTS.set('mr-parking', 0xeeee00); // missing parking
TINTS.set('mr-both', 0xffa500);    // missing road + parking


/**
 * PixiLayerImproveOsm
 * @class
 */
export class PixiLayerImproveOsm extends AbstractLayer {

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
    if (services.improveOSM && !this._service) {
      this._service = services.improveOSM;
      this._service.on('loaded', () => this.context.map().deferredRedraw());
    } else if (!services.improveOSM && this._service) {
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

    const visibleData = service.getItems(this.context.projection);  // note: context.projection !== pixi projection

    visibleData.forEach(d => {
      const featureID = `${LAYERID}-${d.id}`;
      let feature = this.getFeature(featureID);

      if (!feature) {
        const markerStyle = {
          markerName: 'improveosm',
          markerTint: TINTS.get(d.itemType) || 0xffffff,
          iconName: d.icon
        };

        feature = new PixiFeaturePoint(this, featureID);
        feature.geometry = d.loc;
        feature.style = markerStyle;
        feature.parentContainer = this.container;
        feature.bindData(d, d.id);
        // was here before
        // if (feature.icon) {
        //  // mathematically 0,-15 is center of marker, move up slightly
        //  feature.icon.position.set(0, -16);
        // }
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
      service.loadIssues(this.context.projection);  // note: context.projection !== pixi projection
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
