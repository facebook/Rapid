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
    this._pointerOverRenderer = false;

    // Make sure the event handlers have `this` bound correctly
    this._blur = this._blur.bind(this);
    this._focus = this._focus.bind(this);
    this._keydown = this._keydown.bind(this);
    this._keyup = this._keyup.bind(this);
    this._pointerover = this._pointerover.bind(this);
    this._pointerout = this._pointerout.bind(this);
    this._pointermove = this._pointermove.bind(this);

    // Always observe the state of the modifier keys (even when the behavior is disabled)
    // This is used to disable snapping/hovering
    this._modifierKeys = new Set();

    window.addEventListener('blur', this._blur);
    window.addEventListener('focus', this._focus);
    window.addEventListener('keydown', this._keydown);
    window.addEventListener('keyup', this._keyup);
  }


  /**
   * enable
   * Bind event handlers
   */
  enable() {
    if (this._enabled) return;
    if (!this.context.pixi) return;

    if (DEBUG) {
      console.log('BehaviorHover: enabling listeners');  // eslint-disable-line no-console
    }

    this._enabled = true;
    this.lastMove = null;
    this.hoverTarget = null;

    const view = this.context.pixi.view;
    view.addEventListener('pointerover', this._pointerover);
    view.addEventListener('pointerout', this._pointerout);

    const stage = this.context.pixi.stage;
    stage.addEventListener('pointermove', this._pointermove);
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

    const view = this.context.pixi.view;
    view.removeEventListener('pointerover', this._pointerover);
    view.removeEventListener('pointerout', this._pointerout);

    const stage = this.context.pixi.stage;
    stage.removeEventListener('pointermove', this._pointermove);
  }


  /**
   * _blur
   * Handler for the document losing focus (we won't get keyups if this happens)
   * @param  `e`  A DOM FocusEvent
   */
  _blur() {
    this._modifierKeys.clear();
    this._processMove();
  }


  /**
   * _focus
   * Handler for the document regaining focus
   * @param  `e`  A DOM FocusEvent
   */
  _focus() {
    this._modifierKeys.clear();
    this._processMove();
  }


  /**
   * _keydown
   * Handler for presses of the modifier keys
   * @param  `e`  A DOM KeyboardEvent
   */
  _keydown(e) {
    if (!['Alt', 'Control', 'Meta'].includes(e.key)) return;  // only care about these
    this._modifierKeys.add(e.key);
    this._processMove();
  }


  /**
   * _keyup
   * Handler for releases of the modifier keys
   * @param  `e`  A DOM KeyboardEvent
   */
  _keyup(e) {
    if (!['Alt', 'Control', 'Meta'].includes(e.key)) return;  // only care about these
    this._modifierKeys.delete(e.key);
    this._processMove();
  }


  /**
   * _pointerover
   * @param  `e`  A DOM PointerEvent
   */
  _pointerover() {
    this._pointerOverRenderer = true;
    this._processMove();
  }


  /**
   * _pointerout
   * @param  `e`  A DOM PointerEvent
   */
  _pointerout() {
    this._pointerOverRenderer = false;
    this._processMove();
  }


  /**
   * _pointermove
   * Handler for pointermove events.
   * @param  `e`  A Pixi FederatedPointerEvent
   */
  _pointermove(e) {
    // Refresh modifier state
    // (It's possible to miss a modifier key if it occurred when the window was out of focus)
    const modifiers = this._modifierKeys;
    if (e.altKey)  { modifiers.add('Alt'); } else { modifiers.delete('Alt'); }
    if (e.metaKey) { modifiers.add('Meta'); } else { modifiers.delete('Meta'); }
    if (e.ctrlKey) { modifiers.add('Control'); } else { modifiers.delete('Control'); }

    // We get a lot more move events than we need, so discard ones where it hasn't actually moved much
    const move = this._getEventData(e);
    if (this.lastMove && vecEqual(move.coord, this.lastMove.coord, 0.9)) return;

    this.lastMove = move;
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
    if (this._modifierKeys.size || !this._pointerOverRenderer) {
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
