import { AbstractBehavior } from './AbstractBehavior';


/**
 * `BehaviorKeyOperation` binds whatever keystroke events trigger an "operation"
 * ("operations" are the things that go on the editing menu)
 */
export class BehaviorKeyOperation extends AbstractBehavior {

  /**
   * @constructor
   * @param  `context`    Global shared context for iD
   * @param  `operation`  The operation this behavior is associated with
   */
  constructor(context, operation) {
    super(context);
    this._operation = operation;
    this._keybinding = this._context.keybinding();  // "global" keybinding (on document)

    // Make sure the event handlers have `this` bound correctly
    this._keydown = this._keydown.bind(this);
  }


  /**
   * destroy
   * Every behavior should have a destroy function
   * to free all the resources and refrences held by the behavior
   * Do not use the behavior after calling `destroy()`.
   */
  destroy() {
    super.destroy();
    this._operation = null;
  }


  /**
   * enable
   * Bind keydown event handler
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
   * Unbind keydown event handler
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
    const context = this._context;
    const operation = this._operation;

    if (operation.availableForKeypress && !operation.availableForKeypress()) return;  // copy paste detail 😕

    e.preventDefault();

    const disabled = operation.disabled();

    if (disabled) {
      context.ui().flash
        .duration(4000)
        .iconName(`#iD-operation-${operation.id}`)
        .iconClass('operation disabled')
        .label(operation.tooltip)();

    } else {
      context.ui().flash
        .duration(2000)
        .iconName(`#iD-operation-${operation.id}`)
        .iconClass('operation')
        .label(operation.annotation() || operation.title)();

      if (operation.point) {
        operation.point(null);  // copy-paste detail 😕
      }

      operation();  // do the thing
    }
  }

}
