import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';
import { vecLength } from '@id-sdk/math';

import { AbstractBehavior } from './AbstractBehavior';
import { locationManager } from '../core/locations';
import { osmEntity } from '../osm/entity';
import { geoChooseEdge } from '../geo';
import { utilKeybinding, utilRebind } from '../util';

const NEAR_TOLERANCE = 4;
const FAR_TOLERANCE = 12;


/**
 * `BehaviorDraw` listens to pointer and click events and
 * translates those into drawing events
 */
export class BehaviorDraw extends AbstractBehavior {

  /**
   * @constructor
   * @param  `context`  Global shared context for iD
   */
  constructor(context) {
    super(context);

    this._dispatch = d3_dispatch('move', 'down', 'downcancel', 'click', 'clickWay', 'clickNode', 'undo', 'cancel', 'finish');
    utilRebind(this, this._dispatch, 'on');

    this._spaceClickDisabled = false;
    this._lastSpaceCoord = null;
    this._downData = null;

    this._keybinding = utilKeybinding('drawbehavior');

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
    this._downData = null;

    if (!this._context.pixi) return;
    const stage = this._context.pixi.stage;

    this._keybinding
      .on('⌫', (e) => this._backspace(e))
      .on('⌦', (e) => this._delete(e))
      .on('⎋', (e) => this._return(e))
      .on('↩', (e) => this._return(e))
      .on('space', (e) => this._spacebar(e))
      .on('⌥space', (e) => this._spacebar(e));

    stage
      .on('pointerdown', this._pointerdown)
      .on('pointermove', this._pointermove)
      .on('pointerup', this._pointerup)
      .on('pointerupoutside', this._pointercancel)  // if up outide, just cancel
      .on('pointercancel', this._pointercancel);

    d3_select(document)
      .call(this._keybinding);

    this._enabled = true;
  }


  /**
   * disable
   * Unbind event handlers
   */
  disable() {
    if (!this._enabled) return;

    if (!this._context.pixi) return;
    const stage = this._context.pixi.stage;

    stage
      .off('pointerdown', this._pointerdown)
      .off('pointermove', this._pointermove)
      .off('pointerup', this._pointerup)
      .off('pointerupoutside', this._pointercancel)  // if up outide, just cancel
      .off('pointercancel', this._pointercancel);

    d3_select(document)
      .call(this._keybinding.unbind);

    this._enabled = false;
  }



  /**
   * _pointerdown
   * Handler for pointerdown events.  Note that you can get multiples of these
   * if the user taps with multiple fingers. We lock in the first one in `_downData`.
   * @param  `e`  A Pixi InteractionEvent
   */
  _pointerdown(e) {
    if (this._downData) return;  // a pointer is already down

    const down = this._getEventData(e);
    // const name = (down.target && down.target.name) || 'no target';
    // console.log(`pointerdown ${name}`);

    this._downData = down;
    this._dispatch.call('down', this, e, down);
  }


  /**
   * _pointerup
   * Handler for pointerup events.  Note that you can get multiples of these
   * if the user taps with multiple fingers. We lock in the first one in `_downData`.
   * @param  `e`  A Pixi InteractionEvent
   */
  _pointerup(e) {
    const up = this._getEventData(e);
    const down = this._downData;
    // const name = (up.target && up.target.name) || 'no target';
    // console.log(`pointerup ${name}`);

    if (!down || down.id !== up.id) return;  // not down, or different pointer

    this._downData = null;

    if (down.isCancelled) return;   // was cancelled already by moving too much

    const context = this._context;
    const dist = vecLength(down.coord, up.coord);

    if (dist < NEAR_TOLERANCE || (dist < FAR_TOLERANCE && (up.time - down.time) < 500)) {
      // Prevent a quick second click
      context.map().dblclickZoomEnable(false);
      d3_select(window).on('click.draw-block', (e) => e.stopPropagation(), true);

      window.setTimeout(() => {
        context.map().dblclickZoomEnable(true);
        d3_select(window).on('click.draw-block', null);
      }, 500);

      // trigger a click
      this._click(up);
    }
  }


  /**
   * _pointermove
   * Handler for pointermove events.  Note that you can get multiples of these
   * if the user taps with multiple fingers. We lock in the first one in `_downData`.
   * @param  `e`  A Pixi InteractionEvent
   */
  _pointermove(e) {
    const move = this._getEventData(e);
    const down = this._downData;
    // const name = (move.target && move.target.name) || 'no target';
    // console.log(`pointermove ${name}`);

    if (!down || down.id !== move.id) return;  // not down, or different pointer

    // If the pointer moves too much, we consider it as a drag, not a click, and set `isCancelled=true`
    if (!down.isCancelled) {
      const dist = vecLength(down.coord, move.coord);
      if (dist >= NEAR_TOLERANCE) {
        down.isCancelled = true;
        this._dispatch.call('downcancel', this);
      }
    } else {
      this._dispatch.call('move', this, move);
    }
  }


  /**
   * _pointercancel
   * Handler for pointercancel events.  Note that you can get multiples of these
   * if the user taps with multiple fingers. We lock in the first one in `_downData`.
   * @param  `e`  A Pixi InteractionEvent
   */
  _pointercancel(e) {
    const cancel = this._getEventData(e);
    const down = this._downData;
    // const name = (cancel.target && cancel.target.name) || 'no target';
    // console.log(`pointercancel ${name}`);

    if (down && !down.isCancelled) {
      this._dispatch.call('downcancel', this);
    }

    // Here we can throw away the down data to prepare for another `pointerdown`.
    // After pointercancel, there should be no more `pointermove` or `pointerup` events.
    this._downData = null;
  }


  /**
   * _spacebar
   * Handler for `keydown` events of the spacebar
   * We use these to simulate clicks
   * @param  `e`  A d3 keydown event
   */
  _spacebar(e) {
    e.preventDefault();
    e.stopPropagation();

    // For spacebar clicks we will instead use the last pointer event
    // Get these from Pixi's interaction manager
    const interactionManager = this._context.pixi.renderer.plugins.interaction;
    const pointerOverRenderer = interactionManager.mouseOverRenderer;
    const pointerEvent = interactionManager.mouse;
    if (!pointerEvent || !pointerOverRenderer) return;

    const pointer = this._getEventData({ data: pointerEvent });

    // User must move pointer or lift spacebar to allow another spacebar click
    if (this._spaceClickDisabled && this._lastSpaceCoord) {
      const dist = vecLength(this._lastSpaceCoord, pointer.coord);
      if (dist > FAR_TOLERANCE) {
        this._spaceClickDisabled = false;
      }
    }

    if (!this._spaceClickDisabled) {
      this._spaceClickDisabled = true;
      this._lastSpaceCoord = pointer.coord;

      d3_select(window).on('keyup.space-block', (e) => {
        if (e.code !== 'Space') return;  // only spacebar
        e.preventDefault();
        e.stopPropagation();
        this._spaceClickDisabled = false;
        d3_select(window).on('keyup.space-block', null);
      });

      // simulate a click
      this._click(pointer);
    }
  }


  /**
   * _click
   * Once we have determined that the user has clicked, this is where we handle that click.
   * Note this is not a true `click` event handler - we get into here from `_pointerup` or `_spacebar`.
   *
   * related code
   * - `mode/drag_node.js`     `doMove()`
   * - `behavior/draw.js`      `click()`
   * - `behavior/draw_way.js`  `move()`
   *
   * @param  `eventData`  event data
   */
  _click(eventData) {
    const context = this._context;
    const projection = context.projection;
    const coord = eventData.coord;
    const loc = projection.invert(coord);

    if (locationManager.blocksAt(loc).length) return;  // editing is blocked here

    const datum = eventData.data;
    const entity = datum instanceof osmEntity && datum;
    // const name = (eventData.target && eventData.target.name) || 'no target';
    // console.log(`click ${name}`);

    // Snap to a node
    if (entity && entity.type === 'node') {
      this._dispatch.call('clickNode', this, entity.loc, entity);
      return;
    }

    // Snap to a way
    if (entity && entity.type === 'way') {
      const graph = context.graph();
      const choice = geoChooseEdge(graph.childNodes(entity), coord, projection, context.activeID());
      if (choice) {
        const edge = [entity.nodes[choice.index - 1], entity.nodes[choice.index]];
        this._dispatch.call('clickWay', this, choice.loc, edge);
        return;
      }
    }

    // Just a click on the map
    this._dispatch.call('click', this, loc);
  }


  /**
   * _backspace
   * @param  `e`  A d3 keydown event
   */
  _backspace(e) {
    e.preventDefault();
    this._dispatch.call('undo');
  }


  /**
   * _delete
   * @param  `e`  A d3 keydown event
   */
  _delete(e) {
    e.preventDefault();
    this._dispatch.call('cancel');
  }


  /**
   * _return
   * @param  `e`  A d3 keydown event
   */
  _return(e) {
    e.preventDefault();
    this._dispatch.call('finish');
  }

}
