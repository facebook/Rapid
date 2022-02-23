import * as PIXI from 'pixi.js';
// import _throttle from 'lodash-es/throttle';

import { services } from '../services';
import { PixiLayer } from './PixiLayer';
import { getIconSpriteHelper } from './helpers';


const LAYERID = 'improveOSM';
const LAYERZINDEX = 10;
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
 * PixiImproveOSM
 * @class
 */
export class PixiImproveOSM extends PixiLayer {

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

    // var throttledRedraw = _throttle(function () { this.dispatch.call('change'); }, 1000);

    // Create marker texture
    this.textures = {};
    const marker = new PIXI.Graphics()
      .lineStyle(1, 0x333333)
      .beginFill(0xffffff)
      .drawPolygon([16,3, 4,3, 1,6, 1,17, 4,20, 7,20, 10,27, 13,20, 16,20, 19,17.033, 19,6])
      .endFill()
      .closePath();

    const renderer = context.pixi.renderer;
    const options = { resolution: 2 };
    this.textures.improveOSMMarker = renderer.generateTexture(marker, options);
  }


  /**
   * Services are loosely coupled in iD, so we use a `getService` function
   * to gain access to them, and bind any event handlers a single time.
   */
  getService() {
    if (services.improveOSM && !this._service) {
      this._service = services.improveOSM;
      // this._service.event.on('loaded', throttledRedraw);
    } else if (!services.improveOSM && this._service) {
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

    const visibleData = service.getItems(context.projection);  // note: context.projection !== pixi projection
    visibleData.forEach(d => {
      const featureID = `${LAYERID}-${d.id}`;
      let feature = featureCache.get(featureID);

      if (!feature) {
        const marker = new PIXI.Sprite(this.textures.improveOSMMarker);
        marker.name = featureID;
        marker.buttonMode = true;
        marker.interactive = true;
        marker.zIndex = -d.loc[1];   // sort by latitude ascending
        marker.anchor.set(0.5, 1);   // middle, bottom
        marker.tint = TINTS.get(d.itemType) || 0xffffff;
        this.container.addChild(marker);

        if (d.icon) {
          const ICONSIZE = 11;
          const icon = getIconSpriteHelper(context, d.icon);
          icon.buttonMode = false;
          icon.interactive = false;
          icon.interactiveChildren = false;
          // mathematically 0,-15 is center of marker, move up slightly
          icon.position.set(0, -16);
          icon.width = ICONSIZE;
          icon.height = ICONSIZE;
          marker.addChild(icon);
        }

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
