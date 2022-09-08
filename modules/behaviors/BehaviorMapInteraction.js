import { vecEqual, vecLength } from '@id-sdk/math';

import { AbstractBehavior } from './AbstractBehavior';
import { osmNode } from '../osm';

const NEAR_TOLERANCE = 1;
const FAR_TOLERANCE = 4;
const DEBUG = false;

/**
 * `BehaviorMapInteraction` listens to pointer events and converts those into zoom/pan map interactions
 *
 * Properties available:
 *   `enabled`     `true` if the event handlers are enabled, `false` if not.
 *   `lastDown`    `eventData` Object for the most recent down event
 *   `lastMove`    `eventData` Object for the most recent move event
 *   `gesture`     String containing the current detected gesture ('pan')
 *
 * Events available:
 *   `start`    Fires on pointermove when dragging starts, receives the down `eventData` Object
 *   `move`     Fires on pointermove as dragging continues, receives the move `eventData` Object
 *   `end`      Fires on pointerup when dragging is done, receives the up `eventData` Object
 *   `cancel`   Fires on pointercancel -or- pointerup outside, receives the cancel `eventData` Object
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
    this.lastMove = null;
    this.gesture = null;

    // Make sure the event handlers have `this` bound correctly
    this._pointerdown = this._pointerdown.bind(this);
    this._pointermove = this._pointermove.bind(this);
    this._pointerup = this._pointerup.bind(this);
    this._pointercancel = this._pointercancel.bind(this);
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
    this.lastMove = null;
    this.gesture = null;

    const interactionManager = this.context.pixi.renderer.plugins.interaction;
    interactionManager.setCursorMode('grab');

    interactionManager
      .on('pointerdown', this._pointerdown)
      .on('pointermove', this._pointermove)
      .on('pointerup', this._pointerup)
      .on('pointerupoutside', this._pointercancel)  // if up outide, just cancel
      .on('pointercancel', this._pointercancel);

    if (interactionManager.supportsTouchEvents) {
      interactionManager
        .on('touchstart', this._pointerdown)
        .on('touchmove', this._pointermove)
        .on('touchend', this._pointerup)
        .on('touchendoutside', this._pointercancel)
        .on('touchcancel', this._pointercancel);
    }
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

    // Cancel the current gesture, if any.
    const eventData = this.lastMove;
    if (eventData && this.gesture) {
      eventData.target = null;
      eventData.feature = null;
      eventData.data = null;
      if (DEBUG) {
        console.log(`BehaviorMapInteraction: emitting 'cancel'`);  // eslint-disable-line no-console
      }
      this.emit('cancel', eventData);
    }

    this._enabled = false;
    this.lastDown = null;
    this.lastMove = null;
    this.gesture = null;

    const interactionManager = this.context.pixi.renderer.plugins.interaction;
    interactionManager.setCursorMode('grab');

    interactionManager
      .off('pointerdown', this._pointerdown)
      .off('pointermove', this._pointermove)
      .off('pointerup', this._pointerup)
      .off('pointerupoutside', this._pointercancel)  // if up outide, just cancel
      .off('pointercancel', this._pointercancel);

    if (interactionManager.supportsTouchEvents) {
      interactionManager
        .off('touchstart', this._pointerdown)
        .off('touchmove', this._pointermove)
        .off('touchend', this._pointerup)
        .off('touchendoutside', this._pointercancel)
        .off('touchcancel', this._pointercancel);
    }
  }


  /**
   * _pointerdown
   * Handler for pointerdown events.  Note that you can get multiples of these
   * if the user taps with multiple fingers. We lock in the first one in `lastDown`.
   * @param  `e`  A Pixi InteractionEvent
   */
  _pointerdown(e) {
    if (this.lastDown) return; // a pointer is already down

    // If pointer is not over the renderer, just discard
    // (e.g. sidebar, out of browser window, over a button, toolbar, modal)
    const context = this.context;
    const interactionManager = context.pixi.renderer.plugins.interaction;
    const pointerOverRenderer = interactionManager.mouseOverRenderer;

    // However, do not discard if the event was a touch event.
    if (!pointerOverRenderer && e.data.pointerType !== 'touch') return;

    const down = this._getEventData(e);
    const draggable = !(down.data instanceof osmNode);  // not a node
    if (!draggable) return;

    this.lastDown = down;
    this.lastMove = null;
    this.gesture = null;
    interactionManager.setCursorMode('grabbing');
  }


  /**
   * _pointermove
   * Handler for pointermove events.  Note that you can get multiples of these
   * if the user taps with multiple fingers. We lock in the first one in `lastDown`.
   * @param  `e`  A Pixi InteractionEvent
   */
  _pointermove(e) {
    // If pointer is not over the renderer, just discard
    // (e.g. sidebar, out of browser window, over a button, toolbar, modal)
    const context = this.context;

    const interactionManager = context.pixi.renderer.plugins.interaction;
    const pointerOverRenderer = interactionManager.mouseOverRenderer;
    if (!pointerOverRenderer && e.data.pointerType !== 'touch') return;

    const down = this.lastDown;
    const move = this._getEventData(e);
    if (!down || down.id !== move.id) return;  // not down, or different pointer

    // We get a lot more move events than we need,
    // so discard ones where it hasn't actually moved much
//    if (this.lastMove && vecEqual(move.coord, this.lastMove.coord, 0.9)) return;
    this.lastMove = move;

    // Dispatch either 'start' or 'move'
    // (Don't send a `move` event in the same time as `start` because
    // dragging a midpoint will convert the target to a node.)  todo: check?
    if (this.gesture) {   // already dragging
      if (DEBUG) {
        console.log(`BehaviorMapInteraction: emitting 'move'`);  // eslint-disable-line no-console
      }
      this.emit('move', move);

    } else {  // start dragging?
      const dist = vecLength(down.coord, move.coord);
      const tolerance = (down.originalEvent.pointerType === 'pen') ? FAR_TOLERANCE : NEAR_TOLERANCE;
      if (dist >= tolerance) {
        this.gesture = 'pan';
        if (DEBUG) {
          console.log(`BehaviorMapInteraction: emitting 'start'`);  // eslint-disable-line no-console
        }
        this.emit('start', down);
      }
    }
  }


  /**
   * _pointerup
   * Handler for pointerup events.  Note that you can get multiples of these
   * if the user taps with multiple fingers. We lock in the first one in `lastDown`.
   * @param  `e`  A Pixi InteractionEvent
   */
  _pointerup(e) {
    const down = this.lastDown;
    const up = this._getEventData(e);
    if (!down || down.id !== up.id) return; // not down, or different pointer

    this.lastDown = null;
    this.lastMove = null;

    if (this.gesture) {
      const interactionManager = this.context.pixi.renderer.plugins.interaction;
      interactionManager.setCursorMode('grab');
      this.gesture = null;

      if (DEBUG) {
        console.log(`BehaviorMapInteraction: emitting 'end'`); // eslint-disable-line no-console
      }
      this.emit('end', up);
    }
  }


  /**
   * _pointercancel
   * Handler for pointercancel events.
   * @param  `e`  A Pixi InteractionEvent
   */
  _pointercancel(e) {
    const cancel = this._getEventData(e);

    // Here we can throw away the down data to prepare for another `pointerdown`.
    // After pointercancel, there should be no more `pointermove` or `pointerup` events.
    this.lastDown = null;
    this.lastMove = null;

    if (this.gesture) {
      const interactionManager = this.context.pixi.renderer.plugins.interaction;
      interactionManager.setCursorMode('grab');
      this.gesture = null;

      if (DEBUG) {
        console.log(`BehaviorMapInteraction: emitting 'cancel'`);  // eslint-disable-line no-console
      }
      this.emit('cancel', cancel);
    }
  }

}
