import * as PIXI from 'pixi.js';
import { EventEmitter, skipHello } from '@pixi/utils';
import { Projection } from '@id-sdk/math';

import { PixiEvents } from './PixiEvents';
import { PixiScene } from './PixiScene';
import { PixiTextures } from './PixiTextures';
import { utilSetTransform } from '../util/util';

let _sharedTextures;   // singleton (for now)

const THROTTLE = 250;  // throttled rendering milliseconds (for now)


/**
 * PixiRenderer
 * The renderer implements a game loop and manages when rendering tasks happen.
 *
 * Properties you can access:
 *   `supersurface`   D3 selection to the parent `div` "supersurface"
 *   `surface`        D3 selection to the sibling `canvas` "surface"
 *   `overlay`        D3 selection to the sibling `div` "overlay"
 *   `pixi`           PIXI.Application() created to render to the canvas
 *   `stage`          PIXI.Container() that lives at the root of this scene
 *   `scene`          PixiScene manages the layers and features in the scene
 *   `events`         PixiEvents manages the events that other code might want to listen for
 *   `textures`       PixiTextures manages the textures
 *
 * Events available:
 *   `draw`      Fires after a full redraw
 *   `move`      Fires after the map's transform has changed (can fire frequently)
 *               ('move' is mostly for when you want to update some content that floats over the map)
 */
export class PixiRenderer extends EventEmitter {

  /**
   * Create a Pixi application rendering to the given canvas.
   * We also add it as `context.pixi` so that other parts of RapiD can use it.
   * @constructor
   * @global
   *
   * @param  context        Global shared application context
   * @param  supersurface   D3 selection to the parent `div` "supersurface"
   * @param  surface        D3 selection to the sibling `canvas` "surface"
   * @param  overlay        D3 selection to the sibling `div` "overlay"
   */
  constructor(context, supersurface, surface, overlay) {
    super();
    this.context = context;
    this.supersurface = supersurface;
    this.surface = surface;
    this.overlay = overlay;

    this._frame = 0;              // counter that increments
    this._timeToNextRender = 0;   // milliseconds of time to defer rendering
    this._appPending = false;
    this._drawPending = false;

    // Properties used to manage the scene transform
    this.pixiProjection = new Projection();
    this._transformDraw = null;      // transform at time of last draw
    this._isTransformed = false;     // is the supersurface transformed?
    this._transformEase = null;

    // Make sure callbacks have `this` bound correctly
    this._tick = this._tick.bind(this);
    this._onHoverChange = this._onHoverChange.bind(this);
    this._onSelectChange = this._onSelectChange.bind(this);


    // Register Pixi with the pixi-inspector extension if it is installed
    // https://github.com/bfanger/pixi-inspector
    if (window.__PIXI_INSPECTOR_GLOBAL_HOOK__) {
      window.__PIXI_INSPECTOR_GLOBAL_HOOK__.register({ PIXI: PIXI });
    }

    // Disable mipmapping, we always want textures near the resolution they are at.
    PIXI.BaseTexture.defaultOptions.mipmap = PIXI.MIPMAP_MODES.OFF;

    // Prefer WebGL 2.0 for now, this is to workaround issue #493 for now.
    PIXI.settings.PREFER_ENV = PIXI.ENV.WEBGL2;

    // Create a Pixi application rendering to the given surface `canvas`
    this.pixi = new PIXI.Application({
      antialias: true,
      autoDensity: true,
      autoStart: false,        // don't start the ticker yet
      resizeTo: supersurface.node(),
      resolution: window.devicePixelRatio,
      sharedLoader: true,
      sharedTicker: true,
      view: surface.node()
    });

// todo - we should stop doing this.. Access to pixi app should be via an instance of PixiRenderer
// so we can have multiple Pixi renderers - this will make the minimap less hacky & enable restriction editor
    context.pixi = this.pixi;

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

    ticker.add(this._tick, this);
    ticker.start();

    // Setup the stage
    const stage = this.pixi.stage;
    stage.name = 'stage';
    stage.sortableChildren = true;
    stage.interactive = true;
    // Add a big hit area to `stage` so that clicks on nothing will generate events
    stage.hitArea = new PIXI.Rectangle(-100000, -100000, 200000, 200000);
    this.stage = stage;

    // Setup other classes
    this.scene = new PixiScene(this);
    this.events = new PixiEvents(this);

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
    const selectedIDs = Array.from(this.context.selectedIDs());
    const selectedData = this.context.selectedData();
    this.scene.clearClass('selected');

    // hacky conversion to get around the id mismatch:
    for (let dataID of selectedIDs) {
      let layerID;
      if (dataID) {
        const datum = selectedData.get(dataID);
        if (!datum) {  // Legacy OSM select mode - there is no selectedData so the id is the id
          layerID = 'osm';
        } else if (datum?.__fbid__) {
          layerID = 'rapid';
        } else {
          // there are other selectable things - we will not select-style them for now :(
        }
      }

      if (layerID && dataID) {
        this.scene.classData(layerID, dataID, 'selected');
      }
    }

    this.render();
  }


  /**
   * _onHoverChange
   * Respond to any change in hover
   */
  _onHoverChange(eventData) {
    const target = eventData.target;
    const layerID = target?.layerID;
    const dataID = target?.dataID;

    const hoverData = target?.data;
    const mode = this.context.mode();
    if (mode?.id !== 'select') {
      this.context.ui().sidebar.hover(hoverData ? [hoverData] : []);
    }

    this.scene.clearClass('hovered');
    if (layerID && dataID) {
      this.scene.classData(layerID, dataID, 'hovered');
    }

    this.render();
  }


  /**
   * _tick
   * This is a Pixi.Ticker listener that runs in a `requestAnimationFrame` game loop.
   * We can use this to determine the true frame rate that we're running at,
   * and schedule work to happen at opportune times (within animation frame boundaries)
   */
  _tick() {
    const ticker = this.pixi.ticker;
    // console.log('FPS=' + ticker.FPS.toFixed(1));

    // For now, we will perform either APP (RapiD prepares scene graph) or DRAW (Pixi render) during a tick.
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
   * deferredRender
   * Schedules an APP pass but does not reset the timer
   */
  deferredRender() {
    this._appPending = true;
  }

  /**
   * render
   * Schedules an APP pass on the next available tick
   */
  render() {
    this._timeToNextRender = 0;    // asap
    this._appPending = true;
  }

  /**
   * setTransformAsync
   * Updates the transform and projection
   * @param   t           A Transform Object with `x, y, k` properties
   * @param   duration?   Duration of the transition in milliseconds, defaults to 0ms (asap)
   * @return  Promise that resolves when the transform has finished changing
   */
  setTransformAsync(t, duration = 0) {
    const now = window.performance.now();
    const tCurr = this.context.projection.transform();
    let promise;

    // If already easing, resolve before starting a new one
    if (this._transformEase) {
      this.context.projection.transform(tCurr);
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
      this.context.projection.transform(t);
      promise = Promise.resolve(t);
    }

    this._appPending = true;
    return promise;
  }


  /**
   * resize
   * Resizes the canvas to the given dimensions
   * @param  width    Width in pixels
   * @param  height   Height in pixels
   */
  resize(width, height) {
    this.pixi.renderer.resize(width, height);
    this._appPending = true;
  }


  /**
   * _tform
   * On each tick, manage the scene's transform
   * The few things we do here involve:
   *  - if there is a transform ease in progress, compute the eased transform
   *  - if the transform has changed from the last drawn transform,
   *    apply the difference to the supersurface and overlay
   */
  _tform() {
    // between APP and DRAW we dont want to change the transform at all
    // this shouldn't happen, but we check for it just in case.
    if (this._drawPending) return;

    // Calculate the transform easing, if any
    if (this._transformEase) {
      const { time0, time1, xform0, xform1, resolve } = this._transformEase;
      const [x0, y0, k0] = [xform0.x, xform0.y, xform0.k];
      const [x1, y1, k1] = [xform1.x, xform1.y, xform1.k];
      const now = window.performance.now();

      // keep it simple - linear interpolate
      const tween = Math.max(0, Math.min(1, (now - time0) / (time1 - time0)));
      const xNow = x0 + ((x1 - x0) * tween);
      const yNow = y0 + ((y1 - y0) * tween);
      const kNow = k0 + ((k1 - k0) * tween);
      const tNow = { x: xNow, y: yNow, k: kNow };
      this.context.projection.transform(tNow);

      if (tween === 1) {  // we're done
        resolve(tNow);
        this._transformEase = null;
      }

      this._appPending = true;  // needs occasional renders during/after easing
    }

    // Determine delta from last full draw and apply it to supersurface / overlay
    const tCurr = this.context.projection.transform();
    const tDraw = this._transformDraw;
    if (!tDraw) return;  // haven't drawn yet!

    const isChanged = this._isTransformed || (tDraw.x !== tCurr.x || tDraw.y !== tCurr.y || tDraw.k !== tCurr.k);
    if (isChanged) {
      const scale = tCurr.k / tDraw.k;
      const dx = (tCurr.x / scale - tDraw.x) * scale;
      const dy = (tCurr.y / scale - tDraw.y) * scale;
      utilSetTransform(this.supersurface, dx, dy, scale);
      utilSetTransform(this.overlay, -dx, -dy);
      this._isTransformed = true;
      this.emit('move');
    }
  }


  /**
   * _app
   * The "RapiD" part of the drawing.
   * Where we set up the scene graph and tell Pixi what needs to be drawn.
   */
  _app() {
    // Wait for textures to be loaded before attempting rendering.
    if (!this.textures?.loaded) return;

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
   * _draw
   * The "Pixi" part of the drawing
   * Where it converts Pixi geometries into WebGL instructions.
   */
  _draw() {
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
    this._transformDraw = this.context.projection.transform();
    this._timeToNextRender = THROTTLE;

    if (this._isTransformed) {
      utilSetTransform(this.supersurface, 0, 0);
      utilSetTransform(this.overlay, 0, 0);
      this._isTransformed = false;
      this.emit('move');
    }

    this._drawPending = false;
    this.emit('draw');
    this._frame++;
  }
}
