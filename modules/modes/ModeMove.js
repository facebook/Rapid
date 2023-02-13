import { vecSubtract } from '@id-sdk/math';

import { AbstractMode } from './AbstractMode';
import { actionMove } from '../actions/move';
import { actionNoop } from '../actions/noop';
import { locationManager } from '../core/LocationManager';
import { modeSelect } from './select';
import { t } from '../core/localizer';


/**
 * `ModeMove`
 * In this mode, we are moving one or more map features
 */
export class ModeMove extends AbstractMode {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);

    this.id = 'move';
    this._entityIDs = [];
    this._prevGraph = null;
    this._startLoc = null;
    this._movementCache = null;  // used by the move action

    // Make sure the event handlers have `this` bound correctly
    this._cancel = this._cancel.bind(this);
    this._finish = this._finish.bind(this);
    this._keydown = this._keydown.bind(this);
    this._pointermove = this._pointermove.bind(this);
    this._undone = this._undone.bind(this);
  }


  /**
   * enter
   * Expects a `selection` property in the options argument as a `Map(datumID -> datum)`
   * @param  `options`  Optional `Object` of options passed to the new mode
   */
  enter(options = {}) {
    const selection = options.selection;
    if (!(selection instanceof Map)) return false;
    if (!selection.size) return false;
    this._entityIDs = [...selection.keys()];

    this._active = true;

    const context = this.context;
    context.features().forceVisible(this._entityIDs);
    context.enableBehaviors(['map-interaction', 'map-nudging']);
    context.behaviors.get('map-nudging').allow();

    this._prevGraph = null;
    this._startLoc = null;
    this._movementCache = null;

    const eventManager = context.map().renderer.events;
    eventManager.on('click', this._finish);
    eventManager.on('keydown', this._keydown);
    eventManager.on('pointercancel', this._cancel);
    eventManager.on('pointermove', this._pointermove);
    context.history().on('undone.modeMove', this._undone);

    return true;
  }


  /**
   * exit
   */
  exit() {
    if (!this._active) return;
    this._active = false;

    this._prevGraph = null;
    this._startLoc = null;
    this._movementCache = null;

    const context = this.context;
    context.features().forceVisible([]);

    const eventManager = this.context.map().renderer.events;
    eventManager.off('click', this._finish);
    eventManager.off('keydown', this._keydown);
    eventManager.off('pointercancel', this._cancel);
    eventManager.off('pointermove', this._pointermove);
    context.history().on('undone.modeMove', null);
  }


  /**
   * _keydown
   * Handler for keydown events on the window.
   * @param  `e`  A DOM KeyboardEvent
   */
  _keydown(e) {
    if (['Enter'].includes(e.key)) {
      e.preventDefault();
      this._finish();

    } else if (['Backspace', 'Delete', 'Del', 'Escape', 'Esc'].includes(e.key)) {
      e.preventDefault();
      this._cancel();
    }
  }


  /**
   * _pointermove
   * Handler for pointermove events.
   * @param  `e`  A Pixi FederatedPointerEvent
   */
  _pointermove() {
    const context = this.context;

    let fn;
    // If prevGraph doesn't match, either we haven't started moving, or something has
    // occurred during the move that interrupted it, so reset vars and start a new move
    if (this._prevGraph !== context.graph()) {
      this._startLoc = context.map().mouseLoc();
      this._movementCache = {};
      fn = context.perform;     // start moving
    } else {
      fn = context.overwrite;   // continue moving
    }

    const currLoc = context.map().mouseLoc();
    if (locationManager.blocksAt(currLoc).length) {  // editing is blocked here
      this._cancel();
      return;
    }

    const startPoint = context.projection.project(this._startLoc);
    const currPoint = context.projection.project(currLoc);
    const delta = vecSubtract(currPoint, startPoint);

    fn(actionMove(this._entityIDs, delta, context.projection, this._movementCache));
    this._prevGraph = context.graph();

    // Update selected/active collections to contain the moved entities
    this._selectedData.clear();
    this._activeData.clear();
    for (const entityID of this._entityIDs) {
      this._selectedData.set(entityID, context.entity(entityID));
      this._activeData.set(entityID, context.entity(entityID));
    }
  }


  /**
   * _finish
   * Finalize the move edit
   */
  _finish() {
    const context = this.context;
    if (this._prevGraph) {
      const annotation = (this._entityIDs.length === 1) ?
        t('operations.move.annotation.' + context.graph().geometry(this._entityIDs[0])) :
        t('operations.move.annotation.feature', { n: this._entityIDs.length });

      context.replace(actionNoop(), annotation);   // annotate the move
    }
    context.enter(modeSelect(context, this._entityIDs));
  }


  /**
   * _cancel
   * Return to select mode without doing anything
   */
  _cancel() {
    const context = this.context;
    if (this._prevGraph) {
      context.pop();   // remove the move
    }
    context.enter(modeSelect(context, this._entityIDs));
  }


  /**
   * _undone
   * Return to browse mode without doing anything
   */
  _undone() {
    this.context.enter('browse');
  }
}
