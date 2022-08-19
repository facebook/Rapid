import * as PIXI from 'pixi.js';
import { skipHello } from '@pixi/utils';
import { Projection } from '@id-sdk/math';

import { PixiScene } from './PixiScene';
import { PixiTextures } from './PixiTextures';

let _sharedTextures;   // singleton (for now)


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
    this._onHoverChange = this._onHoverChange.bind(this);
    this._onSelectChange = this._onSelectChange.bind(this);


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
    this.scene = new PixiScene(this);

    // Texture Manager should only be created once
    // This is because it will start loading assets and Pixi's asset loader is not reentrant.
    // (it causes test failures if we create a bunch of these)
    if (!_sharedTextures) {
      _sharedTextures = new PixiTextures(context);
    }
    this.textures = _sharedTextures;

    // Event listeners to respond to any changes in selection or hover
    context.on('enter.PixiRenderer', this._onSelectChange);
    context.behaviors.get('hover').on('hoverchanged', this._onHoverChange);
  }


  /**
   * _onSelectChange
   * Respond to any change in select (called on mode change)
   */
  _onSelectChange() {
    const selectedIDs = this.context.selectedIDs();
    const selectedData = this.context.selectedData();

    // We want feature ids here, not datum ids. (Only for actual OSM features are these the same)
    // hacky conversion to get around the id mismatch:
    const featureIDs = selectedIDs.map(id => {
      const datum = selectedData.get(id);
      if (!datum) {  // Legacy OSM select mode - there is no selectedData so the id is the id
        return id;
      } else if (datum && datum.__fbid__) {
        return `rapid-${id}`;
      } else {  // there are other selectable things - we will not select-style them for now :(
        return null;
      }
    }).filter(Boolean);

    this.scene.selectFeatures(featureIDs);
    this._appPending = true;
  }

  /**
   * _onHoverChange
   * Respond to any change in hover
   */
  _onHoverChange(eventData) {
    let featureIDs = [];
    let featureData = [];
    if (eventData.target && eventData.data) {
      featureIDs = [eventData.target.name];  // the featureID is here (e.g. osm id)
      featureData = [eventData.data];
    }

    const mode = this.context.mode();
    if (mode && mode.id !== 'select') {
      this.context.ui().sidebar.hover(featureData);
    }

    this.scene.hoverFeatures(featureIDs);
    this._appPending = true;
  }


  /**
   * tick
   * This is a Pixi.Ticker listener that runs in a `requestAnimationFrame` game loop.
   * We can use this to determine the true frame rate that we're running at,
   * and schedule work to happen at opportune times (within animation frame boundaries)
   */
  tick() {
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
      window.performance.mark(drawStart);

      this.draw();  // note that DRAW increments the frame counter

      window.performance.mark(drawEnd);
      window.performance.measure(`draw-${frame}`, drawStart, drawEnd);
      // const measureDraw = window.performance.getEntriesByName(`draw-${frame}`, 'measure')[0];
      // const durationDraw = measureDraw.duration.toFixed(1);
      // console.log(`draw-${frame} : ${durationDraw} ms`);
      return;
    }

// shader experiment - always render
// this._appPending = true;

    // Do APP to prepare the next frame..
    if (this._appPending) {
      const frame = this._frame;
      const appStart = `app-${frame}-start`;
      const appEnd = `app-${frame}-end`;
      window.performance.mark(appStart);

      this.app();

      window.performance.mark(appEnd);
      window.performance.measure(`app-${frame}`, appStart, appEnd);
      // const measureApp = window.performance.getEntriesByName(`app-${frame}`, 'measure')[0];
      // const durationApp = measureApp.duration.toFixed(1);
      // console.log(`app-${frame} : ${durationApp} ms`);
      return;
    }
  }


  /**
   * render
   * Schedules an APP pass on the next available tick
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
    if (!this.textures || !this.textures.loaded) return;

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
      this.scene.dirtyScene();
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

}
