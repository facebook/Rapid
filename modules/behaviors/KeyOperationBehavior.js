import { AbstractBehavior } from './AbstractBehavior.js';


/**
 * `KeyOperationBehavior` binds whatever keystroke events trigger an "operation"
 * ("operations" are the things that go on the editing menu)
 */
export class KeyOperationBehavior extends AbstractBehavior {

  /**
   * @constructor
   * @param  `context`    Global shared application context
   * @param  `operation`  The operation this behavior is associated with
   */
  constructor(context, operation) {
    super(context);
    this.id = `key-${operation.id}`;

    this._operation = operation;
    if (!window.mocha) {
      this._keybinding = this.context.keybinding(); // "global" keybinding (on document)
    }

    // Make sure the event handlers have `this` bound correctly
    this._keydown = this._keydown.bind(this);
  }


  /**
   * enable
   * Bind event handlers
   */
  enable() {
    if (this._enabled) return;

    const operation = this._operation;
    if (operation.available() && operation.keys) {
      this._keybinding.on(operation.keys, this._keydown);
      this._enabled = true;
    }
  }


  /**
   * disable
   * Unbind event handlers
   */
  disable() {
    if (!this._enabled) return;
    this._enabled = false;

    const operation = this._operation;
    if (operation.keys) {
      this._keybinding.off(operation.keys);
    }
  }


  /**
   * _keydown
   * Handles the keydown event
   * @param  `e`  A d3 keydown event
   */
  _keydown(e) {
    const context = this.context;
    const operation = this._operation;

    if (operation.availableForKeypress && !operation.availableForKeypress()) return;  // copy paste detail 😕

    e.preventDefault();

    const disabled = operation.disabled();

    if (disabled) {
      context.systems.ui.flash
        .duration(4000)
        .iconName(`#rapid-operation-${operation.id}`)
        .iconClass('operation disabled')
        .label(operation.tooltip)();

    } else {
      context.systems.ui.flash
        .duration(2000)
        .iconName(`#rapid-operation-${operation.id}`)
        .iconClass('operation')
        .label(operation.annotation() || operation.title)();

      if (operation.point) {
        operation.point(null);  // copy-paste detail 😕
      }

      operation();  // do the thing
    }
  }

}
