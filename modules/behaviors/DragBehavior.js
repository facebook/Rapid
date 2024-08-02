import { vecLength } from '@rapid-sdk/math';

import { AbstractBehavior } from './AbstractBehavior.js';
import { osmNode, QAItem } from '../osm/index.js';
import { utilDetect } from '../util/detect.js';

const NEAR_TOLERANCE = 1;
const FAR_TOLERANCE = 4;

/**
 * `DragBehavior` listens to pointer events and converts those into start/move/end drag events
 *
 * Properties available:
 *   `enabled`     `true` if the event handlers are enabled, `false` if not.
 *   `dragTarget`   After the drag has started, `Object` that contains details about the feature being dragged
 *   `lastDown`    `eventData` Object for the most recent down event
 *   `lastMove`    `eventData` Object for the most recent move event
 *
 * Events available:
 *   `start`    Fires on pointermove when dragging starts, receives the down `eventData` Object
 *   `move`     Fires on pointermove as dragging continues, receives the move `eventData` Object
 *   `end`      Fires on pointerup when dragging is done, receives the up `eventData` Object
 *   `cancel`   Fires on pointercancel -or- pointerup outside, receives the cancel `eventData` Object
 */
export class DragBehavior extends AbstractBehavior {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'drag';

    this.dragTarget = null;   // details of the feature being dragged
    this.lastDown = null;
    this.lastMove = null;

    // Make sure the event handlers have `this` bound correctly
    this._doMove = this._doMove.bind(this);
    this._pointercancel = this._pointercancel.bind(this);
    this._pointerdown = this._pointerdown.bind(this);
    this._pointermove = this._pointermove.bind(this);
    this._pointerup = this._pointerup.bind(this);
  }


  /**
   * enable
   * Bind event handlers
   */
  enable() {
    if (this._enabled) return;

    this._enabled = true;
    this.lastDown = null;
    this.lastMove = null;
    this.dragTarget = null;

    const eventManager = this.context.systems.map.renderer.events;
    eventManager.on('modifierchange', this._doMove);
    eventManager.on('pointerover', this._doMove);
    eventManager.on('pointerout', this._doMove);
    eventManager.on('pointerdown', this._pointerdown);
    eventManager.on('pointermove', this._pointermove);
    eventManager.on('pointerup', this._pointerup);
    eventManager.on('pointercancel', this._pointercancel);
  }


  /**
   * disable
   * Unbind event handlers
   */
  disable() {
    if (!this._enabled) return;

    // Something is currently dragging, so cancel the drag first.
    const eventData = this.lastMove;
    if (eventData && this.dragTarget) {
      eventData.target = null;
      this.dragTarget.feature.active = false;
      this.emit('cancel', eventData);
    }

    this._enabled = false;
    this.lastDown = null;
    this.lastMove = null;
    this.dragTarget = null;

    const eventManager = this.context.systems.map.renderer.events;
    eventManager.off('modifierchange', this._doMove);
    eventManager.off('pointerover', this._doMove);
    eventManager.off('pointerout', this._doMove);
    eventManager.off('pointerdown', this._pointerdown);
    eventManager.off('pointermove', this._pointermove);
    eventManager.off('pointerup', this._pointerup);
    eventManager.off('pointercancel', this._pointercancel);
  }



  /**
   * _pointerdown
   * Handler for pointerdown events.  Note that you can get multiples of these
   * if the user taps with multiple fingers. We lock in the first one in `lastDown`.
   * @param  `e`  A Pixi FederatedPointerEvent
   */
  _pointerdown(e) {
    if (this.lastDown) return;   // a pointer is already down
    if (e.pointerType === 'mouse' && e.button !== 0) return;   // drag with left button only (if a mouse)

    const down = this._getEventData(e);
    const target = down.target;
    const data = target?.data;
    if (!data) return;

    const isNote = data instanceof QAItem && data.isNew() && target.layerID === 'notes';
    const isNode = data instanceof osmNode && target.layerID === 'osm';       // not 'rapid'
    const isMidpoint = data.type === 'midpoint' && target.layerID === 'osm';  // not 'rapid'

    if (!(isNote || isNode || isMidpoint)) return;

    this.lastDown = down;
    this.lastMove = null;
    this.dragTarget = null;
  }


  /**
   * _pointermove
   * Handler for pointermove events.
   * @param  `e`  A Pixi FederatedPointerEvent
   */
  _pointermove(e) {
    const context = this.context;
    const editor = context.systems.editor;
    const graph = editor.staging.graph;
    const map = context.systems.map;

    // If we detect the edit (right-click) menu, we should cease any dragging behavior.
    const hasEditmenu = map.supersurface.select('.edit-menu').size();
    if (hasEditmenu) {
      this._pointercancel(e);
      return;
    }

    // Ignore it if we are not over the canvas
    // (e.g. sidebar, out of browser window, over a button, toolbar, modal)
    const eventManager = map.renderer.events;
    if (!eventManager.pointerOverRenderer) return;

    const down = this.lastDown;
    const move = this._getEventData(e);
    if (!down || down.id !== move.id) return;  // not down, or different pointer

    this.lastMove = move;

    // Dispatch either 'start' or 'move'
    // (Don't send a `move` event in the same time as `start` because
    // dragging a midpoint will convert the target to a node.)  todo: check?
    if (this.dragTarget) {   // already dragging
      this._doMove();

    } else if (down.target) {  // start dragging if we've moved enough
      const dist = vecLength(down.coord.screen, move.coord.screen);
      const tolerance = (e.pointerType === 'pen') ? FAR_TOLERANCE : NEAR_TOLERANCE;

      if (dist >= tolerance) {
        // Save the target, *and set it to be non-interactive*.
        // This lets us catch events for what other objects it passes over as the user drags it.
        const target = Object.assign({}, down.target);  // shallow copy
        this.dragTarget = target;
        target.feature.active = true;

        // What are we dragging?
        const data = target.data;
        const isNote = data instanceof QAItem;
        const isNode = data instanceof osmNode;
        const isMidpoint = (data.type === 'midpoint');

        // If the current selection includes a parent of the dragged item,
        //  reselect those same feature(s) after the drag completes.
        // (The user is reshaping a line or area by dragging vertices or midpoints.)
        let parentWays = [];
        if (isMidpoint) {
          parentWays = [data.way];
        } else if (isNode) {
          parentWays = graph.parentWays(data);
        }

        // Gather all parentIDs - include both ways and relations (such as multipolygons)
        const parentIDs = new Set();
        for (const way of parentWays) {
          parentIDs.add(way.id);
          for (const relation of graph.parentRelations(way)) {
            parentIDs.add(relation.id);
          }
        }

        const selectedIDs = context.selectedIDs();
        const selectionIncludesParent = selectedIDs.some(selectedID => parentIDs.has(selectedID));
        const reselectIDs = selectionIncludesParent ? selectedIDs.slice() : [];

        // Enter the correct mode
        if (isNode) {
          context.enter('drag-node', { nodeID: data.id, reselectIDs: reselectIDs });
        } else if (isNote) {
          context.enter('drag-note', { noteID: data.id });
        } else if (isMidpoint) {
          const midpoint = { loc: data.loc, edge: [ data.a.id, data.b.id ] };
          context.enter('drag-node', { midpoint: midpoint, reselectIDs: reselectIDs });
        }

        this.emit('start', down);
      }
    }
  }


  /**
   * _pointerup
   * Handler for pointerup events.
   * @param  `e`  A Pixi FederatedPointerEvent
   */
  _pointerup(e) {
    const down = this.lastDown;
    const up = this._getEventData(e);
    if (!down || down.id !== up.id) return;   // not down, or different pointer

    // Before emitting the 'up' event, copy the drag target data to the event data
    // UNLESS snapping is disabled.
    if (this.dragTarget) {

      // Snapping is disabled - drag has no target.
      if (this._snappingDisabled()) {
        up.target = null;
      } else {
        up.target = Object.assign({}, up.target);
      }
    }


    this.lastDown = null;
    this.lastMove = null;

    if (this.dragTarget) {
      this.dragTarget.feature.active = false;
      this.dragTarget = null;
      this.emit('end', up);
    }
  }


  /**
   * _pointercancel
   * Handler for pointercancel events.
   * @param  `e`  A Pixi FederatedPointerEvent
   */
  _pointercancel(e) {
    const cancel = this._getEventData(e);

    // Here we can throw away the down data to prepare for another `pointerdown`.
    // After pointercancel, there should be no more `pointermove` or `pointerup` events.
    this.lastDown = null;
    this.lastMove = null;

    if (this.dragTarget) {
      this.dragTarget.feature.active = false;
      this.dragTarget = null;
      this.emit('cancel', cancel);
    }
  }


  /**
   * _snappingDisabled
   */
  _snappingDisabled() {
    // Ignore it if we are not over the canvas
    // (e.g. sidebar, out of browser window, over a button, toolbar, modal)
    const eventManager = this.context.systems.map.renderer.events;
    if (!eventManager.pointerOverRenderer) return false;

    const modifiers = eventManager.modifierKeys;
    const isMac = utilDetect().os === 'mac';
    const disableSnap = modifiers.has('Alt') || modifiers.has('Meta') || (!isMac && modifiers.has('Control'));
    return disableSnap;
  }


  /**
   * _doMove
   * Checks lastMove and emits a 'move' event if needed.
   * This may also be fired if we detect a change in the modifier keys.
   */
  _doMove() {
    if (!this._enabled || !this.lastMove) return;  // nothing to do
    const eventData = Object.assign({}, this.lastMove);  // shallow copy

    // If a modifier key is down, discard the target to prevent snap/hover.
    if (this._snappingDisabled()) {
      eventData.target = null;
    }

    this.emit('move', eventData);
  }
}
