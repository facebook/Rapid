import { vecSubtract } from '@rapid-sdk/math';

import { AbstractMode } from './AbstractMode.js';
import { actionMove } from '../actions/move.js';


/**
 * `MoveMode`
 * In this mode, we are moving one or more map features
 */
export class MoveMode extends AbstractMode {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'move';

    this._entityIDs = [];
    this._startLoc = null;
    this._movementCache = null;  // used by the move action

    // Make sure the event handlers have `this` bound correctly
    this._cancel = this._cancel.bind(this);
    this._finish = this._finish.bind(this);
    this._keydown = this._keydown.bind(this);
    this._pointermove = this._pointermove.bind(this);
  }


  /**
   * enter
   * Enters the mode.
   * @param  {Object?}  options - Optional `Object` of options passed to the new mode
   * @param  {Object}   options.selection - An object where the keys are layerIDs
   *    and the values are Arrays of dataIDs:  Example:  `{ 'osm': ['w1', 'w2', 'w3'] }`
   * @return {boolean}  `true` if the mode can be entered, `false` if not
   */
  enter(options = {}) {
    const context = this.context;
    const editor = context.systems.editor;
    const graph = editor.staging.graph;
    const filters = context.systems.filters;
    const locations = context.systems.locations;
    const map = context.systems.map;
    const eventManager = map.renderer.events;

    const selection = options.selection ?? {};
    let entityIDs = selection.osm ?? [];

    // Gather valid entities and entityIDs from selection.
    // For this mode, keep only the OSM data.
    this._selectedData = new Map();

    for (const entityID of entityIDs) {
      const entity = graph.hasEntity(entityID);
      if (!entity) continue;   // not in the osm graph
      if (entity.type === 'node' && locations.blocksAt(entity.loc).length) continue;  // editing is blocked

      this._selectedData.set(entityID, entity);
    }

    if (!this._selectedData.size) return false;  // nothing to select

    this._entityIDs = [...this._selectedData.keys()];  // the ones we ended up keeping
    this._active = true;

    filters.forceVisible(this._entityIDs);
    context.enableBehaviors(['mapInteraction', 'mapNudge']);
    context.behaviors.mapNudge.allow();

    this._startLoc = map.mouseLoc();
    this._movementCache = {};

    eventManager
      .on('click', this._finish)
      .on('keydown', this._keydown)
      .on('pointercancel', this._cancel)
      .on('pointermove', this._pointermove);

    return true;
  }


  /**
   * exit
   */
  exit() {
    if (!this._active) return;
    this._active = false;

    this._startLoc = null;
    this._movementCache = null;

    const context = this.context;
    const editor = context.systems.editor;
    const filters = context.systems.filters;
    const l10n = context.systems.l10n;
    const eventManager = context.systems.map.renderer.events;

    filters.forceVisible([]);

    eventManager
      .off('click', this._finish)
      .off('keydown', this._keydown)
      .off('pointercancel', this._cancel)
      .off('pointermove', this._pointermove);

    // If there is work in progress, finalize it.
    if (editor.hasWorkInProgress) {
      const graph = editor.staging.graph;
      const annotation = (this._entityIDs.length === 1) ?
        l10n.t('operations.move.annotation.' + graph.geometry(this._entityIDs[0])) :
        l10n.t('operations.move.annotation.feature', { n: this._entityIDs.length });

      editor.commit({
        annotation: annotation,
        selectedIDs: this._entityIDs
      });
    }
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

    } else if (['r', 'R'].includes(e.key)) {
      e.preventDefault();
      this.context.enter('rotate', { selection: { osm: this._entityIDs }} );
    }
  }


  /**
   * _pointermove
   * Handler for pointermove events.
   * @param  `e`  A Pixi FederatedPointerEvent
   */
  _pointermove() {
    const context = this.context;
    const editor = context.systems.editor;
    const locations = context.systems.locations;
    const map = context.systems.map;

    const currLoc = map.mouseLoc();
    if (locations.blocksAt(currLoc).length) {  // editing is blocked here
      this._cancel();
      return;
    }

    const startPoint = context.viewport.project(this._startLoc);
    const currPoint = context.viewport.project(currLoc);
    const delta = vecSubtract(currPoint, startPoint);

    editor.revert();  // moves are relative to the start location, so revert before applying movement
    editor.perform(actionMove(this._entityIDs, delta, context.viewport, this._movementCache));
    const graph = editor.staging.graph;  // after move

    // Update selected/active collections to contain the moved entities
    this._selectedData.clear();
    for (const entityID of this._entityIDs) {
      this._selectedData.set(entityID, graph.entity(entityID));
    }
  }


  /**
   * _finish
   * Return to select mode - `exit()` will finalize the work in progress.
   */
  _finish() {
    this.context.enter('select-osm', { selection: { osm: this._entityIDs }} );
  }


  /**
   * _cancel
   * Return to select mode without doing anything
   */
  _cancel() {
    const context = this.context;
    const editor = context.systems.editor;

    editor.revert();
    context.enter('select-osm', { selection: { osm: this._entityIDs }} );
  }

}
