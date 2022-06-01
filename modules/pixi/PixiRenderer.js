import { dispatch as d3_dispatch } from 'd3-dispatch';

import * as PIXI from 'pixi.js';
import { GlowFilter } from '@pixi/filter-glow';
import { skipHello } from '@pixi/utils';
import { Projection } from '@id-sdk/math';

import { PixiEventsHandler } from './PixiEventsHandler';
import { PixiLayers } from './PixiLayers';
import { PixiScene } from './PixiScene';
import { PixiTextures } from './PixiTextures';

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
   * @param  context
   * @param  parentElement
   */
  constructor(context, parentElement) {
    this._context = context;
    this._dispatch = d3_dispatch('change', 'dragstart', 'dragend');
    this._frame = 0;
    this._drawPending = false;

    // Register Pixi with the pixi-inspector extension if it is installed
    // https://github.com/bfanger/pixi-inspector
    if (window.__PIXI_INSPECTOR_GLOBAL_HOOK__) {
      window.__PIXI_INSPECTOR_GLOBAL_HOOK__.register({ PIXI: PIXI });
    }

    if (window.mocha) {
      skipHello();
    }

    // Disable mipmapping, we always want textures near the resolution they are at.
    PIXI.settings.MIPMAP_TEXTURES = PIXI.MIPMAP_MODES.OFF;

    // Create a Pixi application and add it to the parent container
    this.pixi = new PIXI.Application({
      antialias: true,
      autoDensity: true,
      backgroundAlpha: 0.0,
      resizeTo: parentElement,
      resolution: window.devicePixelRatio
    });

    context.pixi = this.pixi;
    parentElement.appendChild(this.pixi.view);

    // Prepare textures
    this.textures = new PixiTextures(context);

    // Prepare a basic bitmap font that we can use for things like debug messages
    PIXI.BitmapFont.from('debug', {
      fill: 0xffffff,
      fontSize: 14,
      stroke: 0x333333,
      strokeThickness: 2
    },{
      chars: PIXI.BitmapFont.ASCII,
      padding: 0,
      resolution: 2
    });

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
    // interactionManager.useSystemTicker = false;

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
    this._hoveredIDs = new Set();
    this._selectedIDs = new Set();
    this._highlightedIDs = new Set();
    this._highlightTick = 0;

    const selectglow = new GlowFilter({ distance: 15, outerStrength: 3, color: 0xf6634f });
    selectglow.resolution = 2;
    this.selectglow = selectglow;

    const hoverglow = new GlowFilter({ distance: 15, outerStrength: 3, color: 0xffffff });
    hoverglow.resolution = 2;
    this.hoverglow = hoverglow;
  }


  /**
   * render
   * The "RapiD" part of the drawing
   * Where we set up the scene graph and tell Pixi what needs to be drawn
   */
  render() {
    if (this._drawPending) return;

const frame = this._frame;
const markStart = `app-${frame}-start`;
const markEnd = `app-${frame}-end`;
const m1 = window.performance.mark(markStart);
const timestamp = m1.startTime;

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

    // this?
    const stage = this.pixi.stage;
    stage.position.set(-offset[0], -offset[1]);

    const effectiveZoom = context.map().effectiveZoom();
    this.layers.render(timestamp, pixiProjection, effectiveZoom);


const m2 = window.performance.mark(markEnd);
const measure = window.performance.measure(`app-${frame}`, markStart, markEnd);
const duration = measure.duration.toFixed(1);
console.log(`app ${frame} - ${duration} ms`);

    if (!AUTOTICK) {    // tick manually
      this._drawPending = true;
      // window.requestAnimationFrame(() => {
        this.draw();
     // });
    }
  }


  /**
   * draw
   * The "Pixi" part of the drawing
   * Where it converts Pixi geometries into WebGL instructions
   */
  draw() {

const frame = this._frame;
const markStart = `draw-${frame}-start`;
const markEnd = `draw-${frame}-end`;
const m1 = window.performance.mark(markStart);
const timestamp = m1.startTime;

// this?
    this.pixi.ticker.update(timestamp);

//...or this?
//        const m = new PIXI.Matrix(1, 0, 0, 1, -offset[0], -offset[1]);
//        const options = {
//          transform: m,
//          // skipUpdateTransform: true
//        };
//        this.pixi.renderer.render(stage, options);

    this._drawPending = false;
    this._frame++;
const m2 = window.performance.mark(markEnd);
const measure = window.performance.measure(`draw-${frame}`, markStart, markEnd);
const duration = measure.duration.toFixed(1);
console.log(`draw ${frame} - ${duration} ms`);
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
   * select
   * @param  featureIDs   `Array` or `Set` of feature IDs to select
   */
  select(featureIDs) {
    const toSelect = new Set([].concat(featureIDs));  // coax ids into a Set
    let selectChanged = false;

    // remove select where not needed
    this._selectedIDs.forEach(featureID => {
      if (toSelect.has(featureID)) return;   // it should stay selected

      this._selectedIDs.delete(featureID);
      const feature = this.scene.get(featureID);
      if (feature) {
        selectChanged = true;
        feature.displayObject.filters = [];
        feature.selected = false;
        feature.dirty = true;
      }
    });

    // add select where needed
    toSelect.forEach(featureID => {
      const feature = this.scene.get(featureID);
      if (!feature) return;

      if (this._selectedIDs.has(feature.id)) return;  // it's already selected

      this._selectedIDs.add(feature.id);
      selectChanged = true;
      feature.displayObject.filters = [ this.selectglow ];
      feature.selected = true;
      feature.dirty = true;
    });

    if (selectChanged) {
      this._highlightTick++;
      // this._context.map().deferredRedraw();
      // this.render();  //  now
      this.draw();
    }
  }



  /**
   * hover
   * @param  featureIDs   `Array` or `Set` of feature IDs to hover
   */
  hover(featureIDs) {
    const toHover = new Set([].concat(featureIDs));  // coax ids into a Set
    let hoverChanged = false;

    // remove hover where not needed
    this._hoveredIDs.forEach(featureID => {
      if (toHover.has(featureID)) return;  // it should stay hovered

      this._hoveredIDs.delete(featureID);
      const feature = this.scene.get(featureID);
      if (feature) {
        hoverChanged = true;
        feature.displayObject.filters = [];
        feature.hovered = false;
        feature.dirty = true;
      }
    });

    // add hover where needed
    toHover.forEach(featureID => {
      const feature = this.scene.get(featureID);
      if (!feature) return;

      if (this._hoveredIDs.has(feature.id)) return;  // it's already hovered

      this._hoveredIDs.add(feature.id);
      hoverChanged = true;
      feature.displayObject.filters = [ this.hoverglow ];
      feature.hovered = true;
      feature.dirty = true;
    });

    if (hoverChanged) {
      this._highlightTick++;
      // this._context.map().deferredRedraw();
      // this.render();  //  now
      this.draw();
    }
  }

}
