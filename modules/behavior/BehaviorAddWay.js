import { dispatch as d3_dispatch } from 'd3-dispatch';

import { BehaviorDraw } from './BehaviorDraw';
import { modeBrowse } from '../modes/browse';
import { utilRebind } from '../util/rebind';


/**
 * `BehaviorAddWay` is a special `BehaviorDraw` for starting a new way
 *  It rewires some of the events, and adjusts the cancel/finish behavior
 */
export class BehaviorAddWay extends BehaviorDraw {

  /**
   * @constructor
   * @param  `context`  Global shared context for iD
   */
  constructor(context) {
    super(context);

    // Make sure the event handlers have `this` bound correctly
    this._cancel = this._cancel.bind(this);

    // rewire the events
    const parentDispatch = this._dispatch;
    this._dispatch = d3_dispatch('start', 'startFromWay', 'startFromNode');
    utilRebind(this, this._dispatch, 'on');

    parentDispatch
      .on('click', (loc) => this._dispatch.call('start', this, loc))
      .on('clickWay', (loc, edge) => this._dispatch.call('startFromWay', this, loc, edge))
      .on('clickNode', (loc, entity) => this._dispatch.call('startFromNode', this, loc, entity))
      .on('cancel', this._cancel)
      .on('finish', this._cancel);
  }


  /**
   * enable
   */
  enable() {
    super.enable();
    this._context.map().dblclickZoomEnable(false);
  }


  /**
   * _cancel
   */
  _cancel() {
    window.setTimeout(() => {
      this._context.map().dblclickZoomEnable(true);
    }, 1000);

    this._context.enter(modeBrowse(this._context));
  }

}
