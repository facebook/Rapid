import { vecEqual } from '@id-sdk/math';
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

    this._lastmove = null;

    // Make sure the event handlers have `this` bound correctly
    this._pointermove = this._pointermove.bind(this);
  }


  /**
   * enable
   * Bind event handlers
   */
  enable() {
    if (this._enabled) return;
    if (!this._context.pixi) return;

    this._enabled = true;
    this._lastmove = null;

    const stage = this._context.pixi.stage;
    stage.on('pointermove', this._pointermove);
  }


  /**
   * disable
   * Unbind event handlers
   */
  disable() {
    if (!this._enabled) return;
    if (!this._context.pixi) return;

    this._enabled = false;
    this._lastmove = null;

    const stage = this._context.pixi.stage;
    stage.off('pointermove', this._pointermove);
  }


  /**
   * _pointermove
   * Handler for pointermove events.  Note that you can get multiples of these
   * if the user taps with multiple fingers. We lock in the first one in `_downData`.
   * @param  `e`  A Pixi InteractionEvent
   */
  _pointermove(e) {
    // If pointer is not over the renderer, just discard
    const context = this._context;
    const interactionManager = context.pixi.renderer.plugins.interaction;
    const pointerOverRenderer = interactionManager.mouseOverRenderer;
    if (!pointerOverRenderer) return;

    const move = this._getEventData(e);

    // We get a lot more move events than we need,
    // so discard ones where it hasn't actually moved much
    if (this._lastmove && vecEqual(move.coord, this._lastmove.coord, 0.9)) return;
    this._lastmove = move;

    // const name = (move.target && move.target.name) || 'no target';
    // console.log(`pointermove ${name}`);

    const ids = move.data ? [move.target.name] : [];
    const renderer = context.map().renderer();
    renderer.hover(ids);
    // context.ui().sidebar.hover([move.data]);
  }

}
