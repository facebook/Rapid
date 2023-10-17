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

    // Note: nearly the same code appears in both PasteBehavior and PasteOperation
    const copyGraph = context.copyGraph;
    const copyIDs = context.copyIDs;
    if (!copyIDs.length) return;   // Nothing to copy..

    // Ignore it if we are not over the canvas
    // (e.g. sidebar, out of browser window, over a button, toolbar, modal)
    const eventManager = map.renderer.events;
    if (!eventManager.pointerOverRenderer) return;

    e.preventDefault();
    e.stopPropagation();

    const action = actionCopyEntities(copyIDs, copyGraph);
    editor.beginTransaction();
    editor.perform(action);

    const currGraph = editor.current.graph;
    const copies = action.copies();

    const originalIDs = new Set();
    for (const entity of Object.values(copies)) {
      originalIDs.add(entity.id);
    }

    let extent = new Extent();
    let newIDs = [];
    for (const [entityID, newEntity] of Object.entries(copies)) {
      const oldEntity = copyGraph.entity(entityID);

      extent = extent.extend(oldEntity.extent(copyGraph));

      // Exclude child nodes from newIDs if their parent way was also copied.
      const parents = currGraph.parentWays(newEntity);
      const parentCopied = parents.some(parent => originalIDs.has(parent.id));

      if (!parentCopied) {
        newIDs.push(newEntity.id);
      }
    }

    // Move pasted features to where mouse pointer is..
    // (or center of map if there is no readily available pointer coordinate)
    const projection = context.projection;
    const copyLoc = context.copyLoc;
    const copyPoint = (copyLoc && projection.project(copyLoc)) || projection.project(extent.center());
    const delta = vecSubtract(map.mouse(), copyPoint);
    const annotation = l10n.t('operations.paste.annotation', { n: newIDs.length });

    editor.perform(actionMove(newIDs, delta, projection));
    editor.commit({ annotation: annotation, selectedIDs: newIDs });
    editor.endTransaction();

    // Put the user in move mode so they can place the pasted features
    context.enter('move', { selection: { osm: newIDs }} );
  }

}
