import { dispatch as d3_dispatch } from 'd3-dispatch';
import { vecEqual, vecLength } from '@id-sdk/math';
import { osmNode } from '../osm';

import { AbstractBehavior } from './AbstractBehavior';
import { utilRebind } from '../util';

const TOLERANCEPX = 1; // keep this low to facilitate pixel-perfect micromapping
const PENTOLERANCEPX = 4; // styluses can be touchy so require greater movement - #1981


/**
 * `BehaviorDrag` listens to pointer and click events and
 * translates those into start/move/end drag events
 */
export class BehaviorDrag extends AbstractBehavior {
  /**
   * @constructor
   * @param  `context`  Global shared context for iD
   */
  constructor(context) {
    super(context);

    this._dispatch = d3_dispatch('start', 'move', 'end', 'cancel');
    utilRebind(this, this._dispatch, 'on');

    this._lastdown = null;
    this._lastmove = null;
    this._isDragging = false;

    // Make sure the event handlers have `this` bound correctly
    this._pointerdown = this._pointerdown.bind(this);
    this._pointermove = this._pointermove.bind(this);
    this._pointerup = this._pointerup.bind(this);
    this._pointercancel = this._pointercancel.bind(this);

    // this._origin = null;
    // this._selector = '';
    // this._targetNode = null;
    // this._surface= null;
    // this._pointerId = null;
    // this._offset = [0, 0];
    // this._started = false;
    // this._startOrigin = null;
  }


  /**
   * enable
   * Bind event handlers
   */
  enable() {
    if (this._enabled) return;
    if (!this._context.pixi) return;

    this._enabled = true;
    this._lastdown = null;
    this._lastmove = null;
    this._isDragging = false;

    const stage = this._context.pixi.stage;
    stage
      .on('pointerdown', this._pointerdown)
      .on('pointermove', this._pointermove)
      .on('pointerup', this._pointerup)
      .on('pointerupoutside', this._pointercancel)  // if up outide, just cancel
      .on('pointercancel', this._pointercancel);
  }


  /**
   * disable
   * Unbind keypress event handler
   */
  disable() {
    if (!this._enabled) return;
    if (!this._context.pixi) return;

    this._enabled = false;
    this._lastdown = null;
    this._lastmove = null;
    this._isDragging = false;

    const stage = this._context.pixi.stage;
    stage
      .off('pointerdown', this._pointerdown)
      .off('pointermove', this._pointermove)
      .off('pointerup', this._pointerup)
      .off('pointerupoutside', this._pointercancel)  // if up outide, just cancel
      .off('pointercancel', this._pointercancel);
  }


  /**
   * _pointerdown
   * Handler for pointerdown events.  Note that you can get multiples of these
   * if the user taps with multiple fingers. We lock in the first one in `_lastdown`.
   * @param  `e`  A Pixi InteractionEvent
   */
  _pointerdown(e) {
    if (this._lastdown) return;  // a pointer is already down

    const down = this._getEventData(e);
    // const name = (down.target && down.target.name) || 'no target';
    // console.log(`pointerdown ${name}`);

    if (!down.data) return;  // didn't click anything

    this._context.map().handleDragStart();
    this._lastdown = down;
    this._lastmove = null;
    this._isDragging = false;
    // this._dispatch.call('down', this, e, down);


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
   * if the user taps with multiple fingers. We lock in the first one in `_lastdown`.
   * @param  `e`  A Pixi InteractionEvent
   */
  _pointermove(e) {
    // If pointer is not over the renderer, just discard
    const context = this._context;
    const interactionManager = context.pixi.renderer.plugins.interaction;
    const pointerOverRenderer = interactionManager.mouseOverRenderer;
    if (!pointerOverRenderer) return;

    const move = this._getEventData(e);

    // We get a lot more move events than we need,
    // so discard ones where it hasn't actually moved much
    if (this._lastmove && vecEqual(move.coord, this._lastmove.coord, 0.9)) return;
    this._lastmove = move;

    const down = this._lastdown;
    if (!down || down.id !== move.id) return;  // not down, or different pointer

    // const name = (move.target && move.target.name) || 'no target';
    // console.log(`pointermove ${name}`);

    // Don't start the drag until the pointer has actually moved a bit
    if (!this._isDragging) {
      const dist = vecLength(down.coord, move.coord);
      const tolerance = e.pointerType === 'pen' ? PENTOLERANCEPX : TOLERANCEPX;
      if (dist >= tolerance) {
        this._isDragging = true;
        this._dispatch.call('start', this, down);
      }

    } else {
      this._dispatch.call('move', this, move);
    }
  }


//    // It's not a drag gesture if we haven't clicked, and if the thing we clicked on is just the background stage.
//    if (this._downData && this._downData.targetEntity) {
//      if (!this._started) {
//        var dist = vecLength(this._startOrigin,  p);
//        var tolerance = e.pointerType === 'pen' ? PENTOLERANCEPX : TOLERANCEPX;
//        // don't start until the drag has actually moved somewhat
//        if (dist < tolerance) return;
//
//        this._started = true;
//        const mode = this._context.mode();
//
//        this._dispatch.call('start', this, e, this._downData.targetEntity.data);
//
//      // Don't send a `move` event in the same cycle as `start` since dragging
//      // a midpoint will convert the target to a node.
//      } else {
//        this._startOrigin = p;
//        // e.stopPropagation();
//        // e.preventDefault();
//
//        var dx = p[0] - this._startOrigin[0];
//        var dy = p[1] - this._startOrigin[1];
//        this._dispatch.call('move', this, e, this._downData.targetEntity.data, [p[0] + this._offset[0],  p[1] + this._offset[1]], [dx, dy]);
//      }
//     }
//  }



  /**
   * _pointerup
   * Handler for pointerup events.  Note that you can get multiples of these
   * if the user taps with multiple fingers. We lock in the first one in `_lastdown`.
   * @param  `e`  A Pixi InteractionEvent
   */
  _pointerup(e) {
    const up = this._getEventData(e);
    const down = this._lastdown;
    // const name = (up.target && up.target.name) || 'no target';
    // console.log(`pointerup ${name}`);

    if (!down || down.id !== up.id) return;  // not down, or different pointer

    this._lastdown = null;
    this._context.map().handleDragEnd();

    if (this._isDragging) {
      this._dispatch.call('end', this, up);
    }
  }



  /**
   * _pointercancel
   * Handler for pointercancel events.  Note that you can get multiples of these
   * if the user taps with multiple fingers. We lock in the first one in `_lastdown`.
   * @param  `e`  A Pixi InteractionEvent
   */
  _pointercancel(e) {
    const cancel = this._getEventData(e);
    const down = this._lastdown;
    // const name = (cancel.target && cancel.target.name) || 'no target';
    // console.log(`pointercancel ${name}`);

    if (this._isDragging) {
      this._dispatch.call('cancel', this, cancel);
    }

    // Here we can throw away the down data to prepare for another `pointerdown`.
    // After pointercancel, there should be no more `pointermove` or `pointerup` events.
    this._lastdown = null;
    this._isDragging = false;
  }

}
