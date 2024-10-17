import * as PIXI from 'pixi.js';
import { TAU, Viewport, numWrap, vecEqual, vecLength, vecRotate, vecScale, vecSubtract } from '@rapid-sdk/math';

import { AbstractSystem } from './AbstractSystem.js';
import { PixiEvents } from '../pixi/PixiEvents.js';
import { PixiScene } from '../pixi/PixiScene.js';
import { PixiTextures } from '../pixi/PixiTextures.js';
import { utilSetTransform } from '../util/util.js';

let _sharedTextures;   // singleton (for now)

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
 *   `draw`      Fires after a full redraw
 *   `move`      Fires after the map's transform has changed (can fire frequently)
 *               ('move' is mostly for when you want to update some content that floats over the map)
 */
export class GraphicsSystem extends AbstractSystem {

  /**
   * @constructor
   * @param  `context`   Global shared application context
   */
  constructor(context) {
    super(context);

    this.id = 'gfx';
    this.dependencies = new Set(['map', 'urlhash']);

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

    // Spector.js is a WebGL debugging tool, only available in the dev build.
    this.spector = null;

    // Properties used to manage the scene transform
    this.pixiViewport = new Viewport();
    this._prevTransform = { x: 0, y: 0, k: 256 / Math.PI, r: 0 };    // transform at time of last draw
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
    const urlhash = this.context.systems.urlhash;
    const prerequisites = Promise.all([
      urlhash.initAsync()
    ]);

    return this._initPromise = prerequisites
      .then(() => {
        // For testing, allow user to override the renderer preference:
        // `renderer=val` one of `webgl1`, `webgl2`/`webgl`, `webgpu`
        let renderPreference, renderGLVersion;
        switch (urlhash.initialHashParams.get('renderer')) {
          case 'webgpu':
            renderPreference = 'webgpu';
            break;
          case 'webgl1':
            renderPreference = 'webgl';
            renderGLVersion = 1;
            break;
          case 'webgl':
          case 'webgl2':
          default:
            renderPreference = 'webgl';
            renderGLVersion = 2;
        }

        // Setup PIXI defaults here..
        Object.assign(PIXI.TextureSource.defaultOptions, {
          autoGarbageCollect: false,
          autoGenerateMipmaps: false,
          resolution: 1
        });

        Object.assign(PIXI.HelloSystem.defaultOptions, {
          hello: true  // Log renderer and Pixi version to the console
        });

        const options = {
          antialias: true,
          autoDensity: true,
          autoStart: false,    // Don't start the ticker yet
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
          resolution: window.devicePixelRatio,
          sharedLoader: true,
          sharedTicker: true,
          textureGCActive: true,
          useBackBuffer: false
        };

        this.pixi = new PIXI.Application();
        return this.pixi.init(options);  // return Pixi's init Promise
      })
      .then(() => {   // After Pixi's init is complete...

        // Prepare a basic bitmap font that we can use for things like debug messages
        PIXI.BitmapFont.install({
          name: 'rapid-debug',
          style: {
            fill: { color: 0xffffff },
            fontSize: 14,
            stroke: { color: 0x333333 }
          },
          chars: PIXI.BitmapFontManager.ASCII,
          resolution: 2
        });

        // Enable debugging tools
        if (window.Rapid.isDebug) {
          // Register Pixi with the pixi-inspector extension if it is installed
          // https://github.com/bfanger/pixi-inspector
          globalThis.__PIXI_APP__ = this.pixi;

          window.__PIXI_DEVTOOLS__ = {
            pixi: PIXI,
            app: this.pixi
          };

          const renderer = this.pixi.renderer;
          if (window.SPECTOR && renderer.type === PIXI.RendererType.WEBGL) {
            this.spector = new window.SPECTOR.Spector();
            this.spector.spyCanvas(renderer.context.canvas);
          }
        }

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

        // Setup the ticker
        const ticker = this.pixi.ticker;
        const defaultListener = ticker._head.next;
        ticker.remove(defaultListener._fn, defaultListener._context);
        ticker.add(this._tick, this);

        this.scene = new PixiScene(this);
        this.events = new PixiEvents(this);

        // Texture Manager should only be created once
        // This is because it will start loading assets and Pixi's asset loader is not reentrant.
        // (it causes test failures if we create a bunch of these)
        if (!_sharedTextures) {
          _sharedTextures = new PixiTextures(this);
        }
        this.textures = _sharedTextures;
      });
  }


  /**
   * startAsync
   * Called after all core objects have been initialized.
   * @return {Promise} Promise resolved when this component has completed startup
   */
  startAsync() {
    if (this._startPromise) return this._startPromise;

    const context = this.context;
    const map = context.systems.map;
    const ui = context.systems.ui;

    // Wait for UI and Map to be ready, then start the ticker
    const prerequisites = Promise.all([
      map.startAsync(),
      ui.startAsync()
    ]);

    return this._startPromise = prerequisites
      .then(() => {
        this._started = true;
        this.pixi.ticker.start();
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

    const ticker = this.pixi.ticker;
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
    this._drawPending = false;
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
    const pixiViewport = this.pixiViewport;

    // Calculate the transform easing, if any
    if (this._transformEase) {
      const now = window.performance.now();

      const { time0, time1, xform0, xform1, resolve } = this._transformEase;
      const [x0, y0, k0] = [xform0.x, xform0.y, xform0.k];
      const [x1, y1, k1] = [xform1.x, xform1.y, xform1.k];

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
      const kNow = k0 + ((k1 - k0) * tween);
      const rNow = r0 + ((r1 - r0) * tween);
      const tNow = { x: xNow, y: yNow, k: kNow, r: rNow };
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
          mapViewport.transform = { x: t.x + dw, y: t.y + dh, k: t.k, r: t.r };
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
      tPrev.x !== tCurr.x || tPrev.y !== tCurr.y || tPrev.k !== tCurr.k || tPrev.r !== tCurr.r
    );

    if (hasChanges) {
      // Before, supersurface's transform-origin was "top left", now it is "center".
      // So we need to shift the coordinates back to top-left to make the math correct.
      const center = mapViewport.center();
      const currxy = vecSubtract([tCurr.x, tCurr.y], center);
      const prevxy = vecSubtract([tPrev.x, tPrev.y], center);
      const scale = tCurr.k / tPrev.k;
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
    const pixiViewport = this.pixiViewport;

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

    if (pixiTransform.k !== mapTransform.k || dist > 100000) {
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
    const pixiDims = this.pixiViewport.dimensions;
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

      // needed for multiview?
      // If we are using the WebGL renderer and have multiView enabled,
      // Pixi will render to a different canvas before copying to the target canvas.
      // The render canvas may need a resize too.
      if (renderer.type === PIXI.RendererType.WEBGL && renderer.context.multiView) {
        renderer.context.ensureCanvasSize(this.surface);
      }
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
//    const centerLoc = this.pixiViewport.project(mapViewport.centerLoc());
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
    debug.texture = this.textures.getDebugTexture('text');
    debug.position.set(50, -200);
    screen.position.set(50, -200);
  }

}
