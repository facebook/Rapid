import { select as d3_select } from 'd3-selection';
import { vecEqual } from '@id-sdk/math';

import { AbstractBehavior } from './AbstractBehavior';

const DEBUG = false;


/**
 * `BehaviorHover` listens to pointer events emits `hoverchanged` events as the user hovers over stuff
 *
 * Properties available:
 *   `enabled`      `true` if the event handlers are enabled, `false` if not.
 *   `lastMove`     `eventData` Object for the most recent move event
 *   `hoverTarget`   Current hover target (a PIXI DisplayObject), or null
 *
 * Events available:
 *   `hoverchanged`  Fires whenever the hover target has changed, receives `eventData` Object
 */
export class BehaviorHover extends AbstractBehavior {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'hover';

    this.lastMove = null;
    this.hoverTarget = null;

    // Make sure the event handlers have `this` bound correctly
    this._pointermove = this._pointermove.bind(this);
    this._pointerout = this._pointerout.bind(this);
    this._keydown = this._keydown.bind(this);
    this._keyup = this._keyup.bind(this);
    this._blur = this._blur.bind(this);

    // Always observe the state of the modifier keys (even when the behavior is disabled)
    // This is used to disable snapping/hovering
    this._modifierKeys = new Set();
    d3_select(window)
      .on('keydown.BehaviorHover', this._keydown)
      .on('keyup.BehaviorHover', this._keyup)
      .on('blur.BehaviorHover', this._blur);
  }


  /**
   * enable
   * Bind event handlers
   */
  enable() {
return; // not yet
    if (this._enabled) return;
    if (!this.context.pixi) return;

    if (DEBUG) {
      console.log('BehaviorHover: enabling listeners');  // eslint-disable-line no-console
    }

    this._enabled = true;
    this.lastMove = null;
    this.hoverTarget = null;

    const interactionManager = this.context.pixi.renderer.plugins.interaction;
    interactionManager
      .on('pointermove', this._pointermove)
      .on('pointerout', this._pointerout);   // or leaves the canvas
  }


  /**
   * disable
   * Unbind event handlers
   */
  disable() {
    if (!this._enabled) return;
    if (!this.context.pixi) return;

    if (DEBUG) {
      console.log('BehaviorHover: disabling listeners');  // eslint-disable-line no-console
    }

    // Something is currently hovered, so un-hover it first.
    const move = this.lastMove;
    if (this.hoverTarget && move) {
      move.target = null;
      move.feature = null;
      move.data = null;
      this._processMove();
    }

    this._enabled = false;
    this.lastMove = null;
    this.hoverTarget = null;

    const interactionManager = this.context.pixi.renderer.plugins.interaction;
    interactionManager
      .off('pointermove', this._pointermove)
      .off('pointerout', this._pointerout);
  }


  /**
   * _keydown
   * Handler for presses of the modifier keys
   * @param  `e`  A d3 keydown event
   */
  _keydown(e) {
    if (!['Alt', 'Control', 'Meta'].includes(e.key)) return;  // only care about these
    this._modifierKeys.add(e.key);
    this._processMove();
  }


  /**
   * _keyup
   * Handler for releases of the modifier keys
   * @param  `e`  A d3 keyup event
   */
  _keyup(e) {
    if (!['Alt', 'Control', 'Meta'].includes(e.key)) return;  // only care about these
    this._modifierKeys.delete(e.key);
    this._processMove();
  }


  /**
   * _blur
   * Handler for the window losing focus (we won't get keyups if this happens)
   */
  _blur() {
    this._modifierKeys.clear();
    this._processMove();
  }


  /**
   * _pointermove
   * Handler for pointermove events.
   * @param  `e`  A Pixi InteractionEvent
   */
  _pointermove(e) {
    const move = this._getEventData(e);

    // We get a lot more move events than we need, so discard ones where it hasn't actually moved much
    if (this.lastMove && vecEqual(move.coord, this.lastMove.coord, 0.9)) return;

    this.lastMove = move;
    this._processMove();
  }


  /**
   * _pointerout
   * Handler for pointerout events.
   * @param  `e`  A Pixi InteractionEvent
   */
  _pointerout(e) {
    // Pretend it's a move event, but skip the "has it moved much" test
    this.lastMove = this._getEventData(e);
    this._processMove();
  }


  /**
   * _processMove
   * Checks lastMove and emits a 'hoverchanged' event if needed
   */
  _processMove() {
    if (!this._enabled || !this.lastMove) return;  // nothing to do

    const move = Object.assign({}, this.lastMove);  // shallow copy

    // If a modifier key is down, or pointer is not over the renderer, discard the target..
    // (e.g. sidebar, out of browser window, over a button, toolbar, modal)
    const interactionManager = this.context.pixi.renderer.plugins.interaction;
    const pointerOverRenderer = interactionManager.mouseOverRenderer;
    if (this._modifierKeys.size || !pointerOverRenderer) {
      move.target = null;
      move.feature = null;
      move.data = null;
    }

    // Hover target has changed
    if (this.hoverTarget !== move.target) {
      this.hoverTarget = move.target;

      if (DEBUG) {
        const name = (move.target && move.target.name) || 'none';
        console.log(`BehaviorHover: emitting 'hoverchanged', hoverTarget = ${name}`);  // eslint-disable-line no-console
      }
      this.emit('hoverchanged', move);
    }
  }
}
