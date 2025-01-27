import * as PIXI from 'pixi.js';
import { TAU, Viewport, numWrap, vecEqual, vecLength, vecRotate, vecScale, vecSubtract } from '@rapid-sdk/math';

import { AbstractSystem } from './AbstractSystem.js';
import { PixiEvents } from '../pixi/PixiEvents.js';
import { PixiScene } from '../pixi/PixiScene.js';
import { PixiTextures } from '../pixi/PixiTextures.js';
import { utilSetTransform } from '../util/util.js';

const THROTTLE = 250;  // throttled rendering milliseconds (for now)


/**
 * GraphicsSystem
 * The graphics system owns the Pixi environment.
 * This system implements a game loop and manages when rendering tasks happen.
 * (formerly named PixiRenderer)
 *
 * Properties you can access:
 *   `supersurface`   The parent `div` for temporary transforms between redraws
 *   `surface`        The sibling `canvas` map drawing surface
 *   `overlay`        The sibling `div` overlay, offsets the supersurface transform
 *   `pixi`           PIXI.Application() created to render to the canvas
 *   `stage`          PIXI.Container() that lives at the root of this scene
 *   `origin`         PIXI.Container() that lives beneath the stage, used to set origin to [0,0]
 *   `scene`          PixiScene manages the layers and features in the scene
 *   `events`         PixiEvents manages the events that other code might want to listen for
 *   `textures`       PixiTextures manages the textures
 *
 * Events available:
 *   `draw`            Fires after a full redraw
 *   `move`            Fires after the map's transform has changed (can fire frequently)
 *                     ('move' is mostly for when you want to update some content that floats over the map)
 *   `statuschange`    Fires on status changes, receives 'contextlost' or 'contextrestored'
 */
export class GraphicsSystem extends AbstractSystem {

  /**
   * @constructor
   * @param  `context`   Global shared application context
   */
  constructor(context) {
    super(context);

    this.id = 'gfx';
    this.dependencies = new Set(['assets', 'map', 'ui', 'urlhash']);
    this.highQuality = true;  // this can go false if we detect poor performance

    // Create these early
    this.supersurface = document.createElement('div');  // parent `div` temporary transforms between redraws
    this.surface = document.createElement('canvas');    // sibling `canvas` map drawing surface
    this.overlay = document.createElement('div');       // sibling `div` overlay offsets the supersurface transform

    // Pixi objects, will be created in initAsync.
    this.pixi = null;
    this.stage = null;
    this.origin = null;
    this.scene = null;
    this.events = null;
    this.textures = null;

    // Properties used to manage the scene transform
    this._pixiViewport = null;
//    this._prevTransform = { x: 0, y: 0, k: 256 / Math.PI, r: 0 };    // transform at time of last draw
    this._prevTransform = { x: 0, y: 0, z: 1, r: 0 };    // transform at time of last draw
    this._isTempTransformed = false;     // is the supersurface transformed?
    this._transformEase = null;

    this._frame = 0;              // counter that increments
    this._timeToNextRender = 0;   // milliseconds of time to defer rendering
    this._appPending = false;
    this._drawPending = false;
    this._initPromise = null;
    this._startPromise = null;

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.deferredRedraw = this.deferredRedraw.bind(this);
    this.immediateRedraw = this.immediateRedraw.bind(this);
    this._tick = this._tick.bind(this);

    // If we are using WebGL, watch for context loss - Rapid#1658
    this._handleGLContextLost = this._handleGLContextLost.bind(this);
    this._handleGLContextRestored = this._handleGLContextRestored.bind(this);
    this._isContextLost = false;

    // Anything involving PIXI globals can be set up here, to ensure it only happens one time.
    // We'll use the Pixi shared ticker, but we don't want it started yet.
    const ticker = PIXI.Ticker.shared;
    ticker.autoStart = false;
    ticker.stop();
    ticker.add(this._tick, this);
    this.ticker = ticker;

    Object.assign(PIXI.BitmapFontManager.defaultOptions, {
      chars: PIXI.BitmapFontManager.ASCII,
      resolution: 2,
      padding: 6,
      skipKerning: false
    });

    Object.assign(PIXI.HelloSystem.defaultOptions, {
      hello: true  // Log renderer and Pixi version to the console
    });

    Object.assign(PIXI.RenderableGCSystem.defaultOptions, {
      renderableGCActive: false
    });

    Object.assign(PIXI.TextureSource.defaultOptions, {
      autoGarbageCollect: false,
      autoGenerateMipmaps: false,
      resolution: 1
    });


    // Prepare a basic bitmap font that we can use for things like debug messages
    PIXI.BitmapFont.install({
      name: 'rapid-debug',
      style: {
        fill: { color: 0xffffff },
        fontSize: 14,
        stroke: { color: 0x333333 }
      }
    });

  }


  /**
   * initAsync
   * Called after all core objects have been constructed.
   * @return {Promise} Promise resolved when this component has completed initialization
   */
  initAsync() {
    if (this._initPromise) return this._initPromise;

    for (const id of this.dependencies) {
      if (!this.context.systems[id]) {
        return Promise.reject(`Cannot init:  ${this.id} requires ${id}`);
      }
    }

    // Init prerequisites
    const context = this.context;
    const assets = context.systems.assets;
    const urlhash = context.systems.urlhash;

    const prerequisites = Promise.all([
      assets.initAsync(),
      urlhash.initAsync()
    ]);

    return this._initPromise = prerequisites
      .then(() => this._initPixiAsync())
      .then(() => this._afterPixiInit());
  }


  /**
   * startAsync
   * Called after all core objects have been initialized.
   * @return {Promise} Promise resolved when this component has completed startup
   */
  startAsync() {
    if (this._startPromise) return this._startPromise;

    const context = this.context;
    const urlhash = context.systems.urlhash;

    // Wait for everything to be ready - urlhash will emit hash change that
    // sets the map location, among other things.  Then start the ticker.
    const prerequisites = urlhash.startAsync();

    return this._startPromise = prerequisites
      .then(() => {
        this._started = true;
        this.ticker.start();
      });
  }


  /**
   * resetAsync
   * Called after completing an edit session to reset any internal state
   * Note that calling `resetAsync` schedules an "immediate" redraw (on the next available tick).
   * @return {Promise} Promise resolved when this component has completed resetting
   */
  resetAsync() {
    this.immediateRedraw();
    return Promise.resolve();
  }


  /**
   * pause
   * Pauses this system
   * When paused, the GraphicsSystem will not render
   */
  pause() {
    this._paused = true;
  }


  /**
   * resume
   * Resumes (unpauses) this system.
   * When paused, the GraphicsSystem will not render
   * Note that calling `resume` schedules an "immediate" redraw (on the next available tick).
   */
  resume() {
    this._paused = false;
    this.immediateRedraw();
  }


  /**
   * _tick
   * This is a Pixi.Ticker listener that runs in a `requestAnimationFrame` game loop.
   * We can use this to determine the true frame rate that we're running at,
   * and schedule work to happen at opportune times (within animation frame boundaries)
   */
  _tick() {
    if (!this._started || this._paused) return;

    const ticker = this.ticker;
    // console.log('FPS=' + ticker.FPS.toFixed(1));

    // For now, we will perform either APP (Rapid prepares scene graph) or DRAW (Pixi render) during a tick.
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

      this._draw();  // note that DRAW increments the frame counter

      window.performance.mark(drawEnd);
      window.performance.measure(`draw-${frame}`, drawStart, drawEnd);
      // const measureDraw = window.performance.getEntriesByName(`draw-${frame}`, 'measure')[0];
      // const durationDraw = measureDraw.duration.toFixed(1);
      // console.log(`draw-${frame} : ${durationDraw} ms`);
      return;
    }

    // Perform any updates to the scene's transform..
    this._tform();

// shader experiment - always render
// this._appPending = true;

    // Do APP to prepare the next frame..
    if (this._appPending) {
      this._timeToNextRender -= ticker.deltaMS;

      if (this._timeToNextRender >= 0) {   // render later
        return;

      } else {  // render now
        const frame = this._frame;
        const appStart = `app-${frame}-start`;
        const appEnd = `app-${frame}-end`;
        window.performance.mark(appStart);

        this._app();

        window.performance.mark(appEnd);
        window.performance.measure(`app-${frame}`, appStart, appEnd);
        // const measureApp = window.performance.getEntriesByName(`app-${frame}`, 'measure')[0];
        // const durationApp = measureApp.duration.toFixed(1);
        // console.log(`app-${frame} : ${durationApp} ms`);
        return;
      }
    }
  }


  /**
   * deferredRedraw
   * Schedules an APP pass but does not reset the timer.
   * This is for situations where new data is available, but we can wait a bit to show it.
   */
  deferredRedraw() {
    this._appPending = true;
  }


  /**
   * immediateRedraw
   * Schedules an APP pass on the next available tick.
   * If there was a DRAW pending, cancel it.
   * This is for situations where we want the user to see the update immediately.
   */
  immediateRedraw() {
    this._timeToNextRender = 0;    // asap
    this._appPending = true;
  }


  /**
   * setTransformAsync
   * Updates the viewport transform
   * @param   t           A Transform Object with `x, y, k, r` properties
   * @param   duration?   Duration of the transition in milliseconds, defaults to 0ms (asap)
   * @return  Promise that resolves when the transform has finished changing
   */
  setTransformAsync(t, duration = 0) {
    const now = window.performance.now();
    const context = this.context;
    const viewport = context.viewport;
    const tCurr = viewport.transform.props;
    let promise;

    // If already easing, resolve before starting a new one
    if (this._transformEase) {
      viewport.transform = tCurr;
      this._transformEase.resolve(tCurr);
      this._transformEase = null;
    }

    if (duration > 0) {   // change later
      let _resolver;      // store resolver function for use outside the promise
      promise = new Promise(resolve => { _resolver = resolve; });

      this._transformEase = {
        time0: now,
        time1: now + duration,
        xform0: tCurr,
        xform1: t,
        promise: promise,
        resolve: _resolver
      };

    } else {   // change immediately
      viewport.transform.props = t;
      promise = Promise.resolve(t);
    }

    this._appPending = true;
    return promise;
  }


  /**
   * _tform
   * On each tick, manage the scene's transform
   * The few things we do here involve:
   *  - if there is a transform ease in progress, compute the eased transform
   *  - if the dimensions have changed, update the supersurface and overlay.
   *  - if the transform has changed from the last drawn transform,
   *    apply the difference to the supersurface and overlay
   */
  _tform() {
    // Between APP and DRAW we dont want to change the transform at all.
    // This shouldn't happen, but we check for it just in case.
    if (this._drawPending) return;

    const context = this.context;
    const mapViewport = context.viewport;
    const pixiViewport = this._pixiViewport;

    // Calculate the transform easing, if any
    if (this._transformEase) {
      const now = window.performance.now();

      const { time0, time1, xform0, xform1, resolve } = this._transformEase;
//      const [x0, y0, k0] = [xform0.x, xform0.y, xform0.k];
//      const [x1, y1, k1] = [xform1.x, xform1.y, xform1.k];
      const [x0, y0, z0] = [xform0.x, xform0.y, xform0.z];
      const [x1, y1, z1] = [xform1.x, xform1.y, xform1.z];

      // For rotation, pick whichever direction is shorter
      const r0 = numWrap(xform0.r, 0, TAU);
      let r1 = numWrap(xform1.r, 0, TAU);
      if (Math.abs(r1 - r0) > Math.PI) {  // > 180°
        r1 += (r1 < r0) ? TAU : -TAU;
      }

      // Keep it simple - linear interpolate
      const tween = Math.max(0, Math.min(1, (now - time0) / (time1 - time0)));
      const xNow = x0 + ((x1 - x0) * tween);
      const yNow = y0 + ((y1 - y0) * tween);
//       const kNow = k0 + ((k1 - k0) * tween);
      const zNow = z0 + ((z1 - z0) * tween);
      const rNow = r0 + ((r1 - r0) * tween);
      // const tNow = { x: xNow, y: yNow, k: kNow, r: rNow };
      const tNow = { x: xNow, y: yNow, z: zNow, r: rNow };
      mapViewport.transform = tNow;  // set

      if (tween === 1) {  // we're done
        resolve(tNow);
        this._transformEase = null;
      }
      this._appPending = true;  // needs occasional renders during/after easing
    }

    // Determine if the dimensions have changed.
    const mapDims = mapViewport.dimensions;
    const pixiDims = pixiViewport.dimensions;
    const firstTime = vecEqual(pixiDims, [0, 0]);  // haven't set dimensions yet?

    if (!vecEqual(mapDims, pixiDims)) {
      // If the user is currently resizing the map, don't try changing the dimensions just yet.
      const isResizing = context.container().classed('resizing');
      if (!isResizing) {
        // Allow the Pixi dimensions to change, but only after the user is finished resizing..
        pixiViewport.dimensions = mapDims;

        // Un-pan map to keep it centered in the same spot.
        // (x0.5 because the map grows/shrinks from the middle, so we only need to pan half this distance)
        if (!firstTime) {
          const [dw, dh] = vecScale(vecSubtract(mapDims, pixiDims), 0.5);
          const t = mapViewport.transform;
//          mapViewport.transform = { x: t.x + dw, y: t.y + dh, k: t.k, r: t.r };
          mapViewport.transform = { x: t.x + dw, y: t.y + dh, z: t.z, r: t.r };
        }

        this._appPending = true;
        this._timeToNextRender = 0;    // asap

        // Return here and don't touch the temp transform anymore.
        // We are about to do APP then DRAW and will throw it out.
        // (If we modify it now, will cause the map to jump until DRAW happens)
        return;
      }
    }

    // Here we calculate a temporary CSS transform that includes
    // whatever user interaction has occurred between full redraws.
    // We apply this temporary transform to the supersurface and overlay.
    const tCurr = mapViewport.transform.props;
    const tPrev = this._prevTransform;

    const hasChanges = this._isTempTransformed || (
//      tPrev.x !== tCurr.x || tPrev.y !== tCurr.y || tPrev.k !== tCurr.k || tPrev.r !== tCurr.r
      tPrev.x !== tCurr.x || tPrev.y !== tCurr.y || tPrev.z !== tCurr.z || tPrev.r !== tCurr.r
    );

    if (hasChanges) {
      // Before, supersurface's transform-origin was "top left", now it is "center".
      // So we need to shift the coordinates back to top-left to make the math correct.
      const center = mapViewport.center();
      const currxy = vecSubtract([tCurr.x, tCurr.y], center);
      const prevxy = vecSubtract([tPrev.x, tPrev.y], center);
//      const scale = tCurr.k / tPrev.k;

// todo fix: this does not work correctly with the worldcoordinate changes
      const scale = Math.pow(2, tCurr.z) / Math.pow(2, tPrev.z);
      let dx = (currxy[0] / scale - prevxy[0]) * scale;
      let dy = (currxy[1] / scale - prevxy[1]) * scale;
      const dr = tCurr.r - tPrev.r;

      [dx, dy] = vecRotate([dx, dy], tCurr.r, [0, 0]);

      utilSetTransform(this.supersurface, dx, dy, scale, dr);
      utilSetTransform(this.overlay, -dx, -dy, 1, -dr);
      this._isTempTransformed = true;
      this.emit('move');
    }
  }


  /**
   * _app
   * The "Rapid" part of the drawing.
   * Where we set up the scene graph and tell Pixi what needs to be drawn.
   */
  _app() {
    // Wait for textures to be loaded before attempting rendering.
    if (!this.textures?.loaded) return;
    if (!this._started || this._paused) return;

    const context = this.context;
    const map = context.systems.map;

    // If the user is currently resizing, skip rendering until the size has settled
    if (context.container().classed('resizing')) return;

    const mapViewport = context.viewport;
    const pixiViewport = this._pixiViewport;

    // At this point, the map transform is settled
    // (`_tform` is called immediately before `_app`)
    const mapTransform = mapViewport.transform;
    const pixiTransform = pixiViewport.transform;

    // Determine "offset"
    // We try to avoid reprojecting the pixi geometries unless zoom has changed, or map has translated very far.
    // If the user is just panning, we can leave the geometries alone and add an offset translation to the origin.
    const pixiXY = pixiTransform.translation;
    const mapXY = mapTransform.translation;
    const dist = vecLength(pixiXY, mapXY);
    let offset;

// worldcoordinates
//    if (pixiTransform.k !== mapTransform.k || dist > 100000) {
    if (pixiTransform.z !== mapTransform.z || dist > 100000) {
      offset = [0,0];
      pixiViewport.transform = mapTransform;   // reset (sync pixi = map)
      this.scene.dirtyScene();                 // all geometry must be reprojected
    } else {
      offset = vecSubtract(pixiXY, mapXY);
    }

    if (pixiTransform.r !== mapTransform.r) {
      pixiTransform.rotation = mapTransform.r;
      this.scene.dirtyScene();               // only really needs restyle
    }

    // The `stage` should be positioned so that `[0,0]` is at the center of the viewport,
    // and this is the pivot point for map rotation.
    const mapCenter = pixiViewport.center();
    this.stage.pivot.set(0, 0);
    this.stage.position.set(mapCenter[0], mapCenter[1]);
    this.stage.rotation = mapTransform.r;

    // The `origin` returns `[0,0]` back to the `[top,left]` coordinate of the viewport,
    // so `project/unproject` continues to work.
    // This also includes the `offset`, which includes any panning that the user has done.
    this.origin.position.set(-offset[0] - mapCenter[0], -offset[1] - mapCenter[1]);

    // Let's go!
    const effectiveZoom = map.effectiveZoom();
    this.scene.render(this._frame, pixiViewport, effectiveZoom);
    // this._renderDebug();

    this._appPending = false;
    this._drawPending = true;
  }


  /**
   * _draw
   * The "Pixi" part of the drawing.
   * Where it converts Pixi geometries into WebGL instructions.
   */
  _draw() {
    // Resize Pixi canvas if needed..
    // It will clear the canvas, so do this immediately before we render.
    const pixiDims = this._pixiViewport.dimensions;
    const canvasDims = [this.pixi.screen.width, this.pixi.screen.height];

    if (!vecEqual(pixiDims, canvasDims)) {
      const [w, h] = pixiDims;
      // Resize supersurface and overlay to cover the screen dimensions.
      const ssnode = this.supersurface;
      ssnode.style.width = `${w}px`;
      ssnode.style.height = `${h}px`;
      const onode = this.overlay;
      onode.style.width = `${w}px`;
      onode.style.height = `${h}px`;

      // Resize pixi canvas
      const renderer = this.pixi.renderer;
      renderer.resize(w, h);
    }

    // Let's go!
    this.pixi.render();

// multiview?  it renders but is not interactive
//    this.pixi.renderer.render({
//      container: this.stage,
//      target: this.surface
//    });

    // Remove any temporary parent transform..
    if (this._isTempTransformed) {
      utilSetTransform(this.supersurface, 0, 0, 1, 0);
      utilSetTransform(this.overlay, 0, 0, 1, 0);
      this._isTempTransformed = false;
      this.emit('move');
    }

    this._prevTransform = this.context.viewport.transform.props;
    this._timeToNextRender = THROTTLE;

    this._drawPending = false;
    this.emit('draw');
    this._frame++;
  }


  /**
   * _renderDebug
   * Render some debug shapes (usually commented out)
   */
  _renderDebug() {
//      const context = this.context;
//      const mapViewport = context.viewport;
//      const origin = this.origin;
      const stage = this.stage;

//    let debug1 = origin.getChildByLabel('center_stage');   // center stage
//    if (!debug1) {
//      debug1 = new PIXI.Graphics()
//        .circle(0, 0, 20)
//        .fill({ color: 0xffffff, alpha: 1 });
//      debug1.label = 'center_stage';
//      debug1.eventMode = 'none';
//      debug1.sortableChildren = false;
//      debug1.zIndex = 101;
//      origin.addChild(debug1);
//    }
//    debug1.position.set(stage.position.x, stage.position.y);
//
//    let debug2 = origin.getChildByLabel('center_screen');  // projected center of viewport
//    if (!debug2) {
//      debug2 = new PIXI.Graphics()
//        .circle(0, 0, 15)
//        .fill({ color: 0xff6666, alpha: 1 });
//      debug2.label = 'center_screen';
//      debug2.eventMode = 'none';
//      debug2.sortableChildren = false;
//      debug2.zIndex = 102;
//      origin.addChild(debug2);
//    }
//    const centerLoc = this._pixiViewport.project(mapViewport.centerLoc());
//    debug2.position.set(centerLoc[0], centerLoc[1]);

    // debugging the contents of the texture atlas
    let screen = stage.getChildByLabel('screen');
    if (!screen) {
      screen = new PIXI.Graphics()
        .rect(-5, -5, 522, 522)
        .fill({ color: 0x000000, alpha: 1 });
      screen.label = 'screen';
      screen.eventMode = 'none';
      screen.sortableChildren = false;
      screen.zIndex = 100;
      stage.addChild(screen);
    }

    let debug = stage.getChildByLabel('debug');
    if (!debug) {
      debug = new PIXI.Sprite();
      debug.label = 'debug';
      debug.eventMode = 'none';
      debug.sortableChildren = false;
      debug.zIndex = 101;
      debug.height = 512;
      debug.width = 512;
      stage.addChild(debug);
    }

    // replace the texture each frame
    if (debug.texture) {
      debug.texture.destroy();
    }
    debug.texture = this.textures.getDebugTexture('symbol');
    debug.position.set(50, -200);
    screen.position.set(50, -200);
  }


  /**
   * _initPixiAsync
   * Initializes the Pixi Application
   * @return {Promise} Promise resolved when this Pixi has completed initialization
   */
  _initPixiAsync() {
    if (this.pixi) return Promise.resolve();   // was done already?

    const urlhash = this.context.systems.urlhash;

    // For testing, allow user to override the renderer preference:
    // `renderer=val` one of `webgl1`, `webgl2`/`webgl`, `webgpu`
    let renderPreference = 'webgl';
    let renderGLVersion = 2;
    switch (urlhash.initialHashParams.get('renderer')) {
      case 'webgpu':
        renderPreference = 'webgpu';
        break;
      case 'webgl1':
        renderGLVersion = 1;
        break;
    }

    const options = {
      antialias: this.highQuality,
      autoDensity: this.highQuality,
      autoStart: false,     // Avoid the ticker
      canvas: this.surface,
      events: {
        move: false,
        globalMove: false,
        click: true,
        wheel: false
      },
      multiView: true,   // Needed for minimap
      powerPreference: 'high-performance',
      preference: renderPreference,
      preferWebGLVersion: renderGLVersion,
      preserveDrawingBuffer: true,
      resolution: this.highQuality ? window.devicePixelRatio : 1,
      sharedLoader: true,
      sharedTicker: false,  // Avoid the ticker
      textureGCActive: true,
      useBackBuffer: false
    };

    this.pixi = new PIXI.Application();
    return this.pixi.init(options);  // return Pixi's init Promise
  }


  /**
   * _afterPixiInit
   * Steps to run after Pixi has completed initialization.
   * Set up scene, events, textures, stage, etc.
   */
  _afterPixiInit() {
    if (this.stage) return;   // done already?

    // Watch for WebGL context loss on context canvas - Rapid#1658
    const renderer = this.pixi.renderer;
    if (renderer.type === PIXI.RendererType.WEBGL) {
      // Note that with multiview rendering the context canvas is not the view canvas (aka surface)
      const canvas = renderer.context.canvas;
      canvas.addEventListener('webglcontextlost', this._handleGLContextLost);
      canvas.addEventListener('webglcontextrestored', this._handleGLContextRestored);
    }

    // Enable debugging tools
    if (window.Rapid.isDebug) {
      // Register Pixi with the pixi-inspector extension if it is installed
      // https://github.com/bfanger/pixi-inspector
      globalThis.__PIXI_APP__ = this.pixi;

      window.__PIXI_DEVTOOLS__ = {
        pixi: PIXI,
        app: this.pixi
      };
    }

    // Create or replace the Pixi viewport
    // This viewport will closely follow the map viewport but can be offset from it.
    this._pixiViewport = new Viewport();

    // Setup the stage
    // The `stage` should be positioned so that `[0,0]` is at the center of the viewport,
    // and this is the pivot point for map rotation.
    const stage = this.pixi.stage;
    stage.label = 'stage';
    stage.sortableChildren = true;
    stage.eventMode = 'static';
    // Add a big hit area to `stage` so that clicks on nothing will generate events
    stage.hitArea = new PIXI.Rectangle(-10000000, -10000000, 20000000, 20000000);
    this.stage = stage;

    // The `origin` returns `[0,0]` back to the `[top,left]` coordinate of the viewport,
    // so `project/unproject` continues to work.
    // This also includes the `offset` which includes any panning that the user has done.
    const origin = new PIXI.Container();
    origin.label = 'origin';
    origin.sortableChildren = true;
    origin.eventMode = 'passive';
    stage.addChild(origin);
    this.origin = origin;

    // The Pixi Application comes with its own ticker that just calls `render()`,
    // and we don't want to ever use it.  Disable it.
    const appTicker = this.pixi.ticker;
    let next = appTicker._head.next;
    while (next) {
      next = next.destroy(true);  // remove any listeners
    }
    this.pixi.start = () => {};
    this.pixi.stop = () => {};

    // Create these classes if we haven't already
    if (!this.scene) {
      this.scene = new PixiScene(this);
    } else {
      this.scene.reset();
    }

    if (!this.textures) {
      this.textures = new PixiTextures(this);
    } else {
      this.textures.reset();
    }

    if (!this.events) {
      this.events = new PixiEvents(this);
    }
  }


  /**
   * _handleGLContextLost
   * Handler for webglcontextlost events on the canvas.
   * @param  {WebGLContextEvent}  e  - The context event
   */
  _handleGLContextLost(e) {
    e.preventDefault();

    this._isContextLost = true;
    this._drawPending = false;

    this.ticker.stop();         // stop ticking
    this.pause();               // stop rendering
    this.events.disable();      // stop listening for events
    this.highQuality = false;   // back off when we get the context restored..

    // We'll try to keep the Pixi environment around, so that code elsewhere
    // that references things like `scene`, `events`, etc has a chance of working.

    // Nothing will be rendered anyway, but at least browse mode doesn't
    // need Pixi for anything like the drawing/editing modes do.
    // If the user happened to be editing something when the context was lost, that's too bad.
    // We may be able to handle this better eventually, but for now we will just
    // assume the whole graphics system is getting thrown out.
    this.context.enter('browse');
    this.emit('statuschange', 'contextlost');

    // Normally Pixi's `GLContextSystem` would try to restore context if we call `render()`
    //  see https://pixijs.download/release/docs/rendering.GlContextSystem.html
    // But this process is buggy (see Pixi#10403) and we're paused and not calling render.
    // So instead, we'll try to restore the context ourselves here and replace Pixi completely.
    const renderer = this.pixi.renderer;
    const ext = renderer.context.extensions.loseContext; // WEBGL_lose_context extension
    if (!ext) return;  // I think all browsers we target should have this

    Promise.resolve()
      .then(() => new Promise(resolve => { window.setTimeout(resolve, 10); }))  // wait 10ms
      .then(() => ext.restoreContext());
  }


  /**
   * _handleGLContextRestored
   * Handler for webglcontextrestored events on the canvas.
   * @param  {WebGLContextEvent}  e  - The context event
   */
  _handleGLContextRestored(e) {
    Promise.resolve()
      .then(() => this._destroyPixi())
      .then(() => this._initPixiAsync())
      .then(() => this._afterPixiInit())
      .then(() => {
        // We just replaced the texture manager, so we have to tell it about the available SVG icons.
        const context = this.context;
        const $container = context.container();
        $container.selectAll('#rapid-defs symbol')
          .each((d, i, nodes) => {
            const symbol = nodes[i];
            const iconID = symbol.getAttribute('id');
            this.textures.registerSvgIcon(iconID, symbol);
          });

        this._isContextLost = false;
        this.events.enable();   // resume listening
        this.resume();          // resume rendering
        this.ticker.start();    // resume ticking
        this.emit('statuschange', 'contextrestored');
      });
  }


  /**
   * _destroyPixi
   * After a WebGL context loss, replace the parts of Pixi that need replacing.
   * Basically we need to destroy the `PIXI.Application`
   *  then force`_initPixiAsync` and `_afterPixiInit` to run again.
   *
   * Note: It might be possible avoid some of this, but I did hit this issue in testing:
   *  https://github.com/pixijs/pixijs/issues/10403
   * So for now, we will just replace the whole thing.
   *
   * To test, try:  `rapidContext.systems.gfx.testContextLoss()`
   *  and see whether Pixi can deal with it.
   */
  _destroyPixi() {
    if (!this.pixi) return;   // already destroyed

    const renderer = this.pixi.renderer;
    if (renderer.type === PIXI.RendererType.WEBGL) {
      // note that with multiview rendering the context canvas is not the view canvas (aka surface)
      const canvas = renderer.context.canvas;
      canvas.removeEventListener('webglcontextlost', this._handleGLContextLost);
      canvas.removeEventListener('webglcontextrestored', this._handleGLContextRestored);
    }

    const rendererDestroyOptions = {
      removeView: false   // leave the surface attached to the DOM
    };
    const applicationDestroyOptions = {
      children: true,
      texture: true,
      textureSource: true,
      context: true
    };

    this.pixi.destroy(rendererDestroyOptions, applicationDestroyOptions);
    this.pixi = null;

    this.origin = null;
    this.stage = null;
  }


  /**
   * testContextLoss
   * For testing, attempt to lose the WebGL context and get it back.
   */
  testContextLoss() {
    if (!this.pixi) return;

    const renderer = this.pixi.renderer;
    if (renderer.type !== PIXI.RendererType.WEBGL) return;

    const ext = renderer.context.extensions.loseContext; // WEBGL_lose_context extension
    if (!ext) return;  // I think all browsers we target should have this
    ext.loseContext();
    // We'll end up in `_handleGLContextLost()` listener above
  }

}
