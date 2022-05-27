import { services } from '../services';
import { PixiLayer } from './PixiLayer';
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
export class PixiLayerKeepRight extends PixiLayer {

  /**
   * @constructor
   * @param context
   * @param scene
   * @param layerZ
   */
  constructor(context, scene, layerZ) {
    super(context, LAYERID, layerZ);
    this.scene = scene;

    this._service = null;
    this.getService();
  }


  /**
   * Services are loosely coupled in iD, so we use a `getService` function
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
   * drawMarkers
   * @param timestamp    timestamp in milliseconds
   * @param projection   pixi projection to use for rendering
   * @param zoom         effective zoom to use for rendering
   */
  drawMarkers(timestamp, projection, zoom) {
    const context = this.context;
    const scene = this.scene;

    const service = this.getService();
    if (!service) return;

    const visibleData = service.getItems(context.projection);  // note: context.projection !== pixi projection

    visibleData.forEach(d => {
      const featureID = `${LAYERID}-${d.id}`;
      let feature = scene.get(featureID);

      if (!feature) {
        const style = {
          markerName: 'keepright',
          markerTint: TINTS.get(d.parentIssueType) || 0xffffff
        };

        feature = new PixiFeaturePoint(context, featureID, this.container, d, d.loc, style);
      }

      if (feature.dirty) {
        feature.update(projection, zoom);
        scene.update(feature);
      }

      if (feature.lod > 0 || feature.selected) {
        feature.visible = true;
        this.seenFeature.set(feature, timestamp);
      }
    });
  }


  /**
   * render
   * Draw any data we have, and schedule fetching more of it to cover the view
   * @param timestamp    timestamp in milliseconds
   * @param projection   pixi projection to use for rendering
   * @param zoom         effective zoom to use for rendering
   */
  render(timestamp, projection, zoom) {
    const context = this.context;
    const service = this.getService();

    if (this._enabled && service && zoom >= MINZOOM) {
      this.visible = true;
      service.loadIssues(context.projection);  // note: context.projection !== pixi projection

      this.drawMarkers(timestamp, projection, zoom);
      this.cull(timestamp);

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
