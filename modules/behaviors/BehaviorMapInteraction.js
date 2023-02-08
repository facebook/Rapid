import { geoZoomToScale, vecLength } from '@id-sdk/math';

import { AbstractBehavior } from './AbstractBehavior';
import { osmNode } from '../osm';

// constants
const TILESIZE = 256;
const MINZOOM = 2;
const MAXZOOM = 24;
const MINK = geoZoomToScale(MINZOOM, TILESIZE);
const MAXK = geoZoomToScale(MAXZOOM, TILESIZE);

const NEAR_TOLERANCE = 1;
const FAR_TOLERANCE = 4;


/**
 * `BehaviorMapInteraction` listens to pointer events and converts those into zoom/pan map interactions
 *
 * Properties available:
 *   `enabled`             `true` if the event handlers are enabled, `false` if not.
 *   `doubleClickEnabled`  `true` if double clicks can zoom, `false` if not.
 *   `lastDown`            `eventData` Object for the most recent down event
 *   `gesture`             String containing the current detected gesture ('pan')
 */
export class BehaviorMapInteraction extends AbstractBehavior {

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

    // Make sure the event handlers have `this` bound correctly
    this._click = this._click.bind(this);
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

    const eventManager = this.context.map().renderer.events;
    eventManager.on('click', this._click);
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

    const eventManager = this.context.map().renderer.events;
    eventManager.off('click', this._click);
    eventManager.off('pointerdown', this._pointerdown);
    eventManager.off('pointermove', this._pointermove);
    eventManager.off('pointerup', this._pointerup);
    eventManager.off('pointercancel', this._pointercancel);
    eventManager.off('wheel', this._wheel);
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

    function clamp(num, min, max) {
      return Math.max(min, Math.min(num, max));
    }

    const [x, y] = [e.global.x, e.global.y];
    const t = this.context.projection.transform();
    const isShiftDown = e.getModifierState('Shift');

    // local mouse coord to transform origin (was: d3 `transform.invert`)
    const p1 = [ (x - t.x) / t.k, (y - t.y) / t.k ];
    let k2 = t.k * (isShiftDown ? 0.5 : 2);  // rescale
    k2 = clamp(k2, MINK, MAXK);

    // transform origin back to local coord
    const x2 = x - p1[0] * k2;
    const y2 = y - p1[1] * k2;

    this.context.map().transformEase({ x: x2, y: y2, k: k2 });
  }


  /**
   * _pointerdown
   * Handler for pointerdown events.  Note that you can get multiples of these
   * if the user taps with multiple fingers. We lock in the first one in `lastDown`.
   * @param  `e`  A Pixi FederatedPointerEvent
   */
  _pointerdown(e) {
    if (this.lastDown) return;   // a pointer is already down

    // If shift is pressed it's a lasso, not a map drag
    const eventManager = this.context.map().renderer.events;
    if (eventManager.modifierKeys.has('Shift')) return;

    const down = this._getEventData(e);
    const isDraggableTarget = (down.target?.data instanceof osmNode && down.target?.layerID === 'osm');

    // If left mouse button over a draggable target, user is dragging that target, not the map
    if (isDraggableTarget && e.pointerType === 'mouse' && e.button === 0) return;

    this.lastDown = down;
    this.gesture = null;
    eventManager.setCursor('grabbing');
  }


  /**
   * _pointermove
   * Handler for pointermove events.
   * @param  `e`  A Pixi FederatedPointerEvent
   */
  _pointermove(e) {
    const down = this.lastDown;
    const move = this._getEventData(e);
    if (!down || down.id !== move.id) return;   // not down, or different pointer

    if (!this.gesture) {   // start dragging?
      const dist = vecLength(down.coord, move.coord);
      const tolerance = (down.originalEvent.pointerType === 'pen') ? FAR_TOLERANCE : NEAR_TOLERANCE;
      this.was = [move.originalEvent.clientX, move.originalEvent.clientY];
      if (dist >= tolerance) {
        this.gesture = 'pan';
      }
    }

    if (this.gesture === 'pan') {
      const original = move.originalEvent;
      const t = this.context.projection.transform();

      const newX = original.clientX - this.was[0];
      const newY = original.clientY - this.was[1];
      this.was = [original.clientX, original.clientY];

      const tNew = { x: t.x + newX, y: t.y + newY, k: t.k };

      this.context.map().transform(tNew);
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

    const eventManager = this.context.map().renderer.events;
    eventManager.setCursor('inherit');
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

    const eventManager = this.context.map().renderer.events;
    eventManager.setCursor('inherit');
  }


  /**
   * _wheel
   * Handler for wheel events.
   * @param  `e`  A DOM WheelEvent
   */
  _wheel(e) {
    const [x, y] = [e.offsetX, e.offsetY];
    const [dX, dY] = [e._normalizedDeltaX, e._normalizedDeltaY];
    const t = this.context.projection.transform();
    let tNew;

    function clamp(num, min, max) {
      return Math.max(min, Math.min(num, max));
    }

    if (e._gesture === 'zoom') {
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

    this.context.map().transform(tNew);

  }

}
