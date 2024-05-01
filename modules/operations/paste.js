import { Extent, vecSubtract } from '@rapid-sdk/math';

import { actionCopyEntities } from '../actions/copy_entities.js';
import { actionMove } from '../actions/move.js';

import { uiCmd } from '../ui/cmd.js';


// see also `PasteBehavior`
export function operationPaste(context) {
  const editor = context.systems.editor;
  const l10n = context.systems.l10n;
  const map = context.systems.map;

  let operation = function() {
    // Note: nearly the same code appears in both PasteBehavior and PasteOperation
    const copyGraph = context.copyGraph;
    const copyIDs = context.copyIDs;
    if (!copyIDs.length) return;   // Nothing to copy..

    // Prevent paste if the pasted object would be invisible (see iD#10000)
    const osmLayer = context.scene().layers.get('osm');
    if (!osmLayer?.enabled) return;

    const action = actionCopyEntities(copyIDs, copyGraph);
    editor.beginTransaction();
    editor.perform(action);

    const currGraph = editor.staging.graph;
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
    const viewport = context.viewport;
    const copyLoc = context.copyLoc;
    const copyPoint = (copyLoc && viewport.project(copyLoc)) || viewport.project(extent.center());
    const delta = vecSubtract(map.mouse(), copyPoint);
    const annotation = l10n.t('operations.paste.annotation', { n: newIDs.length });

    editor.perform(actionMove(newIDs, delta, viewport));
    editor.commit({ annotation: annotation, selectedIDs: newIDs });
    editor.endTransaction();

    // Put the user in move mode so they can place the pasted features
    context.enter('move', { selection: { osm: newIDs }} );
  };


  operation.available = function() {
    return context.mode?.id === 'browse';
  };


  operation.disabled = function() {
    return !context.copyIDs.length;
  };


  operation.tooltip = function() {
    const oldGraph = context.copyGraph;
    const ids = context.copyIDs;
    if (!ids.length) {
      return l10n.t('operations.paste.nothing_copied');
    }
    return l10n.t('operations.paste.description', {
      feature: l10n.displayLabel(oldGraph.entity(ids[0]), oldGraph),
      n: ids.length
    });
  };


  operation.annotation = function() {
    const ids = context.copyIDs;
    return l10n.t('operations.paste.annotation', { n: ids.length });
  };


  operation.id = 'paste';
  operation.keys = [ uiCmd('⌘V') ];
  operation.title = l10n.t('operations.paste.title');

  return operation;
}
