import { geomViewportNudge, vecScale } from '@rapid-sdk/math';

import { AbstractBehavior } from './AbstractBehavior.js';


// Scalar for how fast we want the map nudging to actually be.
// Pixi returns mouse events pretty quickly,
// so we want to adjust the SDK - provided
// vector values toned down.
const NUDGE_SPEED = 0.1;

/**
 * `MapNudgingBehavior` listens to pointer events and converts those into small
 *  map panning 'nudges' when the pointer nears the edge of the screen
 *  useful during drawing modes
 */
export class MapNudgingBehavior extends AbstractBehavior {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'map-nudging';

    // Make sure the event handlers have `this` bound correctly
    this._pointermove = this._pointermove.bind(this);
  }


  /**
   * enable
   * Bind event handlers
   */
  enable() {
    if (this._enabled) return;
    const eventManager = this.context.systems.map.renderer.events;
    eventManager.on('pointermove', this._pointermove);
  }


  /**
   * allow
   * Call this method from your mode or your nudging behavior won't work.
   * unlike other behaviors, we want the modes to control exactly when
   * this behavior engages. For example, if a user clicks the 'add building'
   * hotkey or button but hasn't started drawing anything, we don't want the
   * map to start nudging yet.
   */
  allow() {
    this._enabled = true;
  }


  /**
   * disable
   * Unbind event handlers
   */
  disable() {
    if (!this._enabled) return;
    this._enabled = false;
    const eventManager = this.context.systems.map.renderer.events;
    eventManager.off('pointermove', this._pointermove);
  }


  /**
   * _pointermove
   * Handler for pointermove events.
   * @param  `e`  A Pixi FederatedPointerEvent
   */
  _pointermove(e) {
    if (!this._enabled) return;

    const context = this.context;
    const map = context.systems.map;
    const viewport = context.viewport;

    const move = this._getEventData(e);
    const nudge = geomViewportNudge(move.coord.screen, viewport.dimensions);

    if (nudge) {
      map.pan(vecScale(nudge, NUDGE_SPEED));
    }
  }

}
