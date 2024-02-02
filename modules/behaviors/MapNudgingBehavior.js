import { geomViewportNudge  } from '@rapid-sdk/math';

import { AbstractBehavior } from './AbstractBehavior.js';


// Scalar for how fast we want the map nudging to actually be.
// Pixi returns mouse events pretty quickly,
// so we want to adjust the SDK - provided
// vector values toned down.
const nudgeFactor = 0.1;

/**
 * `MapNudgingBehavior` listens to pointer events and converts those into small
 *  map panning 'nudges' when the pointer nears the edge of the screen
 *  useful during drawing modes
 *
 * Properties available:
 *   `enabled`             `true` if the event handlers are enabled, `false` if not.
 *   `lastDown`            `eventData` Object for the most recent down event
 *   `gesture`             String containing the current detected gesture ('pan')
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
   *
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

    const point = [e.global.x, e.global.y];
    const nudge = geomViewportNudge(point, this.context.systems.map.dimensions);
    if (nudge) {
      const [dX, dY] = [nudge[0] * nudgeFactor, nudge[1] * nudgeFactor];
      const t = this.context.projection.transform();
      const tNew = { x: t.x + dX, y: t.y + dY, k: t.k };
      this.context.systems.map.transform(tNew);
    }
  }

}
