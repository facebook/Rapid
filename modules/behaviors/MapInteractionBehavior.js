import { DEG2RAD, MIN_K, MAX_K, numClamp, vecLength, vecSubtract } from '@rapid-sdk/math';

import { AbstractBehavior } from './AbstractBehavior.js';
import { osmNode } from '../osm/node.js';

const NEAR_TOLERANCE = 1;
const FAR_TOLERANCE = 4;
const MIN_Z = 2;
const MAX_Z = 24;


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
    this.id = 'mapInteraction';

    this.lastDown = null;
    this.gesture = null;
    this.doubleClickEnabled = true;

    this._lastPoint = null;
    this._lastAngle = null;
    this.activeTouches = {};
    this._initialPinchDistance = null;
    this._initialScale = null;

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
    // (buttons are ok, but not preset buttons)
    const tagName = document.activeElement?.tagName ?? 'BODY';
    if (!(['BODY', 'BUTTON'].includes(tagName))) return;
    if (document.activeElement?.classList?.contains('preset-list-button')) return;

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
      const t = viewport.transform.props;
      let delta;
      if (e.key === 'ArrowLeft') {
        delta = -ROT_AMOUNT;
      } else if (e.key === 'ArrowRight') {
        delta = ROT_AMOUNT;
      }

      if (delta) {
        e.preventDefault();
        map.transformEase({ x: t.x, y: t.y, k: t.k, r: t.r + delta }, EASE);
      }

    // pan
    } else {
      const PAN_AMOUNT = 80;   // in pixels
      const [w, h] = viewport.dimensions;
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

    const context = this.context;
    const map = context.systems.map;
    const viewport = context.viewport;
    const t = viewport.transform.props;

    const click = this._getEventData(e);
    const [x, y] = click.coord.map;
    const isShiftDown = e.getModifierState('Shift');

    // local mouse coord to transform origin (was: d3 `transform.invert`)
    const p1 = [ (x - t.x) / t.k, (y - t.y) / t.k ];
    let k2 = t.k * (isShiftDown ? 0.5 : 2);  // zoom out / zoom in
    k2 = numClamp(k2, MIN_K, MAX_K);

    // transform origin back to local coord
    const x2 = x - p1[0] * k2;
    const y2 = y - p1[1] * k2;

    map.transformEase({ x: x2, y: y2, k: k2, r: t.r });
  }


  /**
   * _pointerdown
   * Handler for pointerdown events.  Note that you can get multiples of these
   * if the user taps with multiple fingers. We lock in the first one in `lastDown`.
   * @param  `e`  A Pixi FederatedPointerEvent
   */
  _pointerdown(e) {
    this.activeTouches[e.pointerId] = { x: e.global.x, y: e.global.y, clientX: e.clientX, clientY: e.clientY };
    if (Object.keys(this.activeTouches).length === 2) {
        this._initialPinchDistance = this._getDistanceBetweenTouches();
    }
    // Update the pinch state or any other gesture recognition logic
    this._updatePinchState();

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
    this.activeTouches[e.pointerId] = { x: e.global.x, y: e.global.y, clientX: e.clientX, clientY: e.clientY };
    if (Object.keys(this.activeTouches).length === 2) {
        const currentDistance = this._getDistanceBetweenTouches();
        if (!this._initialPinchDistance) {
            this._initialPinchDistance = currentDistance;
        }
        const scaleChange = currentDistance / this._initialPinchDistance;
        this._applyZoomWithDamping(scaleChange);
        // Update the initial distance after applying zoom
        this._initialPinchDistance = currentDistance;
    }

    const context = this.context;
    const map = context.systems.map;
    const eventManager = map.renderer.events;
    const viewport = context.viewport;

    const down = this.lastDown;
    const move = this._getEventData(e);
    if (!down || down.id !== move.id) return;   // not down, or different pointer

    // Because the handler is listening on the Pixi surface, and the surface is itself
    // getting transformed, we use `clientX`/`clientY` to avoid the map being jittery.
    const currPoint = [move.originalEvent.clientX, move.originalEvent.clientY];
    const t = viewport.transform.props;

    if (!this.gesture) {   // start dragging?
      const dist = vecLength(down.coord.screen, move.coord.screen);
      const tolerance = (down.originalEvent.pointerType === 'pen') ? FAR_TOLERANCE : NEAR_TOLERANCE;
      this._lastPoint = currPoint;
      this._lastAngle = t.r;

      if (dist >= tolerance) {
        const modifiers = eventManager.modifierKeys;
        this.gesture = modifiers.has('Alt') || modifiers.has('Control') ? 'rotate' : 'pan';
      }
    }

    if (this.gesture) {  // continue dragging
      const [dx, dy] = vecSubtract(currPoint, this._lastPoint);   // delta pointer movement
      this._lastPoint = currPoint;

      if (this.gesture === 'pan') {
        map.pan([dx, dy]);

      } else if (this.gesture === 'rotate') {        // see also `RotateMode.js`
        // In here, we actually use `move.coord.screen`, not `clientX`/`clientY`
        // because we need to compare it to the map center, not the container.
        const point = move.coord.screen;
        const pivot = viewport.center();
        const [sx, sy] = [                  // swap signs if needed
          (point[0] > pivot[0]) ? 1 : -1,   // right/left of pivot
          (point[1] > pivot[1]) ? -1 : 1    // above/below pivot
        ];
        const degrees = (sy * dx) + (sx * dy);   // Degrees rotation to apply: + clockwise, - counterclockwise
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
    // Remove the touch point from the activeTouches object
    delete this.activeTouches[e.pointerId];
    if (Object.keys(this.activeTouches).length === 0) {
        this._initialPinchDistance = null;  // Reset initial distance when all fingers are lifted
    }
    this._updatePinchState();

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
  _pointercancel(e) {
    // Remove the specific touch point
    delete this.activeTouches[e.pointerId];
    this._updatePinchState();
    // Reset interaction states if necessary
    if (Object.keys(this.activeTouches).length === 0) {
        this.lastDown = null;
        this.gesture = null;
        this._lastPoint = null;
        this._lastAngle = null;
    }
  }


  /**
   * _pinchStart
   * Handler for the start of a pinch gesture. Initializes the pinch distance and scale.
   * @param {Event} e - The event object containing touch points.
   */
  _pinchStart(e) {
    const dist = this._getDistanceBetweenTouches(e);
    this._initialPinchDistance = dist;
    this._initialScale = this.context.viewport.transform.scale; // Capture the scale at the start of the pinch
  }


  /**
   * _pinchMove
   * Handler for the movement during a pinch gesture. Calculates and applies the new scale based on the change in distance between touches.
   * @param {Event} e - The event object containing touch points.
   */
  _pinchMove(e) {
    const currentDist = this._getDistanceBetweenTouches(e);
    if (this._initialPinchDistance) {
        const scaleRatio = currentDist / this._initialPinchDistance;
        const currentZoom = this.context.viewport.transform.zoom;
        const adjustedScaleRatio = this._applyDamping(scaleRatio, currentZoom);
        const newZoom = currentZoom * adjustedScaleRatio;
        const clampedZoom = Math.max(MIN_Z, Math.min(newZoom, MAX_Z));
        this._smoothZoom(clampedZoom);
    }
  }


  /**
   * _pinchEnd
   * Handler for the end of a pinch gesture. Logs the final scale and resets initial values.
   * @param {Event} e - The event object that signifies the end of the touch.
   */
  _pinchEnd(e) {
    this._initialPinchDistance = null;
    this._initialScale = null;
  }


  /**
   * Applies zoom with damping based on the scale change.
   * This method adjusts the zoom level of the map, applying a damping factor to the scale change to smooth out the zoom transition.
   * @param {number} scaleChange - The scale change ratio calculated from pinch gestures.
   */
  _applyZoomWithDamping(scaleChange) {
    const dampingFactor = 0.1; // Adjust this value to control sensitivity
    const adjustedScaleChange = 1 + (scaleChange - 1) * dampingFactor;
    const targetZoom = this.context.viewport.transform.zoom * adjustedScaleChange;
    const clampedZoom = Math.max(MIN_Z, Math.min(targetZoom, MAX_Z));
    this.context.systems.map.zoom(clampedZoom);
  }


  /**
   * Applies damping to the scale ratio based on the current zoom level.
   * This method calculates a damped scale ratio to ensure smoother zoom transitions, especially at higher zoom levels.
   * @param {number} scaleRatio - The original scale ratio from pinch gestures.
   * @param {number} currentZoom - The current zoom level of the viewport.
   * @return {number} The adjusted scale ratio after applying damping.
   */
  _applyDamping(scaleRatio, currentZoom) {
      const baseDamping = 0.1;
      const dampingFactor = currentZoom > 16 ? 0.2 : (currentZoom / 16) * baseDamping + 0.2;
      return 1 + (scaleRatio - 1) * dampingFactor;
  }


  /**
   * Smoothly adjusts the zoom level of the map using a moving average of recent zoom levels.
   * This method helps in achieving a smoother zoom effect by averaging several recent zoom calculations.
   * @param {number} newZoom - The newly calculated zoom level to be added to the moving average.
   */
  _smoothZoom(newZoom) {
      this.zoomLevels.push(newZoom);
      if (this.zoomLevels.length > 5) this.zoomLevels.shift();  // Keep the last 5 zoom levels
      const averageZoom = this.zoomLevels.reduce((a, b) => a + b, 0) / this.zoomLevels.length;
      this.context.systems.map.zoom(averageZoom);
  }


  /**
   * _getDistanceBetweenTouches
   * Calculates the distance between two touch points.
   * @param {Event} e - The event object containing touch points.
   * @return {number} The distance between the two touch points.
   */
  _getDistanceBetweenTouches() {
    const touchPoints = Object.values(this.activeTouches);
    if (touchPoints.length === 2) {
      // Use clientX and clientY for calculating distance to avoid issues with element transformations
      const [first, second] = touchPoints;
      const distance = Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
      return distance;
    }
    return 0;  // Ensure a number is always returned
  }


  /**
   * _wheel
   * Handler for wheel events.
   * @param  `e`  A DOM WheelEvent
   */
  _wheel(e) {
    const context = this.context;
    const map = context.systems.map;

    const [dx, dy] = [e._normalizedDeltaX, e._normalizedDeltaY];

    // We aren't going to set `this.gesture` here, because that is for tracking what
    // the user is doing through a pointerdown-pointermove-pointerup situation..

    if (e._gesture === 'zoom') {
      const viewport = context.viewport;
      const t = viewport.transform.props;
      const [x, y] = e._coord.map;

      // convert mouse coord to transform origin (was: d3 `transform.invert`)
      const x1 = (x - t.x) / t.k;
      const y1 = (y - t.y) / t.k;

      // rescale
      let k2 = t.k * Math.pow(2, -dy / 500);
      k2 = numClamp(k2, MIN_K, MAX_K);

      // transform origin back to local coord
      const x2 = x - x1 * k2;
      const y2 = y - y1 * k2;

      map.transform({ x: x2, y: y2, k: k2, r: t.r });

    } else {  // pan
      map.pan([-dx, -dy]);
    }
  }


  /**
   * _updatePinchState
   * Updates the pinch state by recalculating the scale change and applying damping if necessary.
   * This method is called during touch movements to dynamically adjust the map's scale.
   */
  _updatePinchState() {
    const touchPoints = Object.values(this.activeTouches);
    if (touchPoints.length === 2) {
      const [first, second] = touchPoints;
      const currentDistance = Math.hypot(first.x - second.x, first.y - second.y);
      if (this._initialPinchDistance !== null) {
        const scaleChange = currentDistance / this._initialPinchDistance;
        const currentZoom = this.context.viewport.transform.zoom;
        // Only apply changes if the scale change is significant
        if (Math.abs(scaleChange - 1) > 0.02) {  // Adjust this threshold as needed
          // Set damping factor based on current zoom level
          const dampingFactor = currentZoom > 12 ? 0.20 : 0.65;
          const adjustedScaleChange = 1 + (scaleChange - 1) * dampingFactor;
          const newZoom = currentZoom * adjustedScaleChange;
          const clampedZoom = Math.max(MIN_Z, Math.min(newZoom, MAX_Z));
          this.context.systems.map.zoom(clampedZoom);
        }
      }
      this._initialPinchDistance = currentDistance;
    } else {
      this._initialPinchDistance = null;
    }
  }
}
