import { AbstractBehavior } from './AbstractBehavior';


/**
 * `BehaviorHover` listens to pointer events emits `hoverchanged` events as the user hovers over stuff
 *
 * Properties available:
 *   `enabled`      `true` if the event handlers are enabled, `false` if not.
 *   `lastMove`     `eventData` Object for the most recent move event
 *   `hoverTarget`  `Object` that contains details about the feature being hovered, or `null`
 *
 * Events available:
 *   `hoverchanged`  Fires whenever the hover target has changed, receives `eventData` Object
 */
export class BehaviorHover extends AbstractBehavior {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'hover';

    this.lastMove = null;
    this.hoverTarget = null;

    // Make sure the event handlers have `this` bound correctly
    this._doHover = this._doHover.bind(this);
    this._pointermove = this._pointermove.bind(this);
  }


  /**
   * enable
   * Bind event handlers
   */
  enable() {
    if (this._enabled) return;

    this._enabled = true;
    this.lastMove = null;
    this.hoverTarget = null;

    const eventManager = this.context.map().renderer.events;
    eventManager.on('modifierchanged', this._doHover);
    eventManager.on('pointerover', this._doHover);
    eventManager.on('pointerout', this._doHover);
    eventManager.on('pointermove', this._pointermove);
  }


  /**
   * disable
   * Unbind event handlers
   */
  disable() {
    if (!this._enabled) return;

    // Something is currently hovered, so un-hover it first.
    const eventData = this.lastMove;
    if (this.hoverTarget && eventData) {
      eventData.target = null;
      this._doHover();
    }

    this._enabled = false;
    this.lastMove = null;
    this.hoverTarget = null;

    const eventManager = this.context.map().renderer.events;
    eventManager.off('modifierchanged', this._doHover);
    eventManager.off('pointerover', this._doHover);
    eventManager.off('pointerout', this._doHover);
    eventManager.off('pointermove', this._pointermove);
  }


  /**
   * _pointermove
   * Handler for pointermove events.
   * @param  `e`  A Pixi FederatedPointerEvent
   */
  _pointermove(e) {
    if (!this._enabled) return;

    this.lastMove = this._getEventData(e);
    this._doHover();
  }


  /**
   * _doHover
   * Emits a 'hoverchanged' event if needed
   * This may also be fired if we detect a change in the modifier keys.
   */
  _doHover() {
    if (!this._enabled || !this.lastMove) return;  // nothing to do

    const interaction = this.context.behaviors.get('map-interaction');
    if (interaction.gesture) return;  // dont change hover while interacting with the map

    const eventManager = this.context.map().renderer.events;
    const modifiers = eventManager.modifierKeys;
    const isCancelled = modifiers.has('Alt') || modifiers.has('Control') || modifiers.has('Meta');
    const eventData = Object.assign({}, this.lastMove);  // shallow copy

    // If a modifier key is down, or pointer is not over the renderer, discard the target..
    // (e.g. sidebar, out of browser window, over a button, toolbar, modal)
    if (isCancelled || !eventManager.pointerOverRenderer) {
      eventData.target = null;
    }

    // Check if hover target has changed
    const prevID = this.hoverTarget?.featureID;
    const currID = eventData?.target?.featureID;
    if (prevID !== currID) {
      this.hoverTarget = Object.assign({}, eventData.target);  // shallow copy
      this.emit('hoverchanged', eventData);
    }
  }
}
