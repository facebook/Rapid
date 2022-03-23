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
  }


  /**
   * _onKeypress
   * Handles the keypress event
   */
  _onKeypress(e) {
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


  /**
   * destroy
   * Every behavior should have a destroy function
   * to frees all the resources and refrences held by the behavior
   * Do not use the behavior after calling `destroy()`.
   */
  destroy() {
    if (this._enabled) {
      this.disable();
    }
    this._operation = null;
    this._context = null;
  }


  /**
   * enable
   * Bind keypress event handler
   */
  enable() {
    const context = this._context;
    const operation = this._operation;

    if (operation.available() && operation.keys) {
      context.keybinding().on(operation.keys, (e) => this._onKeypress(e));
      this._enabled = true;
    }
  }


  /**
   * disable
   * Unbind keypress event handler
   */
  disable() {
    const context = this._context;
    const operation = this._operation;

    if (this._enabled && operation.keys) {
      context.keybinding().off(operation.keys);
      this._enabled = false;
    }
  }

}
