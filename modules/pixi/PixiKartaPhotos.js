import * as PIXI from 'pixi.js';
// import _throttle from 'lodash-es/throttle';

import { services } from '../services';
import { PixiLayer } from './PixiLayer';
import { getViewfieldContainer } from './helpers';


const LAYERID = 'openstreetcam';
const LAYERZINDEX = 10;
const MINZOOM = 12;
const MINMARKERZOOM = 16;
const MINVIEWFIELDZOOM = 18;

const KARTA_BLUE = 0x20c4ff;


/**
 * PixiKartaPhotos
 * @class
 */
export class PixiKartaPhotos extends PixiLayer {

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
    const circle = new PIXI.Graphics()
      .lineStyle({ width: 1, color: 0x222222 })
      .beginFill(KARTA_BLUE)
      .drawCircle(6, 6, 6)
      .endFill();

    const renderer = context.pixi.renderer;
    const options = { resolution: 2 };
    this.textures.circle = renderer.generateTexture(circle, options);
  }


  /**
   * Services are loosely coupled in iD, so we use a `getService` function
   * to gain access to them, and bind any event handlers a single time.
   */
  getService() {
    if (services.openstreetcam && !this._service) {
      this._service = services.openstreetcam;
      // this._service.event.on('loadedImages', throttledRedraw);
    } else if (!services.openstreetcam && this._service) {
      this._service = null;
    }

    return this._service;
  }


  filterImages(images) {
    const fromDate = this.context.photos().fromDate();
    const toDate = this.context.photos().toDate();
    const usernames = this.context.photos().usernames();

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
    const fromDate = this.context.photos().fromDate();
    const toDate = this.context.photos().toDate();
    const usernames = this.context.photos().usernames();

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
   * drawMarkers
   * @param projection - a pixi projection
   * @param zoom - the effective zoom
   */
  drawMarkers(projection, zoom) {
    const context = this.context;
    const featureCache = this.featureCache;
    const k = projection.scale();

    const service = this.getService();
    if (!service) return;

    const showMarkers = (zoom >= MINMARKERZOOM);
    const showViewfields = (zoom >= MINVIEWFIELDZOOM);

    const images = (showMarkers ? service.images(context.projection) : []);
    const sequences = service.sequences(context.projection);

    const sequenceData = this.filterSequences(sequences);
    const photoData = this.filterImages(images);

    sequenceData.forEach(d => {
      const featureID = `${LAYERID}-sequence-${d.properties.key}`;
      let feature = featureCache.get(featureID);

      if (!feature) {
        const line = new PIXI.Graphics();
        line.name = featureID;
        line.buttonMode = true;
        line.interactive = true;
        line.zIndex = -100;  // beneath the markers (which should be [-90..90])
        this.container.addChild(line);

        feature = {
          displayObject: line,
          coords: d.coordinates
        };

        featureCache.set(featureID, feature);
      }

      if (k === feature.k) return;
      feature.k = k;

      const points = feature.coords.map(coord => projection.project(coord));
      const g = feature.displayObject
        .clear()
        .lineStyle({ color: KARTA_BLUE, width: 4 });

      points.forEach(([x, y], i) => {
        if (i === 0) {
          g.moveTo(x, y);
        } else {
          g.lineTo(x, y);
        }
      });
    });


    photoData.forEach(d => {
      const featureID = `${LAYERID}-photo-${d.key}`;
      let feature = featureCache.get(featureID);

      if (!feature) {
        const marker = new PIXI.Sprite(this.textures.circle);
        marker.name = featureID;
        marker.buttonMode = true;
        marker.interactive = true;
        marker.zIndex = -d.loc[1];    // sort by latitude ascending
        marker.anchor.set(0.5, 0.5);  // middle, middle
        this.container.addChild(marker);

        // Get the capture angle, if any, and attach a viewfield to the point.
        if (d.ca) {
          const vfContainer = getViewfieldContainer(this.context, [d.ca], KARTA_BLUE);
          marker.interactive = false;
          marker.addChild(vfContainer);
        }

        feature = {
          displayObject: marker,
          loc: d.loc
        };

        featureCache.set(featureID, feature);
      }

      if (k === feature.k) return;
      feature.k = k;

      // Reproject and recalculate the bounding box
      const [x, y] = projection.project(feature.loc);
      feature.displayObject.position.set(x, y);

      feature.displayObject.visible = showMarkers;

      const vfContainer = feature.displayObject.getChildByName('viewfields');
      if (vfContainer) {
        vfContainer.visible = showViewfields;
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
      service.loadImages(context.projection);  // note: context.projection !== pixi projection
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
