import { vecSubtract } from '@rapid-sdk/math';

import { AbstractMode } from './AbstractMode';
import { actionMove } from '../actions/move';


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
    this._startGraph = null;
    this._movementCache = null;  // used by the move action

    // Make sure the event handlers have `this` bound correctly
    this._cancel = this._cancel.bind(this);
    this._finish = this._finish.bind(this);
    this._keydown = this._keydown.bind(this);
    this._pointermove = this._pointermove.bind(this);
    this._undoOrRedo = this._undoOrRedo.bind(this);
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
    const editor = context.systems.editor;
    const filters = context.systems.filters;
    const map = context.systems.map;
    const eventManager = map.renderer.events;

    filters.forceVisible(this._entityIDs);
    context.enableBehaviors(['map-interaction', 'map-nudging']);
    context.behaviors['map-nudging'].allow();

    this._startLoc = map.mouseLoc();
    this._startGraph = editor.current.graph;
    this._movementCache = {};

    eventManager
      .on('click', this._finish)
      .on('keydown', this._keydown)
      .on('pointercancel', this._cancel)
      .on('pointermove', this._pointermove);

    editor
      .on('undone', this._undoOrRedo)
      .on('redone', this._undoOrRedo);

    return true;
  }


  /**
   * exit
   */
  exit() {
    if (!this._active) return;
    this._active = false;

    this._startLoc = null;
    this._startGraph = null;
    this._movementCache = null;

    const context = this.context;
    const editor = context.systems.editor;
    const filters = context.systems.filters;
    const eventManager = context.systems.map.renderer.events;

    filters.forceVisible([]);

    eventManager
      .off('click', this._finish)
      .off('keydown', this._keydown)
      .off('pointercancel', this._cancel)
      .off('pointermove', this._pointermove);

    editor
      .off('undone', this._undoOrRedo)
      .off('redone', this._undoOrRedo);
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
    const editor = context.systems.editor;
    const locations = context.systems.locations;
    const map = context.systems.map;

    const currLoc = map.mouseLoc();
    if (locations.blocksAt(currLoc).length) {  // editing is blocked here
      this._cancel();
      return;
    }

    const startPoint = context.projection.project(this._startLoc);
    const currPoint = context.projection.project(currLoc);
    const delta = vecSubtract(currPoint, startPoint);

    editor.rollback();  // moves are relative to the start location, so rollback before applying movement
    editor.perform(actionMove(this._entityIDs, delta, context.projection, this._movementCache));
    const graph = editor.current.graph;  // after move

    // Update selected/active collections to contain the moved entities
    this._selectedData.clear();
    for (const entityID of this._entityIDs) {
      this._selectedData.set(entityID, graph.entity(entityID));
    }
  }


  /**
   * _finish
   * Finalize the move edit
   */
  _finish() {
    const context = this.context;
    const editor = context.systems.editor;
    const graph = editor.current.graph;
    const l10n = context.systems.l10n;

    if (graph !== this._startGraph) {
      const annotation = (this._entityIDs.length === 1) ?
        l10n.t('operations.move.annotation.' + graph.geometry(this._entityIDs[0])) :
        l10n.t('operations.move.annotation.feature', { n: this._entityIDs.length });

      editor.commit(annotation);
    }
    context.enter('select-osm', { selectedIDs: this._entityIDs });
  }


  /**
   * _cancel
   * Return to select mode without doing anything
   */
  _cancel() {
    const context = this.context;
    const editor = context.systems.editor;
    const graph = editor.current.graph;

    if (graph !== this._startGraph) {
      editor.rollback();
    }
    context.enter('select-osm', { selectedIDs: this._entityIDs });
  }


  /**
   * _undoOrRedo
   * Return to browse mode without doing anything
   */
  _undoOrRedo() {
    this.context.enter('browse');
  }
}
