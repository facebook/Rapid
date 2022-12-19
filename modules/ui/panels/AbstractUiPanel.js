/**
 * "Panels" are user interface elements that can float on top of the map
 * and provide extra information about the map or the selection.
 * They are normally used for more advanced features.
 *
 * `AbstractUiPanel` is the base class from which all UI panels inherit.
 *
 * Properties you can access:
 *   `enabled`  `true` if the panel is enabled, `false` if not.
 */
export class AbstractUiPanel {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    this.context = context;
    this._enabled = false;
  }


  /**
   * enable
   * Every panel should have an `enable` function
   * to setup whatever events and state the panel uses
   */
  enable() {
    this._enabled = true;
  }


  /**
   * disable
   * Every panel should have a `disable` function
   * to teardown whatever events and state the panel uses
   */
  disable() {
    this._enabled = false;
  }


  /**
   * enabled
   * Whether the panel is enabled
   * @readonly
   */
  get enabled() {
    return this._enabled;
  }

}
