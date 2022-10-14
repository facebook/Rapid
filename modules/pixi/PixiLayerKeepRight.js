import { services } from '../services';
import { AbstractLayer } from './AbstractLayer';
import { PixiFeaturePoint } from './PixiFeaturePoint';

const LAYERID = 'keepRight';
const MINZOOM = 12;

// A mapping of KeepRight rule numbers to their respective tint colors.
const TINTS = new Map();

['20', '40', '210', '270', '310', '320', '350'].forEach(key => TINTS.set(key, 0xffff99));

TINTS.set('50', 0xffff99);

['60', '70', '90', '100', '110', '150', '220', '380'].forEach(key => TINTS.set(key, 0x55dd00));

TINTS.set('130', 0xffaa33);
TINTS.set('170', 0xffff00);

TINTS.set('190', 0xff3333);
TINTS.set('200', 0xfdbf6f);

TINTS.set('160', 0xbb6600);
TINTS.set('230', 0xbb6600);

TINTS.set('280', 0x5f47a0);
TINTS.set('180', 0xaaccee);
TINTS.set('290', 0xaaccee);

TINTS.set('300', 0x009900);
TINTS.set('390', 0x009900);

['360', '370', '410'].forEach(key => TINTS.set(key, 0xff99bb));

TINTS.set('120', 0xcc3355);
TINTS.set('400', 0xcc3355);


/**
 * PixiLayerKeepRight
 * @class
 */
export class PixiLayerKeepRight extends AbstractLayer {

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
    if (services.keepRight && !this._service) {
      this._service = services.keepRight;
      this._service.on('loaded', () => this.context.map().deferredRedraw());
    } else if (!services.keepRight && this._service) {
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
    const scene = this.scene;

    const service = this.getService();
    if (!service) return;

    const visibleData = service.getItems(this.context.projection);  // note: context.projection !== pixi projection

    visibleData.forEach(d => {
      const dataID = d.key;
      const featureID = `${LAYERID}-${dataID}`;
      let feature = scene.getFeature(featureID);

      if (!feature) {
        const style = {
          markerName: 'keepright',
          markerTint: TINTS.get(d.parentIssueType) || 0xffffff
        };

        feature = new PixiFeaturePoint(this, featureID);
        feature.data = d;
        feature.geometry = d.loc;
        feature.style = style;
        feature.parent = this.container;
        scene.addFeature(feature);
        scene.bindData(featureID, dataID);
      }

      scene.syncFeatureState(feature);
      feature.update(projection, zoom);
      scene.retainFeature(feature, frame);
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
