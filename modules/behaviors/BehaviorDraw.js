import { select as d3_select } from 'd3-selection';
import { vecEqual, vecLength } from '@id-sdk/math';

import { AbstractBehavior } from './AbstractBehavior';
import { utilKeybinding } from '../util';

const NEAR_TOLERANCE = 4;
const FAR_TOLERANCE = 12;


/**
 * `BehaviorDraw` listens to pointer and click events and translates those into drawing events
 *
 * Properties available:
 *   `enabled`    `true` if the event handlers are enabled, `false` if not.
 *   `lastDown`   `eventData` Object for the most recent down event
 *   `lastMove`   `eventData` Object for the most recent move event
 *   `lastSpace`  `eventData` Object for the most recent move event used to trigger a spacebar click
 *   `lastClick`  `eventData` Object for the most recent click event
 *
 * Events available:
 *   `down`      Fires on initial pointerdown, receives `eventData` Object
 *   `move`      Fires on _any_ pointermove (or change of modifier key), receives `eventData` Object
 *   `cancel`    Fires on pointercancel -or- if the pointer has moved too much for it to be a click, receives `eventData` Object
 *   `click`     Fires on a successful click (or spacebar), receives `eventData` Object
 *   `undo`      Fires if user presses delete or backspace
 *   `finish`    Fires if user presses return, enter, or escape
 */
export class BehaviorDraw extends AbstractBehavior {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'draw';

    this._spaceClickDisabled = false;

    this.lastDown = null;
    this.lastMove = null;
    this.lastSpace = null;
    this.lastClick = null;
    this.clicked = null;

    this._keybinding = utilKeybinding('drawbehavior');

    // Make sure the event handlers have `this` bound correctly
    this._pointerdown = this._pointerdown.bind(this);
    this._pointermove = this._pointermove.bind(this);
    this._pointerup = this._pointerup.bind(this);
    this._pointercancel = this._pointercancel.bind(this);

    this._keydown = this._keydown.bind(this);
    this._keyup = this._keyup.bind(this);
    this._spacebar = this._spacebar.bind(this);
    this._undo = this._undo.bind(this);
    this._finish = this._finish.bind(this);

    this._emitMove = this._emitMove.bind(this);
    this._emitClick = this._emitClick.bind(this);
  }


  /**
   * enable
   * Bind event handlers
   */
  enable() {
    if (this._enabled) return;

    this._enabled = true;
    this.lastDown = null;
    this.lastMove = null;
    this.lastSpace = null;
    this.lastClick = null;

    this._keybinding
      .on('⌫', this._undo)
      .on('⌦', this._undo)
      .on('⎋', this._finish)
      .on('↩', this._finish)
      .on('space', this._spacebar)
      .on('⌥space', this._spacebar);

    d3_select(document)
      .call(this._keybinding);

    const eventManager = this.context.map().renderer.events;
    eventManager.on('modifierchanged', this._emitMove);
    eventManager.on('pointerover', this._emitMove);
    eventManager.on('pointerout', this._emitMove);
    eventManager.on('pointerdown', this._pointerdown);
    eventManager.on('pointermove', this._pointermove);
    eventManager.on('pointerup', this._pointerup);
    eventManager.on('pointercancel', this._pointercancel);
  }


  /**
   * disable
   * Unbind event handlers
   */
  disable() {
    if (!this._enabled) return;

    this._enabled = false;
    this.lastDown = null;
    this.lastMove = null;
    this.lastSpace = null;
    this.lastClick = null;

    d3_select(document).call(this._keybinding.unbind);

    const eventManager = this.context.map().renderer.events;
    eventManager.off('modifierchanged', this._emitMove);
    eventManager.off('pointerover', this._emitMove);
    eventManager.off('pointerout', this._emitMove);
    eventManager.off('pointerdown', this._pointerdown);
    eventManager.off('pointermove', this._pointermove);
    eventManager.off('pointerup', this._pointerup);
    eventManager.off('pointercancel', this._pointercancel);
  }


  /**
   * _keydown
   * Handler for keydown events on the window.
   * @param  `e`  A DOM KeyboardEvent
   */
  _keydown(e) {  // todo
  }

  /**
   * _keyup
   * Handler for keyup events on the window.
   * @param  `e`  A DOM KeyboardEvent
   */
  _keyup(e) {   // todo
  }


  /**
   * _pointerdown
   * Handler for pointerdown events.  Note that you can get multiples of these
   * if the user taps with multiple fingers. We lock in the first one in `lastDown`.
   * @param  `e`  A Pixi InteractionEvent
   */
  _pointerdown(e) {
    if (this.lastDown) return;  // a pointer is already down

    const down = this._getEventData(e);
    this.lastDown = down;
    this.lastClick = null;
    this.emit('down', down);
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

    // If the pointer moves too much, we consider it as a drag, not a click, and set `isCancelled=true`
    const down = this.lastDown;
    if (down && !down.isCancelled && down.id === move.id) {
      const dist = vecLength(down.coord, move.coord);
      if (dist >= NEAR_TOLERANCE) {
        down.isCancelled = true;
        this.emit('cancel', move);
      }
    }

    this._emitMove();
  }


  /**
   * _pointerup
   * Handler for pointerup events.
   * @param  `e`  A Pixi InteractionEvent
   */
  _pointerup(e) {
    const down = this.lastDown;
    const up = this._getEventData(e);
    if (!down || down.id !== up.id) return;  // not down, or different pointer

    this.lastDown = null;  // prepare for the next `pointerdown`

    if (down.isCancelled) return;   // was cancelled already by moving too much

    const dist = vecLength(down.coord, up.coord);
    if (dist < NEAR_TOLERANCE || (dist < FAR_TOLERANCE && up.time - down.time < 500)) {
      this.lastClick = up; // We will accept this as a click
      this.clicked = true;
      this._emitClick();
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

    if (down && !down.isCancelled) {
      this.emit('cancel', cancel);
    }

    this.lastDown = null;  // prepare for the next `pointerdown`
  }


  /**
   * _spacebar
   * Handler for `keydown` events of the spacebar. We use these to simulate clicks.
   * Note that the spacebar will repeat, so we can get many of these.
   * @param  `e`  A d3 keydown event
   */
  _spacebar(e) {
    e.preventDefault();
    e.stopPropagation();

    // Ignore it if we are not over the canvas
    // (e.g. sidebar, out of browser window, over a button, toolbar, modal)
    if (!this._pointerOverRenderer) return;

    // For spacebar clicks we will instead use the last move event
    if (!this.lastMove) return;
    const move = Object.assign({}, this.lastMove);  // shallow copy

    // Becase spacebar events will repeat if you keep it held down,
    // user must move pointer or lift spacebar to allow another spacebar click
    if (this._spaceClickDisabled && this.lastSpace) {
      const dist = vecLength(move.coord, this.lastSpace.coord);
      if (dist > FAR_TOLERANCE) {     // pointer moved far enough
        this._spaceClickDisabled = false;
      }
    }

    if (!this._spaceClickDisabled) {
      this._spaceClickDisabled = true;
      this.lastSpace = move;
      this.lastClick = move;   // We will accept this as a click

      d3_select(window).on('keyup.space-block', e => {   // user lifted spacebar up
        if (e.code !== 'Space') return;  // only spacebar
        e.preventDefault();
        e.stopPropagation();
        this._spaceClickDisabled = false;
        d3_select(window).on('keyup.space-block', null);
      });

      // simulate a click
      this._emitClick();
    }
  }


  /**
   * _emitMove
   * Checks lastMove and emits a 'move' event if needed.
   * This may also be fired if we detect a change in the modifier keys.
   */
  _emitMove() {
    if (!this._enabled || !this.lastMove) return;  // nothing to do

    // Ignore it if we are not over the canvas
    // (e.g. sidebar, out of browser window, over a button, toolbar, modal)
    const eventManager = this.context.map().renderer.events;
    if (!eventManager.pointerOverRenderer) return;

    const modifiers = eventManager.modifierKeys;
    const disableSnap = modifiers.has('Alt') || modifiers.has('Control') || modifiers.has('Meta');
    const eventData = Object.assign({}, this.lastMove);  // shallow copy

    // If a modifier key is down, discard the target to prevent snap/hover.
    if (disableSnap) {
      eventData.target = null;
      eventData.feature = null;
      eventData.data = null;
    }

    this.emit('move', eventData);
  }


  /**
   * _emitClick
   * Checks lastClick and emits a 'click' event if needed
   */
  _emitClick() {
    if (!this._enabled || !this.lastClick) return;  // nothing to do

    // Ignore it if we are not over the canvas
    // (e.g. sidebar, out of browser window, over a button, toolbar, modal)
    const eventManager = this.context.map().renderer.events;
    if (!eventManager.pointerOverRenderer) return;

    const modifiers = eventManager.modifierKeys;
    const disableSnap = modifiers.has('Alt') || modifiers.has('Control') || modifiers.has('Meta');
    const eventData = Object.assign({}, this.lastClick);  // shallow copy

    // If a modifier key is down, discard the target to prevent snap/hover.
    if (disableSnap) {
      eventData.target = null;
      eventData.feature = null;
      eventData.data = null;
    }

    this.emit('click', eventData);
  }


  /**
   * _undo
   * Fires if user presses delete or backspace - this is used to get rid of the last drawn segment
   * @param  `e`  A d3 keydown event
   */
  _undo(e) {
    e.preventDefault();
    this.emit('undo');
  }

  /**
   * _finish
   * Fires if user presses return, enter, or escape - this is used to accept whatever has been drawn
   * @param  `e`  A d3 keydown event
   */
  _finish() {
    this.emit('finish');
  }

}
