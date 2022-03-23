
/**
 * "Behaviors" are nothing more than bundles of event handlers that we can
 * enable and disable depending on what the user is doing.
 *
 * `AbstractBehavior` is the base class from which all behaviors inherit.
 * It contains enable/disable methods which manage the event handlers for the behavior
 */
export class AbstractBehavior {

  /**
   * @constructor
   * @param  `context`   Global shared context for iD
   */
  constructor(context) {
    this._context = context;
    this._enabled = false;
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
    this._context = null;
  }


  /**
   * enable
   * Every behavior should have an `enable` function
   * to setup whatever event handlers this behavior needs
   */
  enable() {
    this._enabled = true;
  }


  /**
   * disable
   * Every behavior should have a `enable` function
   * to teardown whatever event handlers this behavior needs
   */
  disable() {
    this._enabled = false;
  }


  /**
   * enabled
   * Whether the behavior is enabled
   * @readonly
   */
  get enabled() {
    return this._enabled;
  }

}
