import * as PIXI from 'pixi.js';
// import _throttle from 'lodash-es/throttle';

import { services } from '../services';
import { PixiLayer } from './PixiLayer';


const LAYERID = 'OSMNotes';
const LAYERZINDEX = 10;
const MINZOOM = 12;



/**
 * PixiOsmNotes
 * @class
 */
export class PixiOsmNotes extends PixiLayer {

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

    // Create marker textures
    this.textures = {};
    const balloon = new PIXI.Graphics()
      .lineStyle(1.5, 0x333333)
      .beginFill(0xff3300, 1)
      .moveTo(17.5, 0)
      .lineTo(2.5,0)
      .bezierCurveTo(1.13, 0, 0, 1.12, 0, 2.5)
      .lineTo(0, 13.75)
      .bezierCurveTo(0, 15.12, 1.12, 16.25, 2.5, 16.25)
      .lineTo(6.25, 16.25)
      .lineTo(6.25, 19.53)
      .bezierCurveTo(6.25, 19.91, 6.68, 20.13, 7, 19.9)
      .lineTo(11.87, 16.25)
      .lineTo(17.49, 16.25)
      .bezierCurveTo(18.86, 16.25, 20, 15.12, 20, 13.75)
      .lineTo(20, 2.5)
      .bezierCurveTo(20, 1.13, 18.87, 0, 17.5, 0)
      .closePath()
      .endFill();

    // We'll need to re-use the balloon path later when we start rendering 'new' notes
    // Now draw the 'x' in the middle of the balloon
    const marker = balloon.clone()
      .lineStyle(1.5, 0x333333)
      .moveTo(7, 5)
      .lineTo(14, 12)
      .moveTo(14, 5)
      .lineTo(7, 12)
      .closePath();

    const markerHighlight = new PIXI.Graphics()
      .lineStyle(4, 0xcccccc, 0.6)
      .moveTo(-1, -1)
      .lineTo(-1, 17.25)
      .lineTo(18.5, 17.25)
      .lineTo(18.5, -1)
      .closePath();

    const ellipse = new PIXI.Graphics()
      .lineStyle(1, 0x222222, 0.6)
      .beginFill(0x222222, 0.6)
      .drawEllipse(0.5, 1, 6.5, 3)
      .endFill();

    const renderer = context.pixi.renderer;
    const options = { resolution: 2 };
    this.textures.marker = renderer.generateTexture(marker, options);
    this.textures.markerHighlight = renderer.generateTexture(markerHighlight, options);
    this.textures.ellipse = renderer.generateTexture(ellipse, options);
  }


  /**
   * Services are loosely coupled in iD, so we use a `getService` function
   * to gain access to them, and bind any event handlers a single time.
   */
  getService() {
    if (services.osm && !this._service) {
      this._service = services.osm;
      // this._service.on('loadedNotes', throttledRedraw);
    } else if (!services.osm && this._service) {
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

    // const selectedID = context.selectedNoteID();

    const visibleData = service.notes(context.projection);
    visibleData.forEach(function prepareOsmNoteMarkers(d) {
      const featureID = `${LAYERID}-${d.id}`;
      let feature = featureCache.get(featureID);

      if (!feature) {   // make point if needed
        const container = new PIXI.Container();
        container.name = featureID;
        container.buttonMode = true;
        container.interactive = true;
        container.zIndex = -d.loc[1];   // sort by latitude ascending
        this.container.addChild(container);

        const highlight = new PIXI.Sprite(this.textures.markerHighlight);
        highlight.name = 'highlight';
        highlight.buttonMode = false;
        highlight.interactive = false;
        highlight.interactiveChildren = false;
        highlight.anchor.set(0.5, 1);  // middle, bottom
        highlight.visible = false;

        const ellipse = new PIXI.Sprite(this.textures.ellipse);
        ellipse.name = 'ellipse';
        ellipse.buttonMode = false;
        ellipse.interactive = false;
        ellipse.interactiveChildren = false;
        ellipse.anchor.set(0.5, 0);  // middle, top
        ellipse.x = -2;

        const marker = new PIXI.Sprite(this.textures.marker);
        marker.name = 'marker';
        marker.buttonMode = false;
        marker.interactive = false;
        marker.interactiveChildren = false;
        marker.anchor.set(0.5, 1);  // middle, bottom

        container.addChild(highlight, ellipse, marker);

// experiment
//        //Mouse hover interactivity
//        container.on('pointermove', (iData) => {
//            const interactionManager = context.pixi.renderer.plugins.interaction;
//
//            let hitObject = interactionManager.hitTest(iData.data.global, container);
//            const feature = featureCache.get(note.id);
//            if (hitObject !== null) {
//                // feature.displayObject.alpha = 0.5;
//                feature.highlight.visible = true;
//                dispatch.call('change');
//            } else {
//                // feature.displayObject.alpha = 1.0;
//                feature.highlight.visible = false;
//                dispatch.call('change');
//            }
//        });
//
//        container.on('pointerdown', (iData) => {
//            const interactionManager = context.pixi.renderer.plugins.interaction;
//
//            let hitObject = interactionManager.hitTest(iData.data.global, container);
//            if (hitObject !== null) {
//                context.selectedNoteID(note.id).enter(modeSelectNote(context, note.id));
//                dispatch.call('change');
//            } else {
//                context.selectedNoteID(null);
//            }
//        });

        feature = {
          displayObject: container,
          loc: d.loc
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

