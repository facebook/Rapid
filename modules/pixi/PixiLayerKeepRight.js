import { services } from '../services';
import { PixiLayer } from './PixiLayer';
import { PixiFeaturePoint } from './PixiFeaturePoint';

const LAYERID = 'keepRight';
const LAYERZINDEX = 10;
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
   * @param featureCache
   * @param dispatch
   */
  constructor(context, featureCache, dispatch) {
    super(context, LAYERID, LAYERZINDEX);

    this.featureCache = featureCache;
    this.dispatch = dispatch;

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
      // this._service.event.on('loadedImages', throttledRedraw);
    } else if (!services.keepRight && this._service) {
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
    const featureCache = this.featureCache;

    const service = this.getService();
    if (!service) return;

    const visibleData = service.getItems(context.projection);  // note: context.projection !== pixi projection

    visibleData.forEach(d => {
      const featureID = `${LAYERID}-${d.id}`;
      let feature = featureCache.get(featureID);

      if (!feature) {
        const markerStyle = {
          markerName: 'keepright',
          markerTint: 0xff3300
        };

        feature = new PixiFeaturePoint(context, featureID, d.loc, [], markerStyle);

        // bind data and add to scene
        const marker = feature.displayObject;
        marker.__data__ = d;
        this.container.addChild(marker);

        featureCache.set(featureID, feature);
      }

      feature.update(projection, zoom);
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
