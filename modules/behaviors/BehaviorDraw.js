import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';
import { vecEqual, vecLength } from '@id-sdk/math';

import { AbstractBehavior } from './AbstractBehavior';
import { locationManager } from '../core/locations';
import { osmEntity } from '../osm/entity';
import { geoChooseEdge } from '../geo';
import { utilKeybinding, utilRebind } from '../util';

const NEAR_TOLERANCE = 4;
const FAR_TOLERANCE = 12;
const DEBUG = false;


/**
 * `BehaviorDraw` listens to pointer and click events and translates those into drawing events
 *
 * Properties available:
 *   `enabled`    `true` if the event handlers are enabled, `false` if not.
 *   `lastDown`   `eventData` Object for the most recent down event
 *   `lastMove`   `eventData` Object for the most recent move event
 *   `lastSpace`  `eventData` Object for the most recent move event used to trigger a spacebar click
 *
 * Events available:
 *   `down`        Fires on initial pointerdown, receives down `eventData` Object
 *   `move`        Fires on any pointermove, receives move `eventData` Object
 *   `downcancel`  Fires on pointercancel -or- if the pointer has moved too much for it to be a click, receives `eventData`
 *   `click`       Fires on click on nothing, receives `loc` ([lon,lat])
 *   `clickWay`    Fires on click on a Way, receives `loc` ([lon,lat]) and `edge` Object
 *   `clickNode`   Fires on click on a Node, receives `loc` ([lon,lat]) and `entity` (the node)
 *   `undo`        Fires if user presses backspace
 *   `cancel`      Fires if user presses delete
 *   `finish`      Fires if user presses escape or return
 */
export class BehaviorDraw extends AbstractBehavior {

  /**
   * @constructor
   * @param  `context`  Global shared context for iD
   */
  constructor(context) {
    super(context);
    this.id = 'draw';

    this._dispatch = d3_dispatch('down', 'move', 'downcancel', 'click', 'clickWay', 'clickNode', 'undo', 'cancel', 'finish');
    utilRebind(this, this._dispatch, 'on');

    this._spaceClickDisabled = false;
    this.lastDown = null;
    this.lastMove = null;
    this.lastSpace = null;

    this._keybinding = utilKeybinding('drawbehavior');

    // Make sure the event handlers have `this` bound correctly
    this._pointerdown = this._pointerdown.bind(this);
    this._pointermove = this._pointermove.bind(this);
    this._pointerup = this._pointerup.bind(this);
    this._pointercancel = this._pointercancel.bind(this);

    this._backspace = this._backspace.bind(this);
    this._delete = this._delete.bind(this);
    this._return = this._return.bind(this);
    this._spacebar = this._spacebar.bind(this);
  }


  /**
   * enable
   * Bind event handlers
   */
  enable() {
    if (this._enabled) return;
    if (!this._context.pixi) return;

    if (DEBUG) {
      console.log('BehaviorDraw: enabling listeners');  // eslint-disable-line no-console
    }

    this._enabled = true;
    this.lastDown = null;
    this.lastMove = null;
    this.lastSpace = null;

    this._keybinding
      .on('⌫', this._backspace)
      .on('⌦', this._delete)
      .on('⎋', this._return)
      .on('↩', this._return)
      .on('space', this._spacebar)
      .on('⌥space', this._spacebar);

    const interactionManager = this._context.pixi.renderer.plugins.interaction;
    interactionManager
      .on('pointerdown', this._pointerdown)
      .on('pointermove', this._pointermove)
      .on('pointerup', this._pointerup)
      .on('pointerupoutside', this._pointercancel)  // if up outide, just cancel
      .on('pointercancel', this._pointercancel);

    d3_select(document)
      .call(this._keybinding);
  }


  /**
   * disable
   * Unbind event handlers
   */
  disable() {
    if (!this._enabled) return;
    if (!this._context.pixi) return;

    if (DEBUG) {
      console.log('BehaviorDraw: disabling listeners');  // eslint-disable-line no-console
    }

    this._enabled = false;
    this.lastDown = null;
    this.lastMove = null;
    this.lastSpace = null;

    const interactionManager = this._context.pixi.renderer.plugins.interaction;
    interactionManager
      .off('pointerdown', this._pointerdown)
      .off('pointermove', this._pointermove)
      .off('pointerup', this._pointerup)
      .off('pointerupoutside', this._pointercancel)  // if up outide, just cancel
      .off('pointercancel', this._pointercancel);

    d3_select(document)
      .call(this._keybinding.unbind);
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
    this.lastDown = down;

    if (DEBUG) {
      console.log(`BehaviorDraw: dispatching 'down'`);  // eslint-disable-line no-console
    }
    this._dispatch.call('down', this, down);
  }


  /**
   * _pointermove
   * Handler for pointermove events.
   * @param  `e`  A Pixi InteractionEvent
   */
  _pointermove(e) {
    // If pointer is not over the renderer, just discard
    // (e.g. sidebar, out of browser window, over a button, toolbar, modal)
    const context = this._context;
    const interactionManager = context.pixi.renderer.plugins.interaction;
    const pointerOverRenderer = interactionManager.mouseOverRenderer;
    if (!pointerOverRenderer) return;

    const move = this._getEventData(e);
    if (!move) return;

    // We get a lot more move events than we need,
    // so discard ones where it hasn't actually moved much
    if (this.lastMove && vecEqual(move.coord, this.lastMove.coord, 0.9)) return;
    this.lastMove = move;

    // If the pointer moves too much, we consider it as a drag, not a click, and set `isCancelled=true`
    const down = this._getEventData(e);
    if (down && down.id === move.id && !down.isCancelled) {
      const dist = vecLength(down.coord, move.coord);
      if (dist >= NEAR_TOLERANCE) {
        down.isCancelled = true;

        if (DEBUG) {
          console.log(`BehaviorDraw: dispatching 'downcancel'`);  // eslint-disable-line no-console
        }
        this._dispatch.call('downcancel', this, move);
      }
    }

    if (DEBUG) {
      console.log(`BehaviorDraw: dispatching 'move'`);  // eslint-disable-line no-console
    }
    this._dispatch.call('move', this, move);
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

    // const name = (up.target && up.target.name) || 'no target';
    // console.log(`pointerup ${name}`);

    this.lastDown = null;

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
   * _pointercancel
   * Handler for pointercancel events.
   * @param  `e`  A Pixi InteractionEvent
   */
  _pointercancel(e) {
    const cancel = this._getEventData(e);
    const down = this.lastDown;
    // const name = (cancel.target && cancel.target.name) || 'no target';
    // console.log(`pointercancel ${name}`);

    if (down && !down.isCancelled) {
      if (DEBUG) {
        console.log(`BehaviorDraw: dispatching 'downcancel'`);  // eslint-disable-line no-console
      }
      this._dispatch.call('downcancel', this, cancel);
    }

    // Here we can throw away the down data to prepare for another `pointerdown`.
    // After pointercancel, there should be no more `pointermove` or `pointerup` events.
    this.lastDown = null;
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

    // Becase spacebar events will repeat if you keep it held down,
    // user must move pointer or lift spacebar to allow another spacebar click
    if (this._spaceClickDisabled && this.lastSpace) {
      const dist = vecLength(pointer.coord, this.lastSpace.coord);
      if (dist > FAR_TOLERANCE) {     // pointer moved far enough
        this._spaceClickDisabled = false;
      }
    }

    if (!this._spaceClickDisabled) {
      this._spaceClickDisabled = true;
      this.lastSpace = pointer;

      d3_select(window).on('keyup.space-block', (e) => {   // user lifted spacebar up
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
   * - `behaviors/draw.js`      `click()`
   * - `behaviors/draw_way.js`  `move()`
   *
   * @param  `eventData`  Object for the event that triggered the click
   */
  _click(eventData) {
    const context = this._context;
    const projection = context.projection;
    const coord = eventData.coord;
    const loc = projection.invert(coord);

    if (locationManager.blocksAt(loc).length) return;  // editing is blocked here

    const datum = eventData.data;
    const entity = (datum instanceof osmEntity) && datum;

    // Snap to a node
    if (entity && entity.type === 'node') {
      if (DEBUG) {
        console.log(`BehaviorDraw: dispatching 'clickNode', target = ${entity.id}`);  // eslint-disable-line no-console
      }
      this._dispatch.call('clickNode', this, entity.loc, entity);
      return;
    }

    // Snap to a way
    if (entity && entity.type === 'way') {
      const graph = context.graph();
      const activeIDs = context.activeIDs();
      const activeID = activeIDs.length ? activeIDs[0] : undefined;  // get the first one, if any

      const choice = geoChooseEdge(graph.childNodes(entity), coord, projection, activeID);
      if (choice) {
        const edge = [entity.nodes[choice.index - 1], entity.nodes[choice.index]];
        if (DEBUG) {
          console.log(`BehaviorDraw: dispatching 'clickWay', target = ${entity.id}`);  // eslint-disable-line no-console
        }
        this._dispatch.call('clickWay', this, choice.loc, edge);
        return;
      }
    }

    // Just a click on the map
    if (DEBUG) {
      console.log(`BehaviorDraw: dispatching 'click'`);  // eslint-disable-line no-console
    }
    this._dispatch.call('click', this, loc);
  }


  /**
   * _backspace
   * @param  `e`  A d3 keydown event
   */
  _backspace(e) {
    e.preventDefault();
    if (DEBUG) {
      console.log(`BehaviorDraw: dispatching 'undo'`);  // eslint-disable-line no-console
    }
    this._dispatch.call('undo');
  }


  /**
   * _delete
   * @param  `e`  A d3 keydown event
   */
  _delete(e) {
    e.preventDefault();
    if (DEBUG) {
      console.log(`BehaviorDraw: dispatching 'cancel'`);  // eslint-disable-line no-console
    }
    this._dispatch.call('cancel');
  }


  /**
   * _return
   * @param  `e`  A d3 keydown event
   */
  _return(e) {
    e.preventDefault();
    if (DEBUG) {
      console.log(`BehaviorDraw: dispatching 'finish'`);  // eslint-disable-line no-console
    }
    this._dispatch.call('finish');
  }

}
