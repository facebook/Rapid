import { dispatch as d3_dispatch } from 'd3-dispatch';

import * as PIXI from 'pixi.js';
import { GlowFilter } from '@pixi/filter-glow';
import { Projection } from '@id-sdk/math';

import { PixiEventsHandler } from './PixiEventsHandler';
import { PixiLayers } from './PixiLayers';
import { PixiScene } from './PixiScene';
import { prepareTextures } from './textures';

const AUTOTICK = false;     // set to true to turn the ticker back on



/**
 * PixiRenderer
 * @class
 */
export class PixiRenderer {

  /**
   * @constructor
   * Create a Pixi application and add it to the given parentElement.
   * We also add it as `context.pixi` so that other parts of RapiD can use it.
   *
   * @param context
   * @param parentElement
   */
  constructor(context, parentElement) {
    this._context = context;
    this._dispatch = d3_dispatch('change', 'dragstart', 'dragend');
    this._redrawPending = false;

    this.pixi = new PIXI.Application({
      antialias: true,
      autoDensity: true,
      backgroundAlpha: 0.0,
      resizeTo: parentElement,
      resolution: window.devicePixelRatio
    });

    context.pixi = this.pixi;
    parentElement.appendChild(this.pixi.view);

    // Register Pixi with the pixi-inspector extension if it is installed
    // https://github.com/bfanger/pixi-inspector
    if (window.__PIXI_INSPECTOR_GLOBAL_HOOK__) {
      window.__PIXI_INSPECTOR_GLOBAL_HOOK__.register({ PIXI: PIXI });
    }

    // Prepare textures
    prepareTextures(context, this.pixi.renderer);

    // Setup the Ticker
    const ticker = this.pixi.ticker;
    if (AUTOTICK) {       // redraw automatically every frame
      ticker.maxFPS = 30;
      ticker.autoStart = true;
    } else {              // redraw only on zoom/pan
      ticker.autoStart = false;
      ticker.stop();
    }

    // Setup the Interaction Manager
    // const interactionManager = this.pixi.renderer.plugins.interaction;
    // interactionManager.interactionFrequency = 100;    // default 10ms, slow it down?  doesn't do what I thought

    const stage = this.pixi.stage;
    stage.name = 'stage';
    stage.sortableChildren = true;
    stage.interactive = true;
    // Add a big hit area to `stage` so that clicks on nothing will register
    stage.hitArea = new PIXI.Rectangle(-100000, -100000, 200000, 200000);

    this.pixiProjection = new Projection();
    this.scene = new PixiScene(context);
    this.layers = new PixiLayers(context, this.scene, this._dispatch);

    // this.eventsHandler = new PixiEventsHandler(context, this._dispatch, this.pixiProjection, this.scene);

    // used for highlighting:
    this._highlightedIDs = new Set();
    const glow = new GlowFilter({ distance: 15, outerStrength: 3, color: 0xf6634f });
    glow.resolution = 2;
    this.glow = glow;
  }


  /**
   * render
   */
  render() {
    if (this._redrawPending) return;

    // UPDATE TRANSFORM
    // Reproject the pixi geometries only whenever zoom changes
    const context = this._context;
    const pixiProjection = this.pixiProjection;
    const currTransform = context.projection.transform();
    const pixiTransform = pixiProjection.transform();

    let offset;
    if (pixiTransform.k !== currTransform.k) {    // zoom changed, reset
      offset = [0, 0];
      pixiProjection.transform(currTransform);
      this.dirtyScene();
    } else {
      offset = [ pixiTransform.x - currTransform.x, pixiTransform.y - currTransform.y ];
    }

    const stage = this.pixi.stage;

// this?
    stage.position.set(-offset[0], -offset[1]);

    // DRAW
    const timestamp = Date.now();
    const effectiveZoom = context.map().effectiveZoom();
    this.layers.render(timestamp, pixiProjection, effectiveZoom);


    if (!AUTOTICK) {    // tick manually
      this._redrawPending = true;
      window.requestAnimationFrame(timestamp => {
// this?
        this.pixi.ticker.update(timestamp);

//...or this?
//        const m = new PIXI.Matrix(1, 0, 0, 1, -offset[0], -offset[1]);
//        const options = {
//          transform: m,
//          // skipUpdateTransform: true
//        };
//        this.pixi.renderer.render(stage, options);

       this._redrawPending = false;
     });
    }
  }


  /**
   * dirtyEntities
   * flag these features as `dirty` if they are in the scene
   * @param  featureIDs   `Array` or `Set` of feature IDs to dirty
   */
  dirtyEntities(featureIDs) {
    (featureIDs || []).forEach(featureID => {
      const feature = this.scene.get(featureID);
      if (feature) {
        feature.dirty = true;
      }
    });
  }


  /**
   * dirtyScene
   * flag the whole scene as dirty
   * (when changing zooms)
   */
  dirtyScene() {
    this.scene._features.forEach(feature => feature.dirty = true);
  }


  /**
   * highlight
   * @param  featureIDs   `Array` or `Set` of feature IDs to highlight
   */
  highlight(featureIDs) {
    const toHighlight = new Set([].concat(featureIDs));  // coax ids into a Set

    // remove highlighting where not needed
    this._highlightedIDs.forEach(featureID => {
      if (toHighlight.has(featureID)) return;  // it should stay highlighted

      this._highlightedIDs.delete(featureID);
      const feature = this.scene.get(featureID);
      if (feature) {
        feature.displayObject.filters = [];
        feature.dirty = true;
      }
    });

    // add highlighting where needed
    toHighlight.forEach(featureID => {
      const feature = this.scene.get(featureID);
      if (!feature) return;

      if (this._highlightedIDs.has(feature.id)) return;  // it's already highlighted

      this._highlightedIDs.add(feature.id);
      feature.displayObject.filters = [ this.glow ];
      feature.dirty = true;
    });

    this.render();  //  now
  }

}
