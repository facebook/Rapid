import { numClamp, vecScale } from '@rapid-sdk/math';

import { AbstractBehavior } from './AbstractBehavior.js';


// in milliseconds  (no need to do more than once per frame, 16.7ms = 60fps)
// We may eventually use requestAnimationFrame or something better to schedule it
const MAP_NUDGE_INTERVAL = 16;


/**
 * `MapNudgeBehavior` listens to pointer events and converts those into
 *  map panning 'nudges' when the pointer nears the edge of the screen.
 *  Useful during drawing and dragging modes.
 *
 * Events available:
 *   `nudge`    Fires when the map nudges - receives the [x,y] amount panned in pixels
 */
export class MapNudgeBehavior extends AbstractBehavior {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'mapNudge';

    this._nudge = [0, 0];      // amount to pan the map during the next interval
    this._intervalID = null;

    // Make sure the event handlers have `this` bound correctly
    this._doNudge = this._doNudge.bind(this);
    this._pointermove = this._pointermove.bind(this);
  }


  /**
   * enable
   * Bind event handlers
   */
  enable() {
    if (this._enabled) return;

    this._nudge = [0, 0];

    const eventManager = this.context.systems.map.renderer.events;
    eventManager.on('pointermove', this._pointermove);

    if (!this._intervalID) {
      this._intervalID = window.setInterval(this._doNudge, MAP_NUDGE_INTERVAL);
    }
  }


  /**
   * allow
   * This behavior doesn't start automatically!
   * You need to call `allow()` to actually enable nudging.
   * This is because: the "Add Line" "Add Area" buttons are in the top toolbar, and if
   * the user clicks one of those, we don't want the map to immediately start nudging up.
   */
  allow() {
    this._enabled = true;
  }


  /**
   * disable
   * Unbind event handlers
   */
  disable() {
    this._enabled = false;

    const eventManager = this.context.systems.map.renderer.events;
    eventManager.off('pointermove', this._pointermove);

    if (this._intervalID) {
      window.clearInterval(this._intervalID);
      this._intervalID = null;
    }
  }


  /**
   * _pointermove
   * Handler for pointermove events.
   * @param  `e`  A Pixi FederatedPointerEvent
   */
  _pointermove(e) {
    if (!this._enabled) return;

    const context = this.context;
    const move = this._getEventData(e);

    const [x, y] = move.coord.screen;
    const [w, h] = context.viewport.dimensions;

//    const pad = [80, 20, 50, 20];   // top, right, bottom, left
// Add 50px overscan experiment, see UISystem.js
// Maybe find a nicer way to include overscan and view padding into places like this.

    const top = 130;
    const right = w - 70;
    const bottom = h - 100;
    const left = 70;

    if (right <= left || bottom <= top) {  // dimensions make no sense
      this._nudge = [0, 0];
      return;
    }

    let [dx, dy] = [0, 0];

    // If the mouse pointer has moved into the edge of the screen...
    if (y < top || y > bottom || x < left || x > right) {
      // How far along the screen are the pointer coords?
      // Normalize these values to the range 1..-1  (it's backwards because pan is the opposite direction)
      dx = numClamp( ((-2 * (x - left) / (right - left)) + 1), -1, 1);
      dy = numClamp( ((-2 * (y - top) / (bottom - top)) + 1), -1, 1);
    }

    // console.log(`[w,h] = [${w},${h}], [x,y] = [${x},${y}], [dx,dy] = [${dx},${dy}]`);
    const SPEED = 3;
    this._nudge = vecScale([dx, dy], SPEED);
  }


  /**
   * _doNudge
   * Called by the `setInterval` handler to pan the map.
   */
  _doNudge() {
    if (!this._enabled) return;

    const map = this.context.systems.map;

    if (this._nudge[0] || this._nudge[1]) {
      map.pan(this._nudge);
      this.emit('nudge', this._nudge);
    }
  }

}
