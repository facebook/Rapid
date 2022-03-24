import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';
import { vecLength } from '@id-sdk/math';

import { AbstractBehavior } from './AbstractBehavior';
import { presetManager } from '../presets';
import { geoChooseEdge } from '../geo';
import { utilFastMouse, utilKeybinding, utilRebind } from '../util';


const CLOSETOLERANCE = 4;
const TOLERANCE = 12;


/**
 * `BehaviorDraw` listens to pointer and click events and
 * translates those into drawing events
 */
export class BehaviorDraw extends AbstractBehavior {

  /**
   * @constructor
   * @param  `context`    Global shared context for iD
   */
  constructor(context) {
    super(context);

    this._dispatch = d3_dispatch('move', 'down', 'downcancel', 'click', 'clickWay', 'clickNode', 'undo', 'cancel', 'finish');
    utilRebind(this, this._dispatch, 'on');

    this._keybinding = utilKeybinding('draw');
    this._disableSpace = false;
    this._mouseOverSurface = true;

    this._lastSpaceCoord = null;
    this._lastMouseEvent = null;
    this._lastPointerUpEvent = null;
    this._downData = null;
  }


  /**
   * enable
   * Bind event handlers
   */
  enable() {
    this._downData = null;

    this._keybinding
      .on('⌫', (e) => this._backspace(e))
      .on('⌦', (e) => this._del(e))
      .on('⎋', (e) => this._ret(e))
      .on('↩', (e) => this._ret(e))
      .on('space', (e) => this._space(e))
      .on('⌥space', (e) => this._space(e));

    this._context.surface()
      .on('mouseenter.draw', () => this._mouseOverSurface = true)
      .on('mouseleave.draw', () => this._mouseOverSurface = false)
      .on('pointerdown.draw', (e) => this._pointerdown(e))
      .on('pointermove.draw', (e) => this._pointermove(e))
      .on('pointerup.draw', (e) => this._pointerup(e));

    d3_select(window)
      // .on('pointerup.draw', (e) => this._pointerup(e), true)
      .on('pointercancel.draw', (e) => this._pointercancel(e), true);

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

    this._context.surface()
      .on('mouseenter.draw', null)
      .on('mouseleave.draw', null)
      .on('pointerdown.draw', null)
      .on('pointermove.draw', null);

    d3_select(window)
      .on('pointerup.draw', null)
      .on('pointercancel.draw', null);
      // note: keyup.space-block, click.draw-block should remain

    d3_select(document)
      .call(this._keybinding.unbind);

    this._enabled = false;
  }


  /**
   * _datum
   * gets the datum (__data__) associated with this event
   *  related code
   *  - `mode/drag_node.js` `datum()`
   */
  _datum(e) {
// some of this won't work yet
    const mode = this._context.mode();
    const isNoteMode = mode && mode.id.includes('note');
    if (e.altKey || isNoteMode) return {};

    let element;
    if (e.type === 'keydown') {
      element = this._lastMouseEvent && this._lastMouseEvent.target;
    } else {
      element = e.target;
    }

    // When drawing, snap only to touch targets..
    // (this excludes area fills and active drawing elements)
    let d = element.__data__;
    return (d && d.properties && d.properties.target) ? d : {};
  }


  /**
   * _pointerdown
   * Handler for pointerdown events.  Note that you can get multiples of these
   * if the user taps with multiple fingers. We lock in the first one in `_downData`.
   */
  _pointerdown(e) {
    if (this._downData) return;  // pointer is already down

    const pointerId = e.pointerId || 'mouse';
    let pointerLocGetter = utilFastMouse(e.target);

    this._downData = {
      id: pointerId,
      pointerLocGetter: pointerLocGetter,
      downTime: +new Date(),
      downLoc: pointerLocGetter(e)
    };

    this._dispatch.call('down', this, e, this._datum(e));
  }


  /**
   * _pointerup
   * Handler for pointerup events.  Note that you can get multiples of these
   * if the user taps with multiple fingers. We lock in the first one in `_downData`.
   */
  _pointerup(e) {
    const pointerId = e.pointerId || 'mouse';
    if (!this._downData || this._downData.id !== pointerId) return;  // not down, or different pointer

    const downData = this._downData;
    this._downData = null;
    this._lastPointerUpEvent = e;

    if (downData.isCancelled) return;

    const context = this._context;
    const t2 = +new Date();
    const p2 = downData.pointerLocGetter(e);
    const dist = vecLength(downData.downLoc, p2);

    if (dist < CLOSETOLERANCE || (dist < TOLERANCE && (t2 - downData.downTime) < 500)) {
      // Prevent a quick second click
      d3_select(window).on('click.draw-block', () => e.stopPropagation(), true);

      context.map().dblclickZoomEnable(false);

      window.setTimeout(() => {
        context.map().dblclickZoomEnable(true);
        d3_select(window).on('click.draw-block', null);
      }, 500);

      this._click(e, p2);
    }
  }


  /**
   * _pointermove
   * Handler for pointermove events.  Note that you can get multiples of these
   * if the user taps with multiple fingers. We lock in the first one in `_downData`.
   */
  _pointermove(e) {
    const pointerId = e.pointerId || 'mouse';

    // If the pointer moves too much, we consider it as a drag, not a click, and set `isCancelled=true`
    if (this._downData && this._downData.id === pointerId && !this._downData.isCancelled) {
      const p2 = this._downData.pointerLocGetter(e);
      const dist = vecLength(this._downData.downLoc, p2);
      if (dist >= CLOSETOLERANCE) {
        this._downData.isCancelled = true;
        this._dispatch.call('downcancel', this);
      }
    }

    if ((e.pointerType && e.pointerType !== 'mouse') || e.buttons || this._downData) return;

    // HACK: Mobile Safari likes to send one or more `mouse` type pointermove
    // events immediately after non-mouse pointerup events; detect and ignore them.
    if (this._lastPointerUpEvent &&
      this._lastPointerUpEvent.pointerType !== 'mouse' &&
      e.timeStamp - this._lastPointerUpEvent.timeStamp < 100
    ) {
      return;
    }

    this._lastMouseEvent = e;
    this._dispatch.call('move', this, e, this._datum(e));
  }


  /**
   * _pointercancel
   * Handler for pointercancel events.  Note that you can get multiples of these
   * if the user taps with multiple fingers. We lock in the first one in `_downData`.
   */
  _pointercancel(e) {
    const pointerId = e.pointerId || 'mouse';

    if (this._downData && this._downData.id === pointerId) {
      if (!this._downData.isCancelled) {
        this._dispatch.call('downcancel', this);
      }
      this._downData = null;   // throw it away
    }
  }



  /**
   * _space
   * Handler for keypress events of the spacebar
   */
  _space(e) {
    e.preventDefault();
    e.stopPropagation();

    const context = this._context;

    const currSpaceCoord = context.map().mouse();
    if (this._disableSpace && this._lastSpaceCoord) {
      const dist = vecLength(this._lastSpaceCoord, currSpaceCoord);
      if (dist > TOLERANCE) {
        this._disableSpace = false;
      }
    }

    if (this._disableSpace || !this._mouseOverSurface || !this._lastMouseEvent) return;

    // user must move mouse or release space bar to allow another click
    this._lastSpaceCoord = currSpaceCoord;
    this._disableSpace = true;

    d3_select(window).on('keyup.space-block', () => {
      e.preventDefault();
      e.stopPropagation();
      this._disableSpace = false;
      d3_select(window).on('keyup.space-block', null);
    });

    // get the current mouse position
    // or the map center if the mouse has never entered the map
    const coord = currSpaceCoord || context.projection.project(context.map().center());
    this._click(e, coord);
  }


  /**
   * _click
   * Once we have determined that the user has clicked, this is where we handle that click.
   * Note this is not a `click` event handler - we get into here from `pointerup` or `space`.
   *
   * related code
   * - `mode/drag_node.js`     `doMove()`
   * - `behavior/draw.js`      `click()`
   * - `behavior/draw_way.js`  `move()`
   *
   * @param  `e`      The Event
   * @param  `coord`  Map location in screen space where the click occurred
   */
  _click(e, coord) {
    const context = this._context;
    const graph = context.graph();
    const projection = context.projection;
    const d = this._datum(e);
    const target = d && d.properties && d.properties.entity;
    const mode = context.mode();

    function allowsVertex(d) {
      return d.geometry(graph) === 'vertex' || presetManager.allowsVertex(d, graph);
    }

    // Snap to a node
    if (target && target.type === 'node' && allowsVertex(target)) {
      this._dispatch.call('clickNode', this, target, d);
      return;

    // Snap to a way
    } else if (target && target.type === 'way' && (mode.id !== 'add-point' || mode.preset.matchGeometry('vertex'))) {
      const choice = geoChooseEdge(graph.childNodes(target), coord, projection, context.activeID());
      if (choice) {
        const edge = [target.nodes[choice.index - 1], target.nodes[choice.index]];
        this._dispatch.call('clickWay', this, choice.loc, edge, d);
        return;
      }

    } else if (mode.id !== 'add-point' || mode.preset.matchGeometry('point')) {
      const loc = projection.invert(coord);
      this._dispatch.call('click', this, loc, d);
    }
  }


  /**
   * _backspace
   */
  _backspace(e) {
    e.preventDefault();
    this._dispatch.call('undo');
  }


  /**
   * _del
   */
  _del(e) {
    e.preventDefault();
    this._dispatch.call('cancel');
  }


  /**
   * _ret
   */
  _ret(e) {
    e.preventDefault();
    this._dispatch.call('finish');
  }

}
