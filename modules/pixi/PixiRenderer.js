import * as PIXI from 'pixi.js';
import { skipHello } from '@pixi/utils';
import { Projection } from '@id-sdk/math';

import { PixiScene } from './PixiScene';
import { PixiTextures } from './PixiTextures';


/**
 * PixiRenderer
 * The renderer implements a game loop and manages when rendering tasks happen.
 *
 * Properties you can access:
 *   `scene`     PixiScene object manages the layers and features in the scene
 *   `textures`  PixiTextures object manages the textures
 */
export class PixiRenderer {

  /**
   * @constructor
   * Create a Pixi application and add it to the given parentElement.
   * We also add it as `context.pixi` so that other parts of RapiD can use it.
   *
   * @param  context         Global shared application context
   * @param  parentElement   Parent `div` element to add Pixi
   */
  constructor(context, parentElement) {
    this.context = context;
    this._frame = 0;
    this._appPending = false;
    this._drawPending = false;

    // Make sure callbacks have `this` bound correctly
    this.tick = this.tick.bind(this);
    this._onModeChange = this._onModeChange.bind(this);


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

    //Prefer WebGL 2.0 for now, this is to workaround issue #493 for now.
    PIXI.settings.PREFER_ENV = PIXI.ENV.WEBGL2;

    // Create a Pixi application and add Pixi's canvas to the parent `div`.
    this.pixi = new PIXI.Application({
      antialias: true,
      autoDensity: true,
      autoStart: false,        // don't start the ticker yet
      backgroundAlpha: 0.0,    // transparent
      resizeTo: parentElement,
      resolution: window.devicePixelRatio,
      sharedLoader: true,
      sharedTicker: true
    });

    context.pixi = this.pixi;
    parentElement.appendChild(this.pixi.view);


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
    // Replace the default Ticker listener (which just renders the scene each frame)
    // with our own listener that gathers statistics and renders only as needed
    const ticker = this.pixi.ticker;
    const defaultListener = ticker._head.next;
    ticker.remove(defaultListener.fn, defaultListener.context);

    ticker.add(this.tick, this);
    ticker.maxFPS = 30;
    ticker.start();

    // Setup the Interaction Manager
    const interactionManager = this.pixi.renderer.plugins.interaction;
    interactionManager.useSystemTicker = true;

    // Setup the stage
    const stage = this.pixi.stage;
    stage.name = 'stage';
    stage.sortableChildren = true;
    stage.interactive = true;
    // Add a big hit area to `stage` so that clicks on nothing will generate events
    stage.hitArea = new PIXI.Rectangle(-100000, -100000, 200000, 200000);

    // Setup other classes
    this.pixiProjection = new Projection();
    this.textures = new PixiTextures(context);
    this.scene = new PixiScene(this);

    // Listen to mode changes so we can keep the selection updated
    context.on('enter.PixiRenderer', this._onModeChange);
  }


  /**
   * _onModeChange
   * When changing modes, check whether the selection has changed.
   */
  _onModeChange() {
    this.selectFeatures(this.context.selectedIDs());
  }


  /**
   * tick
   * This is a Pixi.Ticker listener that runs in a `requestAnimationFrame` game loop.
   * We can use this to determine the true frame rate that we're running at,
   * and schedule work to happen at opportune times (within animation frame boundaries)
   */
  tick(time) {
    // const ticker = this.pixi.ticker;
    // console.log('FPS=' + ticker.FPS.toFixed(1));

    // For now, we will perform either APP (RapiD prepares scene graph) or DRAW (Pixi render) during a tick.
    // The ticker is configured to run at 30fps to allow time for other work to happen on the main thread.
    // But the browser will still fire events like pointer/wheel faster than that, and other code
    // that runs on requestAnimationFrame will happen faster than that too (e.g. d3-zoom, for now)
    // GPU work will happen in its own thread, and we don't have direct insight into its timing.
    // For reference:
    //   16.7ms = 60fps
    //   33.3ms = 30fps

    // Process a pending DRAW before a pending APP.
    // This is so pending APP does not sneak in front of DRAW causing a race condition.
    if (this._drawPending) {
      const frame = this._frame;
      const drawStart = `draw-${frame}-start`;
      const drawEnd = `draw-${frame}-end`;
      const m1 = window.performance.mark(drawStart);

      this.draw();  // note that DRAW increments the frame counter

      const m2 = window.performance.mark(drawEnd);
      window.performance.measure(`draw-${frame}`, drawStart, drawEnd);
      const measure = window.performance.getEntriesByName(`draw-${frame}`, 'measure')[0];
      const duration = measure.duration.toFixed(1);
      // console.log(`draw-${frame} : ${duration} ms`);
      return;
    }

    // Do APP to prepare the next frame..
    if (this._appPending) {
      const frame = this._frame;
      const appStart = `app-${frame}-start`;
      const appEnd = `app-${frame}-end`;
      const m1 = window.performance.mark(appStart);

      this.app();

      const m2 = window.performance.mark(appEnd);
      window.performance.measure(`app-${frame}`, appStart, appEnd);
      const measure = window.performance.getEntriesByName(`app-${frame}`, 'measure')[0];
      const duration = measure.duration.toFixed(1);
      // console.log(`app-${frame} : ${duration} ms`);
      return;
    }
  }


  /**
   * render
   * Schedules an "app" pass on the next available tick
   */
  render() {
    this._appPending = true;
  }


  /**
   * app
   * The "RapiD" part of the drawing.
   * Where we set up the scene graph and tell Pixi what needs to be drawn.
   */
  app() {
    // Wait for textures to be loaded before attempting rendering.
    if (!this.textures.loaded) return;

    // Reproject the pixi geometries only whenever zoom changes
    const context = this.context;
    const pixiProjection = this.pixiProjection;
    const currTransform = context.projection.transform();
    const pixiTransform = pixiProjection.transform();
    const effectiveZoom = context.map().effectiveZoom();

    let offset;
    if (pixiTransform.k !== currTransform.k) {    // zoom changed, reset
      offset = [0, 0];
      pixiProjection.transform(currTransform);
      this.dirtyScene();
    } else {
      offset = [ pixiTransform.x - currTransform.x, pixiTransform.y - currTransform.y ];
    }

// like this? (offset in stage)
    const stage = this.pixi.stage;
    stage.position.set(-offset[0], -offset[1]);
//
    this.scene.render(this._frame, pixiProjection, effectiveZoom);

    this._appPending = false;
    this._drawPending = true;
  }


  /**
   * draw
   * The "Pixi" part of the drawing
   * Where it converts Pixi geometries into WebGL instructions.
   */
  draw() {
// like this? (offset in stage)
    this.pixi.render();
//...or like this (offset in matrix)?
    // const m = new PIXI.Matrix(1, 0, 0, 1, -offset[0], -offset[1]);
    // const options = {
    //   transform: m,
    //   // skipUpdateTransform: true
    // };
    // this.pixi.renderer.render(stage, options);
//

    this.context.map().resetTransform();

    this._drawPending = false;
    this._frame++;
  }


  // pass through calls to the scene
  dirtyScene() {
    this.scene.dirtyScene();
  }
  dirtyLayers(layerIDs) {
    this.scene.dirtyLayers(layerIDs);
  }
  dirtyFeatures(featureIDs) {
    this.scene.dirtyFeatures(featureIDs);
  }
  selectFeatures(featureIDs) {
    this.scene.selectFeatures(featureIDs);
    this._appPending = true;
  }
  hoverFeatures(featureIDs) {
    this.scene.hoverFeatures(featureIDs);
    this._appPending = true;
  }

// // if select or hover changed..
// // this.draw();    // draw now
// if (!this.context.map().isTransformed()) {
//   this._drawPending = true;   // draw asap
// }


}
