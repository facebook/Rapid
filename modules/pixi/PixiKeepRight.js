import * as PIXI from 'pixi.js';
// import _throttle from 'lodash-es/throttle';

import { services } from '../services';
import { PixiLayer } from './PixiLayer';


const LAYERID = 'KeepRight';
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
 * PixiKeepRight
 * @class
 */
export class PixiKeepRight extends PixiLayer {

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

    // Create marker texture
    this.textures = {};
    const lightning = new PIXI.Graphics()
      .lineStyle(1, 0x33333)
      .beginFill(0xffffff)
      .moveTo(15, 6.5)
      .lineTo(10.8, 6.5)
      .bezierCurveTo(12.2, 1.3, 11.7, 0.8, 11.2, 0.8)
      .lineTo(6.2, 0.8)
      .bezierCurveTo(5.8, 0.7, 5.4, 1, 5.4, 1.5)
      .lineTo(4.2, 10.2)
      .bezierCurveTo(4.1, 10.8, 4.6, 11.2, 5, 11.2)
      .lineTo(9.3, 11.2)
      .lineTo(7.6, 18.3)
      .bezierCurveTo(7.5, 18.8, 8, 19.3, 8.5, 19.3)
      .bezierCurveTo(8.8, 19.3, 9.1, 19.1, 9.2, 18.8)
      .lineTo(15.6, 7.8)
      .bezierCurveTo(16, 7.2, 15.6, 6.5, 15, 6.5)
      .endFill()
      .closePath();

    const renderer = context.pixi.renderer;
    const options = { resolution: 2 };
    this.textures.lightning = renderer.generateTexture(lightning, options);
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
   */
  drawMarkers(projection) {
    const context = this.context;
    const featureCache = this.featureCache;
    const k = projection.scale();

    const service = this.getService();
    if (!service) return;

    const visibleData = service.getItems(context.projection);
    visibleData.forEach(function prepareKeepRightMarkers(d) {
      const featureID = `${LAYERID}-${d.id}`;
      let feature = featureCache.get(featureID);

      if (!feature) {
        const marker = new PIXI.Sprite(this.textures.lightning);
        marker.name = featureID;
        marker.buttonMode = true;
        marker.interactive = true;
        marker.zIndex = -d.loc[1];   // sort by latitude ascending
        marker.anchor.set(0.5, 1);   // middle, bottom
        marker.tint = TINTS.get(d.parentIssueType) || 0xffffff;
        this.container.addChild(marker);

        feature = {
          displayObject: marker,
          loc: d.loc,
        };

        featureCache.set(featureID, feature);
      }

      if (k === feature.k) return;
      feature.k = k;

      // Reproject and recalculate the bounding box
      const [x, y] = projection.project(feature.loc);
      feature.displayObject.position.set(x, y);
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
      this.drawMarkers(projection);
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
