
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
    this.disable();
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
   * Every behavior should have a `disable` function
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


  /**
   * _getEventData
   * Returns an object containing the important details about this Pixi event
   * @param  `e`  A Pixi InteractionEvent (or something that looks like one)
   */
  _getEventData(e) {
    const result = {
      id: e.data.originalEvent.pointerId || 'mouse',
      event: e,
      originalEvent: e.data.originalEvent,
      coord: [e.data.originalEvent.offsetX, e.data.originalEvent.offsetY],
      time: e.data.originalEvent.timeStamp,
      isCancelled: false,
      target: null,
      data: null
    };

    if (!e.target) {   // e.target is the displayObject that triggered this event
      return result;
    }

    let target = e.target;
    let data = target && target.__data__;

    // Data is here, use this target
    if (data) {
      result.target = target;
      result.data = data;
      return result;
    }

    // No data in target, look in parent
    target = e.target.parent;
    data = target && target.__data__;
    if (data) {
      result.target = target;
      result.data = data;
      return result;
    }

    // No data there either, just use the original target
    result.target = e.target;
    return result;
  }

}
