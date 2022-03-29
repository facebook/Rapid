import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';
import { Extent, geomPointInPolygon, vecSubtract } from '@id-sdk/math';
import { vecLength } from '@id-sdk/math';
import { osmNode } from '../osm';

import { AbstractBehavior } from './AbstractBehavior';
import { actionCopyEntities } from '../actions/copy_entities';
import { actionMove } from '../actions/move';
import { modeMove } from '../modes/move';
import { uiCmd } from '../ui/cmd';
import { utilRebind } from '../util';


    const TOLERANCEPX = 1; // keep this low to facilitate pixel-perfect micromapping
    const PENTOLERANCEPX = 4; // styluses can be touchy so require greater movement - #1981


/*
    `BehaviorDrag` is like `d3_behavior.drag`, with the following differences:

    * The `origin` function is expected to return an [x, y] tuple rather than an
      {x, y} object.
    * The events are `start`, `move`, and `end`.
      (https://github.com/mbostock/d3/issues/563)
    * The `start` event is not dispatched until the first cursor movement occurs.
      (https://github.com/mbostock/d3/pull/368)
    * The `move` event has a `point` and `delta` [x, y] tuple properties rather
      than `x`, `y`, `dx`, and `dy` properties.
    * The `end` event is not dispatched if no movement occurs.
    * An `off` function is available that unbinds the drag's internal event handlers.
 */
export class BehaviorDrag extends AbstractBehavior {

  /**
   * @constructor
   * @param  `context`  Global shared context for iD
   */
  constructor(context) {
    super(context);

    this._dispatch = d3_dispatch('start', 'move', 'end');
    utilRebind(this, this._dispatch, 'on');

    this._origin = null;
    this._selector = '';
    this._targetNode = null;
    this._surface= null;
    this._pointerId = null;
    this._offset = [0, 0];
    this._started = false;
    this._startOrigin = null;
    this.pointerdownFn = (e) => this._pointerdown(e);
    this.pointermoveFn = (e) => this._pointermove(e);
    this.pointerupFn = (e) => this._pointerup(e);
  }


  /**
   * enable
   * Bind keypress event handler
   */
  enable() {
    this._downData = null;


    if (!this._context.pixi) return;
    const stage = this._context.pixi.stage;

    stage
      .on('pointerdown', this.pointerdownFn)
      .on('pointermove', this.pointermoveFn)
      .on('pointerup', this.pointerupFn);


    this._enabled = true;
  }


  /**
   * disable
   * Unbind keypress event handler
   */
  disable() {
   if (!this._enabled) return;

    if (!this._context.pixi) return;
    const stage = this._context.pixi.stage;

    stage
      .off('pointerdown', this.pointerdownFn)
      .off('pointermove', this.pointermoveFn)
      .off('pointerup', this.pointerupFn);

    this._enabled = false;
  }


  /**
   * _getTarget
   * returns the target displayobject and data to use for this event
   */
  _getTarget(e) {
    if (!e.target) return null;

    let obj = e.target;
    let data = obj && obj.__data__;

    // Data is here, use this target
    if (data) {
      return { obj: obj, data: data };
    }

    // No data in target, look in parent
    obj = e.target.parent;
    data = obj && obj.__data__;
    if (data) {
      return { obj: obj, data: data };
    }

    // No data there either, just use the original target unless it was the stage.
    // If it was the stage, we didn't actually click on anything draggable.
    return { obj: e.target.name === 'stage' ? null : e.target, data: null };
  }

  /**
   * _pointerdown
   * Handler for pointerdown events.
   *
   */
  _pointerdown(e) {
    const target = this._getTarget(e);
    const dObj = target.obj;

    if (!(target && target.obj && target.obj.__data__ instanceof osmNode)) return; //clicked on the stage, an area, or a way nothing to drag
    if (e.data.originalEvent.button === 2) return; //Right-click should not cause a drag event.
    if (this._downData) return; // Pointer already down

    const pointerId = e.pointerId || 'mouse';

    const pointerLocGetter = (e) =>
      [e.data.originalEvent.offsetX, e.data.originalEvent.offsetY];

    this._downData = {
      id: pointerId,
      pointerLocGetter: pointerLocGetter,
      downTime: +new Date(),
      downLoc: pointerLocGetter(e),
      targetEntity: target
    };

    this._context.map().handleDragStart();


    this._startOrigin = pointerLocGetter(e);
    this._started = false;

    // var selectEnable = d3_event_userSelectSuppress();

    if (this._origin) {
        this._offset = this._origin.call(this._targetNode, this._downData.targetEntity);
        this._offset = [this._offset[0] - this._startOrigin[0], this._offset[1] - this._startOrigin[1]];
    } else {
        this._offset = [0, 0];
    }

    //d3_event.stopPropagation();
  }

  /**
   * _pointermove
   * Handler for pointermove events.
   *
   */
  _pointermove(e) {
    const pointerId = e.pointerId || 'mouse';
    if (!this._downData || this._downData.id !== pointerId) return;  // not down, or different pointer

      var p = this._downData.pointerLocGetter(e);

      //It's not a drag gesture if we haven't clicked, and if the thing we clicked on is just the background stage.
    if (this._downData && this._downData.targetEntity) {
      if (!this._started) {
        var dist = vecLength(this._startOrigin,  p);
        var tolerance = e.pointerType === 'pen' ? PENTOLERANCEPX : TOLERANCEPX;
        // don't start until the drag has actually moved somewhat
        if (dist < tolerance) return;

        this._started = true;
        const mode = this._context.mode();

        this._dispatch.call('start', this, e, this._downData.targetEntity.data);

      // Don't send a `move` event in the same cycle as `start` since dragging
      // a midpoint will convert the target to a node.
      } else {
        this._startOrigin = p;
        // e.stopPropagation();
        // e.preventDefault();

        var dx = p[0] - this._startOrigin[0];
        var dy = p[1] - this._startOrigin[1];
        this._dispatch.call('move', this, e, this._downData.targetEntity.data, [p[0] + this._offset[0],  p[1] + this._offset[1]], [dx, dy]);
      }
     }

  }


  /**
   * _pointerup
   * Handler for pointerup events, which for 'drag' behavior is tantamount to an 'end' state- on pointer up, we're done dragging!
   *
   */
  _pointerup(e) {
    const pointerId = e.pointerId || 'mouse';
    if (!this._downData || this._downData.id !== pointerId) return;  // not down, or different pointer

    if (this._started) {
      this._dispatch.call('end', this, e, this._downData.targetEntity.data);
    }

    this._context.map().handleDragEnd();
    this._started = false;
    this._downData = null;
  }

}
