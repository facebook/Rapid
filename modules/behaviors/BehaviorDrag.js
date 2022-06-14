import { dispatch as d3_dispatch } from 'd3-dispatch';
import { vecEqual, vecLength } from '@id-sdk/math';
import { osmNode } from '../osm';

import { AbstractBehavior } from './AbstractBehavior';
import { utilRebind } from '../util';

const NEAR_TOLERANCE = 1;
const FAR_TOLERANCE = 4;
const DEBUG = false;

/**
 * `BehaviorDrag` listens to pointer events and converts those into start/move/end drag events
 *
 * Properties available:
 *   `enabled`     `true` if the event handlers are enabled, `false` if not.
 *   `dragTarget`   After the drag has started, this contains the target (Pixi object)
 *   `lastDown`    `eventData` Object for the most recent down event
 *   `lastMove`    `eventData` Object for the most recent move event
 *
 * Events available:
 *   `start`    Fires on pointermove when dragging starts, receives the down `eventData` Object
 *   `move`     Fires on pointermove as dragging continues, receives the move `eventData` Object
 *   `end`      Fires on pointerup when dragging is done, receives the up `eventData` Object
 *   `cancel`   Fires on pointercancel -or- pointerup outside, receives the cancel `eventData` Object
 */
export class BehaviorDrag extends AbstractBehavior {

  /**
   * @constructor
   * @param  `context`  Global shared context for iD
   */
  constructor(context) {
    super(context);
    this.id = 'drag';

    this._dispatch = d3_dispatch('start', 'move', 'end', 'cancel');
    utilRebind(this, this._dispatch, 'on');

    this.dragTarget = null;   // the displayObject being dragged
    this.lastDown = null;
    this.lastMove = null;

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
    if (!this._context.pixi) return;

    if (DEBUG) {
      console.log('BehaviorDrag: enabling listeners');  // eslint-disable-line no-console
    }

    this._enabled = true;
    this.lastDown = null;
    this.lastMove = null;
    this.dragTarget = null;

    const interactionManager = this._context.pixi.renderer.plugins.interaction;
    interactionManager
      .on('pointerdown', this._pointerdown)
      .on('pointermove', this._pointermove)
      .on('pointerup', this._pointerup)
      .on('pointerupoutside', this._pointercancel)  // if up outide, just cancel
      .on('pointercancel', this._pointercancel);
  }


  /**
   * disable
   * Unbind event handlers
   */
  disable() {
    if (!this._enabled) return;
    if (!this._context.pixi) return;

    if (DEBUG) {
      console.log('BehaviorDrag: disabling listeners');  // eslint-disable-line no-console
    }

    this._enabled = false;
    this.lastDown = null;
    this.lastMove = null;
    this.dragTarget = null;

    const interactionManager = this._context.pixi.renderer.plugins.interaction;
    interactionManager
      .off('pointerdown', this._pointerdown)
      .off('pointermove', this._pointermove)
      .off('pointerup', this._pointerup)
      .off('pointerupoutside', this._pointercancel)  // if up outide, just cancel
      .off('pointercancel', this._pointercancel);
  }


  /**
   * _pointerdown
   * Handler for pointerdown events.  Note that you can get multiples of these
   * if the user taps with multiple fingers. We lock in the first one in `lastDown`.
   * @param  `e`  A Pixi InteractionEvent
   */
  _pointerdown(e) {
    if (this.lastDown) return;  // a pointer is already down

    // If pointer is not over the renderer, just discard
    // (e.g. sidebar, out of browser window, over a button, toolbar, modal)
    const context = this._context;
    const interactionManager = context.pixi.renderer.plugins.interaction;
    const pointerOverRenderer = interactionManager.mouseOverRenderer;
    if (!pointerOverRenderer) return;

    const down = this._getEventData(e);
    const draggable = (down.data instanceof osmNode);
    if (!draggable) return;

    this._context.map().zoomPanEnable(false);
    this.lastDown = down;
    this.lastMove = null;
    this.dragTarget = null;

// I _think_ this handles - where on the pin the user grabbed it
    // this._startOrigin = pointerLocGetter(e);
    // if (this._origin) {
    //     this._offset = this._origin.call(this._targetNode, this._downData.targetEntity);
    //     this._offset = [this._offset[0] - this._startOrigin[0], this._offset[1] - this._startOrigin[1]];
    // } else {
    //     this._offset = [0, 0];
    // }
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
    const context = this._context;
    const interactionManager = context.pixi.renderer.plugins.interaction;
    const pointerOverRenderer = interactionManager.mouseOverRenderer;
    if (!pointerOverRenderer) return;

    const down = this.lastDown;
    const move = this._getEventData(e);
    if (!down || down.id !== move.id) return;  // not down, or different pointer

    // We get a lot more move events than we need,
    // so discard ones where it hasn't actually moved much
    if (this.lastMove && vecEqual(move.coord, this.lastMove.coord, 0.9)) return;
    this.lastMove = move;

    // Dispatch either 'start' or 'move'
    // (Don't send a `move` event in the same time as `start` because
    // dragging a midpoint will convert the target to a node.)  todo: check?
    if (this.dragTarget) {   // already dragging
      if (DEBUG) {
        const name = this.dragTarget.name;
        console.log(`BehaviorDrag: dispatching 'move', dragTarget = ${name}`);  // eslint-disable-line no-console
      }
      this._dispatch.call('move', this, move);

    } else {  // start dragging?
      const dist = vecLength(down.coord, move.coord);
      const tolerance = (down.originalEvent.pointerType === 'pen') ? FAR_TOLERANCE : NEAR_TOLERANCE;
      if (dist >= tolerance) {
        // Save the target, *and set it to be non-interactive*.
        // This lets us catch events for what other objects it passes over as the user drags it.
        this.dragTarget = down.target;
        this.dragTarget.interactive = false;

        if (DEBUG) {
          const name = this.dragTarget.name;
          console.log(`BehaviorDrag: dispatching 'start', dragTarget = ${name}`);  // eslint-disable-line no-console
        }
        this._dispatch.call('start', this, down);
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
    if (!down || down.id !== up.id) return;  // not down, or different pointer

    this.lastDown = null;
    this.lastMove = null;
    this._context.map().zoomPanEnable(true);

    if (this.dragTarget) {
      const name = this.dragTarget.name;
      this.dragTarget.interactive = true;
      this.dragTarget = null;

      if (DEBUG) {
        console.log(`BehaviorDrag: dispatching 'end', dragTarget = ${name}`);  // eslint-disable-line no-console
      }
      this._dispatch.call('end', this, up);
    }
  }


  /**
   * _pointercancel
   * Handler for pointercancel events.
   * @param  `e`  A Pixi InteractionEvent
   */
  _pointercancel(e) {
    const cancel = this._getEventData(e);

    // const name = (cancel.target && cancel.target.name) || 'no target';
    // console.log(`pointercancel ${name}`);

    // Here we can throw away the down data to prepare for another `pointerdown`.
    // After pointercancel, there should be no more `pointermove` or `pointerup` events.
    this.lastDown = null;
    this.lastMove = null;
    this._context.map().zoomPanEnable(true);

    if (this.dragTarget) {
      const name = this.dragTarget.name;
      this.dragTarget.interactive = true;
      this.dragTarget = null;

      if (DEBUG) {
        console.log(`BehaviorDrag: dispatching 'cancel', dragTarget = ${name}`);  // eslint-disable-line no-console
      }
      this._dispatch.call('cancel', this, cancel);
    }
  }

}