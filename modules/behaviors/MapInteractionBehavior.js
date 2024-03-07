import { DEG2RAD, MIN_K, MAX_K, numClamp, vecLength, vecRotate, vecSubtract } from '@rapid-sdk/math';

import { AbstractBehavior } from './AbstractBehavior.js';
import { osmNode } from '../osm/node.js';

const NEAR_TOLERANCE = 1;
const FAR_TOLERANCE = 4;


/**
 * `MapInteractionBehavior` listens to pointer events and converts those into zoom/pan map interactions
 *
 * Properties available:
 *   `enabled`             `true` if the event handlers are enabled, `false` if not.
 *   `doubleClickEnabled`  `true` if double clicks can zoom, `false` if not.
 *   `lastDown`            `eventData` Object for the most recent down event
 *   `gesture`             String containing the current detected gesture ('pan' or 'rotate')
 */
export class MapInteractionBehavior extends AbstractBehavior {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'map-interaction';

    this.lastDown = null;
    this.gesture = null;
    this.doubleClickEnabled = true;

    this._lastPoint = null;
    this._lastAngle = null;

    // Make sure the event handlers have `this` bound correctly
    this._click = this._click.bind(this);
    this._keydown = this._keydown.bind(this);
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

    this._enabled = true;
    this.lastDown = null;
    this.gesture = null;

    this._lastPoint = null;
    this._lastAngle = null;

    const eventManager = this.context.systems.map.renderer.events;
    eventManager.on('click', this._click);
    eventManager.on('keydown', this._keydown);
    eventManager.on('pointerdown', this._pointerdown);
    eventManager.on('pointermove', this._pointermove);
    eventManager.on('pointerup', this._pointerup);
    eventManager.on('pointercancel', this._pointercancel);
    eventManager.on('wheel', this._wheel);
  }


  /**
   * disable
   * Unbind event handlers
   */
  disable() {
    if (!this._enabled) return;

    this._enabled = false;
    this.lastDown = null;
    this.gesture = null;

    this._lastPoint = null;
    this._lastAngle = null;

    const eventManager = this.context.systems.map.renderer.events;
    eventManager.off('click', this._click);
    eventManager.off('keydown', this._keydown);
    eventManager.off('pointerdown', this._pointerdown);
    eventManager.off('pointermove', this._pointermove);
    eventManager.off('pointerup', this._pointerup);
    eventManager.off('pointercancel', this._pointercancel);
    eventManager.off('wheel', this._wheel);
  }


  /**
   * _keydown
   * Handler for keydown events on the window.
   * @param  `e`  A DOM KeyboardEvent
   */
  _keydown(e) {
    // Only allow key navigation if the user doesn't have something
    // more important focused - like a input, textarea, menu, etc.
    const activeElement = document.activeElement?.tagName ?? 'BODY';
    if (activeElement !== 'BODY') return;

    const context = this.context;
    const map = context.systems.map;
    const viewport = context.viewport;
    const EASE = 100;  // milliseconds

    // IF the mapillary image viewer is showing, don't do this handler.
    if (context.services.mapillary.viewerShowing) return;
    if (context.mode?.id === 'select-osm') return;

    // rotate
    if (e.shiftKey) {
      const ROT_AMOUNT = 5 * DEG2RAD;   // ± 5°
      const t = map.transform();
      let delta;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        delta = -ROT_AMOUNT;
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        delta = ROT_AMOUNT;
      }

      if (delta) {
        e.preventDefault();
        map.transformEase({ x: t.x, y: t.y, k: t.k, r: t.r + delta }, EASE);
      }

    // pan
    } else {
      const PAN_AMOUNT = 80;   // in pixels
      const [w, h] = map.dimensions;
      const panMore = (e.altKey || e.metaKey || e.ctrlKey);  // pan more if modifier down

      let delta;
      if (e.key === 'ArrowLeft') {
        delta = panMore ? [w / 2, 0] : [PAN_AMOUNT, 0];
      } else if (e.key === 'ArrowRight') {
        delta = panMore ? [-w / 2, 0] : [-PAN_AMOUNT, 0];
      } else if (e.key === 'ArrowUp') {
        delta = panMore ? [0, h / 2] : [0, PAN_AMOUNT];
      } else if (e.key === 'ArrowDown') {
        delta = panMore ? [0, -h / 2] : [0, -PAN_AMOUNT];
      }

      if (delta) {
        e.preventDefault();
        map.pan(delta, EASE);
      }
    }
  }


  /**
   * _click
   * Handler for click events, used to support double-click to zoom/unzoom.
   * @param  `e`  A Pixi FederatedPointerEvent
   */
  _click(e) {
    if (!this.doubleClickEnabled) return;
    if (e.detail !== 2) return;    // double clicks only
    if (e.pointerType === 'mouse' && e.button !== 0) return;   // left click only (if a mouse)

    const click = this._getEventData(e);
    const [x, y] = click.coord.surface;
    const t = this.context.viewport.transform();
    const isShiftDown = e.getModifierState('Shift');

    // local mouse coord to transform origin (was: d3 `transform.invert`)
    const p1 = [ (x - t.x) / t.k, (y - t.y) / t.k ];
    let k2 = t.k * (isShiftDown ? 0.5 : 2);  // rescale
    k2 = numClamp(k2, MIN_K, MAX_K);

    // transform origin back to local coord
    const x2 = x - p1[0] * k2;
    const y2 = y - p1[1] * k2;

    this.context.systems.map.transformEase({ x: x2, y: y2, k: k2, r: t.r });
  }


  /**
   * _pointerdown
   * Handler for pointerdown events.  Note that you can get multiples of these
   * if the user taps with multiple fingers. We lock in the first one in `lastDown`.
   * @param  `e`  A Pixi FederatedPointerEvent
   */
  _pointerdown(e) {
    if (this.lastDown) return;   // a pointer is already down

    const context = this.context;
    const map = context.systems.map;
    const eventManager = map.renderer.events;

    // If shift is pressed it's a lasso, not a map drag
    if (eventManager.modifierKeys.has('Shift')) return;

    const down = this._getEventData(e);
    const isDraggableTarget = (down.target?.data instanceof osmNode && down.target?.layerID === 'osm');

    // If left mouse button over a draggable target, user is dragging that target, not the map
    if (isDraggableTarget && e.pointerType === 'mouse' && e.button === 0) return;

    this.lastDown = down;
    this.gesture = null;
    this._lastPoint = null;
    this._lastAngle = null;

    const mode = context.mode.id;
    if (mode === 'draw-area' || mode === 'draw-line') {
      eventManager.setCursor('crosshair');
    } else {
      eventManager.setCursor('grabbing');
    }
  }


  /**
   * _pointermove
   * Handler for pointermove events.
   * @param  `e`  A Pixi FederatedPointerEvent
   */
  _pointermove(e) {
    const context = this.context;
    const map = context.systems.map;
    const eventManager = map.renderer.events;
    const viewport = context.viewport;

    const down = this.lastDown;
    const move = this._getEventData(e);
    if (!down || down.id !== move.id) return;   // not down, or different pointer

    const t = viewport.transform();

    if (!this.gesture) {   // start dragging?
      const dist = vecLength(down.coord.screen, move.coord.screen);
      const tolerance = (down.originalEvent.pointerType === 'pen') ? FAR_TOLERANCE : NEAR_TOLERANCE;
      // this._lastPoint = move.coord.screen;
      this._lastPoint = [move.originalEvent.clientX, move.originalEvent.clientY];
      this._lastAngle = t.r;

      if (dist >= tolerance) {
        const modifiers = eventManager.modifierKeys;
        this.gesture = modifiers.has('Alt') || modifiers.has('Control') ? 'rotate' : 'pan';
      }
    }

    if (this.gesture) {  // continue dragging
      const original = move.originalEvent;
      // const currPoint = move.coord.screen;
      const currPoint = [original.clientX, original.clientY];
      const [dX, dY] = vecSubtract(currPoint, this._lastPoint);   // delta pointer movement
      this._lastPoint = currPoint;

      if (this.gesture === 'pan') {
        map.transform({ x: t.x + dX, y: t.y + dY, k: t.k, r: t.r });

      } else if (this.gesture === 'rotate') {        // see also `RotateMode.js`
        const pivotPoint = viewport.center();
        const [sX, sY] = [                           // swap signs if needed
          (currPoint[0] > pivotPoint[0]) ? 1 : -1,   // right/left of pivot
          (currPoint[1] > pivotPoint[1]) ? -1 : 1    // above/below pivot
        ];
        const degrees = (sY * dX) + (sX * dY);   // Degrees rotation to apply: + clockwise, - counterclockwise
        const SPEED = 0.3;
        const angle = this._lastAngle + (degrees * DEG2RAD * SPEED);
        this._lastAngle = angle;

        map.transform({ x: t.x, y: t.y, k: t.k, r: angle });
      }
    }
  }


  /**
   * _pointerup
   * Handler for pointerup events.
   * @param  `e`  A Pixi FederatedPointerEvent
   */
  _pointerup(e) {
    const down = this.lastDown;
    const up = this._getEventData(e);
    if (!down || down.id !== up.id) return;   // not down, or different pointer

    this.lastDown = null;
    this.gesture = null;
    this._lastPoint = null;
    this._lastAngle = null;

    const eventManager = this.context.systems.map.renderer.events;
    const mode = this.context.mode.id;
    if (mode === 'draw-area' || mode === 'draw-line') {
      eventManager.setCursor('crosshair');
    } else {
      eventManager.setCursor('grab');
    }
  }


  /**
   * _pointercancel
   * Handler for pointercancel events.
   * @param  `e`  A Pixi FederatedPointerEvent
   */
  _pointercancel() {
    // Here we can throw away the down data to prepare for another `pointerdown`.
    // After pointercancel, there should be no more `pointermove` or `pointerup` events.
    this.lastDown = null;
    this.gesture = null;
    this._lastPoint = null;
    this._lastAngle = null;
  }


  /**
   * _wheel
   * Handler for wheel events.
   * @param  `e`  A DOM WheelEvent
   */
  _wheel(e) {
    const [x, y] = e._coord.surface;
    const [dX, dY] = [e._normalizedDeltaX, e._normalizedDeltaY];
    const t = this.context.viewport.transform();
    let tNew;

    // We aren't going to set `this.gesture` here, because that is for tracking what
    // the user is doing through a pointerdown-pointermove-pointerup situation..

    if (e._gesture === 'zoom') {
      // convert mouse coord to transform origin (was: d3 `transform.invert`)
      const x1 = (x - t.x) / t.k;
      const y1 = (y - t.y) / t.k;

      // rescale
      let k2 = t.k * Math.pow(2, -dY / 500);
      k2 = numClamp(k2, MIN_K, MAX_K);

      // transform origin back to local coord
      const x2 = x - x1 * k2;
      const y2 = y - y1 * k2;
      tNew = { x: x2, y: y2, k: k2, r: t.r };

    } else {  // pan
      tNew = { x: t.x - dX, y: t.y - dY, k: t.k, r: t.r };
    }

    this.context.systems.map.transform(tNew);
  }

}
