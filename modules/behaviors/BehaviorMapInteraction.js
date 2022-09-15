import { geoZoomToScale, vecEqual, vecLength } from '@id-sdk/math';

import { AbstractBehavior } from './AbstractBehavior';
import { osmNode } from '../osm';
import { utilDetect } from '../util/detect';

// constants
const TILESIZE = 256;
const MINZOOM = 2;
const MAXZOOM = 24;
const MINK = geoZoomToScale(MINZOOM, TILESIZE);
const MAXK = geoZoomToScale(MAXZOOM, TILESIZE);

const NEAR_TOLERANCE = 1;
const FAR_TOLERANCE = 4;
const DEBUG = false;

/**
 * `BehaviorMapInteraction` listens to pointer events and converts those into zoom/pan map interactions
 *
 * Properties available:
 *   `enabled`     `true` if the event handlers are enabled, `false` if not.
 *   `coord`       `[x,y]` coordinate of the latest event (previously: `InteractionManager.mouse`)
 *   `lastDown`    `eventData` Object for the most recent down event
 *   `lastMove`    `eventData` Object for the most recent move event
 *   `gesture`     String containing the current detected gesture ('pan')
 *
 * Events available:
 *   `transformchanged`  Fires whenever we want to change the map transform
 */
export class BehaviorMapInteraction extends AbstractBehavior {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'map-interaction';

    this.coord = [0, 0];
    this.lastDown = null;
    this.lastMove = null;
    this.gesture = null;

    // Make sure the event handlers have `this` bound correctly
    this._pointerdown = this._pointerdown.bind(this);
    this._pointermove = this._pointermove.bind(this);
    this._pointerup = this._pointerup.bind(this);
    this._pointercancel = this._pointercancel.bind(this);
    this._wheel = this._wheel.bind(this);
  }


  /**
   * enable
   * Bind event handlers
   */
  enable() {
    if (this._enabled) return;
    if (!this.context.pixi) return;

    if (DEBUG) {
      console.log('BehaviorMapInteraction: enabling listeners');  // eslint-disable-line no-console
    }

    this._enabled = true;
    this.lastDown = null;
    this.gesture = null;

    const stage = this.context.pixi.stage;
    stage.addEventListener('pointerdown', this._pointerdown);
    stage.addEventListener('pointermove', this._pointermove);
    stage.addEventListener('pointerup', this._pointerup);
    stage.addEventListener('pointerupoutside', this._pointercancel);  // if up outide, just cancel
    stage.addEventListener('pointercancel', this._pointercancel);
    stage.addEventListener('wheel', this._wheel);
  }


  /**
   * disable
   * Unbind event handlers
   */
  disable() {
    if (!this._enabled) return;
    if (!this.context.pixi) return;

    if (DEBUG) {
      console.log('BehaviorMapInteraction: disabling listeners');  // eslint-disable-line no-console
    }

    this._enabled = false;
    this.lastDown = null;
    this.lastMove = null;
    this.gesture = null;

    const stage = this.context.pixi.stage;
    stage.removeEventListener('pointerdown', this._pointerdown);
    stage.removeEventListener('pointermove', this._pointermove);
    stage.removeEventListener('pointerup', this._pointerup);
    stage.removeEventListener('pointerupoutside', this._pointercancel);  // if up outide, just cancel
    stage.removeEventListener('pointercancel', this._pointercancel);
    stage.removeEventListener('wheel', this._wheel);
  }


  /**
   * _pointerdown
   * Handler for pointerdown events.  Note that you can get multiples of these
   * if the user taps with multiple fingers. We lock in the first one in `lastDown`.
   * @param  `e`  A Pixi FederatedPointerEvent
   */
  _pointerdown(e) {
    if (this.lastDown) return; // a pointer is already down

    this.coord = [e.global.x, e.global.y];

    const down = this._getEventData(e);
    const draggableTarget = (down.data instanceof osmNode);
    if (draggableTarget) return;

    const original = down.originalEvent;
    if (original.button !== 0) return;   // left button only

    this.lastDown = down;
    this.gesture = null;
  }


  /**
   * _pointermove
   * Handler for pointermove events.  Note that you can get multiples of these
   * if the user taps with multiple fingers. We lock in the first one in `lastDown`.
   * @param  `e`  A Pixi FederatedPointerEvent
   */
  _pointermove(e) {
    this.coord = [e.global.x, e.global.y];

    const down = this.lastDown;
    const move = this._getEventData(e);
    this.lastMove = move;

    if (!down || down.id !== move.id) return;  // not down, or different pointer

    if (!this.gesture) {   // start dragging?
      const dist = vecLength(down.coord, move.coord);
      const tolerance = (down.originalEvent.pointerType === 'pen') ? FAR_TOLERANCE : NEAR_TOLERANCE;
      if (dist >= tolerance) {
        this.gesture = 'pan';
      }
    }

    if (this.gesture === 'pan') {
      const original = move.originalEvent;
      const [dX, dY] = [original.movementX, original.movementY];
      const t = this.context.projection.transform();
      const tNew = { x: t.x + dX, y: t.y + dY, k: t.k };

      this.emit('transformchanged', tNew);
    }
  }


  /**
   * _pointerup
   * Handler for pointerup events.  Note that you can get multiples of these
   * if the user taps with multiple fingers. We lock in the first one in `lastDown`.
   * @param  `e`  A Pixi FederatedPointerEvent
   */
  _pointerup(e) {
    const down = this.lastDown;
    const up = this._getEventData(e);
    if (!down || down.id !== up.id) return; // not down, or different pointer

    this.lastDown = null;
    this.gesture = null;
  }


  /**
   * _pointercancel
   * Handler for pointercancel events.
   * @param  `e`  A Pixi FederatedPointerEvent
   */
  _pointercancel(e) {
    const cancel = this._getEventData(e);

    // Here we can throw away the down data to prepare for another `pointerdown`.
    // After pointercancel, there should be no more `pointermove` or `pointerup` events.
    this.lastDown = null;
    this.gesture = null;
  }


  /**
   * _wheel
   * Handler for wheel events.
   * @param  `e`  A Pixi FederatedWheelEvent
   */
  _wheel(e) {
    let [dX, dY] = this._normalizeWheelDelta(e.nativeEvent);
    const [x, y] = [e.global.x, e.global.y];
    this.coord = [x, y];

    function isRoundNumber(val) {
      return typeof val === 'number' && isFinite(val) && Math.floor(val) === val;
    }
    function clamp(num, min, max) {
      return Math.max(min, Math.min(num, max));
    }

    // Autodetect whether the user wants to pan or zoom:
    // Round numbers
    //   - 2-finger pans on a trackpad
    // Fractional numbers
    //   - 2-finger pinch-zooms on a trackpad
    //   - mouse wheels
    let isZoom = false;   // default - treat wheel events as a pan gesture

    if (!isRoundNumber(dY)) {
      isZoom = true;
      dY *= 6;  // slightly scale up whatever the browser gave us
    } else if (e.nativeEvent.shiftKey) {
      isZoom = true;
      dY *= 3;  // slightly scale up whatever the browser gave us
    }

    const t = this.context.projection.transform();
    let tNew;

    if (isZoom) {
      // local mouse coord to transform origin (was: d3 `transform.invert`)
      const p1 = [ (x - t.x) / t.k, (y - t.y) / t.k ];

      // rescale
      let k2 = t.k * Math.pow(2, -dY / 500);
      k2 = clamp(k2, MINK, MAXK);

      // transform origin back to local coord
      const x2 = x - p1[0] * k2;
      const y2 = y - p1[1] * k2;
      tNew = { x: x2, y: y2, k: k2 };

    } else {  // pan
      tNew = { x: t.x - dX, y: t.y - dY, k: t.k };
    }

    this.emit('transformchanged', tNew);
  }


  /**
   * _normalizeWheelDelta
   * This code performs some adjustment of the wheel event delta values.
   * The values may be given in PIXEL, LINES, or PAGE and we want them in PIXEL.
   *
   * Great summaries here:
   *   https://dev.to/danburzo/pinch-me-i-m-zooming-gestures-in-the-dom-a0e
   *   https://github.com/w3c/uievents/issues/181#issuecomment-392648065
   *
   * Note that Firefox will now change its behavior depending on how you look at the delta values!
   *   https://github.com/mdn/content/issues/11811
   *   https://bugzilla.mozilla.org/show_bug.cgi?id=1392460#c33
   * (Because Pixi's `normalizeWheelEvent` code in `EventSystem.ts` reads `deltaMode` before `deltaX/Y`,
   *   we get LINES sometimes in Firefox, particularly when using a physical mouse with a wheel)
   *
   * Also see https://github.com/basilfx/normalize-wheel/blob/master/src/normalizeWheel.js
   *   for an older version of this sort of code.
   *
   * And this great page for testing what events your browser generates:
   *   https://domeventviewer.com/
   *
   * @param   `e`  A native DOM WheelEvent
   * @returns `Array` of normalized `[deltaX, deltaY]` in pixels
   */
  _normalizeWheelDelta(e) {
    let [dX, dY] = [e.deltaX, e.deltaY];  // raw delta values

    if (dY === 0 && e.shiftKey) {         // Some browsers treat skiftKey as horizontal scroll
      [dX, dY] = [e.deltaY, e.deltaX];    // swap dx/dy values to undo it.
    }

    let [sX, sY] = [Math.sign(dX), Math.sign(dY)];    // signs
    let [mX, mY] = [Math.abs(dX), Math.abs(dY)];      // magnitudes

    // Round numbers are generally generated from 2 finger pans on a trackpad.
    // We'll try to keep the round numbers round and the fractional numbers fractional.
    // Also, we want round numbers in LINE or PAGE units to become fractional because they won't be from a trackpad.
    const isRoundX = (typeof mY === 'number' && isFinite(mX) && Math.floor(mX) === mX);
    const isRoundY = (typeof mY === 'number' && isFinite(mY) && Math.floor(mY) === mY);
    const fuzzX = (isRoundX && e.deltaMode === WheelEvent.DOM_DELTA_PIXEL) ? 0 : 0.001;
    const fuzzY = (isRoundY && e.deltaMode === WheelEvent.DOM_DELTA_PIXEL) ? 0 : 0.001;

    // If the wheel delta values are not given in pixels, convert to pixels.
    // (These days only Firefox will _sometimes_ report wheel delta in LINE units).
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1392460#c33
    if (e.deltaMode !== WheelEvent.DOM_DELTA_PIXEL) {
      let pixels;
      if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) {
        pixels = 8;
      } else if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
        pixels = 24;
      } else {     /* unknown units? */
        pixels = 1;
      }

      mX *= pixels;
      mY *= pixels;
    }

    // Limit the returned values to prevent user from scrolling too fast.
    const MAX = 40;
    const pX = sX * (Math.min(MAX, mX) + fuzzX);
    const pY = sY * (Math.min(MAX, mY) + fuzzY);

    // console.log(`deltaMode = ${e.deltaMode}, inX = ${e.deltaX}, inY = ${e.deltaY}, outX = ${pX}, outY = ${pY}`);
    return [pX, pY];
  }

}
