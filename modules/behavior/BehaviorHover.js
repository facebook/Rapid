import { AbstractBehavior } from './AbstractBehavior';


/**
 * `BehaviorHover` listens to pointer events
 * and hovers items that are hovered over
 */
export class BehaviorHover extends AbstractBehavior {

  /**
   * @constructor
   * @param  `context`  Global shared context for iD
   */
  constructor(context) {
    super(context);

    // Make sure the event handlers have `this` bound correctly
    this._pointermove = this._pointermove.bind(this);
  }


  /**
   * enable
   * Bind event handlers
   */
  enable() {
    if (!this._context.pixi) return;

    const stage = this._context.pixi.stage;
    stage.on('pointermove', this._pointermove);

    this._enabled = true;
  }


  /**
   * disable
   * Unbind event handlers
   */
  disable() {
    if (!this._enabled) return;
    if (!this._context.pixi) return;

    const stage = this._context.pixi.stage;
    stage.off('pointermove', this._pointermove);

    this._enabled = false;
  }


  /**
   * _getEventData
   * Returns an object containing the important details about this Pixi event
   * @param  `e`  A Pixi InteractionEvent
   */
  _getEventData(e) {
    const result = {
      id: e.data.originalEvent.pointerId || 'mouse',
      event: e,
      origEvent: e.data.originalEvent,
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


  /**
   * _pointermove
   * Handler for pointermove events.  Note that you can get multiples of these
   * if the user taps with multiple fingers. We lock in the first one in `_downData`.
   * @param  `e`  A Pixi InteractionEvent
   */
  _pointermove(e) {
    const context = this._context;
    const move = this._getEventData(e);
    // const name = (move.target && move.target.name) || 'no target';
    // console.log(`pointermove ${name}`);

    const renderer = context.map().renderer();
    const ids = move.data ? [move.target.name] : [];

    renderer.hover(ids);
    context.ui().sidebar.hover([move.data]);
  }

}
