import { Extent, vecSubtract } from '@rapid-sdk/math';

import { AbstractBehavior } from './AbstractBehavior';
import { actionCopyEntities } from '../actions/copy_entities';
import { actionMove } from '../actions/move';
import { utilDetect } from '../util/detect';

const MACOS = (utilDetect().os === 'mac');


/**
 * `PasteBehavior` listens for key event '⌘V' when pasting is allowed
 */
export class PasteBehavior extends AbstractBehavior {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'paste';

    // Make sure the event handlers have `this` bound correctly
    this._keydown = this._keydown.bind(this);
  }


  /**
   * enable
   * Bind event handlers
   */
  enable() {
    if (this._enabled) return;
    this._enabled = true;

    const eventManager = this.context.systems.map.renderer.events;
    eventManager.on('keydown', this._keydown);
  }


  /**
   * disable
   * Unbind event handlers
   */
  disable() {
    if (!this._enabled) return;
    this._enabled = false;

    const eventManager = this.context.systems.map.renderer.events;
    eventManager.off('keydown', this._keydown);
  }


  /**
   * _keydown
   * Handler for keydown events on the window.
   * @param  `e`  A DOM KeyboardEvent
   */
  _keydown(e) {
    const modifier = (MACOS && e.metaKey) || (!MACOS && e.ctrlKey);
    if (modifier && e.key === 'v') {
      this._doPaste(e);
    }
  }


  /**
   * _doPaste
   * Pastes copied features onto the map, if possible
   * @param  `e`  A DOM KeyboardEvent
   */
  _doPaste(e) {
    const context = this.context;
    const editor = context.systems.editor;
    const l10n = context.systems.l10n;
    const map = context.systems.map;

    // Nothing to copy..
    const copyIDs = context.copyIDs;
    if (!copyIDs.length) return;

    // Ignore it if we are not over the canvas
    // (e.g. sidebar, out of browser window, over a button, toolbar, modal)
    const eventManager = map.renderer.events;
    if (!eventManager.pointerOverRenderer) return;

    e.preventDefault();
    e.stopPropagation();

    const copyGraph = context.copyGraph;
    const projection = context.projection;

    const action = actionCopyEntities(copyIDs, copyGraph);
    editor.perform(action);
    const copies = action.copies();

    let extent = new Extent();
    let pasteIDs = new Set();
    let originalIDs = new Set();
    let currGraph = editor.current.graph;
    Object.values(copies).forEach(entity => originalIDs.add(entity.id));

    for (const id in copies) {
      const oldEntity = copyGraph.entity(id);
      const newEntity = copies[id];

      extent = extent.extend(oldEntity.extent(copyGraph));

      // Exclude child nodes from pasteIDs if their parent way was also copied.
      const parents = currGraph.parentWays(newEntity);
      const parentCopied = parents.some(parent => originalIDs.has(parent.id));
      if (!parentCopied) {
        pasteIDs.add(newEntity.id);
      }
    }

    // Move pasted features to where mouse pointer is..
    // Default to map center if we can't determine the mouse pointer
    const copyLoc = context.copyLoc;
    const copyPoint = (copyLoc && projection.project(copyLoc)) || projection.project(extent.center());
    const mousePoint = eventManager.coord || map.centerPoint();
    const delta = vecSubtract(mousePoint, copyPoint);

    const annotation = l10n.t('operations.paste.annotation', { n: pasteIDs.size });
    editor.perform(actionMove(Array.from(pasteIDs), delta, projection), annotation);

    // Put the user in move mode so they can place the pasted features
    // Grab the current versions from the graph (because they were just moved).
    const pasted = new Map();    // Map (entityID -> Entity)
    currGraph = editor.current.graph;
    for (const pasteID of pasteIDs) {
      pasted.set(pasteID, currGraph.entity(pasteID));
    }
    context.enter('move', { selection: pasted });
  }

}
