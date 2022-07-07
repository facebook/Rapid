import { EventEmitter } from '@pixi/utils';

/**
 * "Behaviors" are nothing more than bundles of event handlers that we can
 * enable and disable depending on what the user is doing.
 *
 * `AbstractBehavior` is the base class from which all behaviors inherit.
 * It contains enable/disable methods which manage the event handlers for the behavior
*
 * Properties you can access:
 *   `enabled`     `true` if the event handlers are enabled, `false` if not.
 */
export class AbstractBehavior extends EventEmitter {

  /**
   * @constructor
   * @param  `context`   Global shared application context
   */
  constructor(context) {
    super();
    this.context = context;
    this._enabled = false;
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
   * Returns an object containing the important details about this Pixi event.
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
      feature: null,
      data: null
    };

    if (!e.target) {   // `e.target` is the Pixi DisplayObject that triggered this event.
      return result;
    }

    let target = e.target;
    let feature = target && target.__feature__;

    // __feature__ is here, use this target
    if (feature) {
      result.target = target;
      result.feature = feature;
      result.data = feature.data;
      return result;
    }

    // No __feature__ in target, look in parent
    target = e.target.parent;
    feature = target && target.__feature__;
    if (feature) {
      result.target = target;
      result.feature = feature;
      result.data = feature.data;
      return result;
    }

    // No __feature__ there either, just use the original target
    result.target = e.target;
    return result;
  }

}
