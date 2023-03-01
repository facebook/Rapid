import { Extent, vecSubtract } from '@id-sdk/math';

import { actionCopyEntities } from '../actions/copy_entities';
import { actionMove } from '../actions/move';
import { modeSelect } from '../modes/select';

import { t } from '../core/localizer';
import { uiCmd } from '../ui/cmd';
import { utilDisplayLabel } from '../util/util';


// see also `BehaviorPaste`
export function operationPaste(context) {
  let _pastePoint;

  let operation = function() {
    if (!_pastePoint) return;

    const oldIDs = context.copyIDs();
    if (!oldIDs.length) return;

    const projection = context.projection;
    const oldGraph = context.copyGraph();
    let extent = new Extent();
    let newIDs = [];

    const action = actionCopyEntities(oldIDs, oldGraph);
    context.perform(action);

    let copies = action.copies();
    let originals = new Set();
    Object.values(copies).forEach(function(entity) { originals.add(entity.id); });

    for (let id in copies) {
      const oldEntity = oldGraph.entity(id);
      const newEntity = copies[id];

      extent = extent.extend(oldEntity.extent(oldGraph));

      // Exclude child nodes from newIDs if their parent way was also copied.
      const parents = context.graph().parentWays(newEntity);
      const parentCopied = parents.some(parent => originals.has(parent.id));

      if (!parentCopied) {
        newIDs.push(newEntity.id);
      }
    }

    // Use the location of the copy operation to offset the paste location,
    // or else use the center of the pasted extent
    const copyLoc = context.copyLoc();
    const copyPoint = (copyLoc && projection.project(copyLoc)) || projection.project(extent.center());
    const delta = vecSubtract(_pastePoint, copyPoint);

    // Move the pasted objects to be anchored at the paste location
    context.replace(actionMove(newIDs, delta, projection), operation.annotation());
    context.enter(modeSelect(context, newIDs));
  };


  operation.point = function(val) {
    _pastePoint = val;
    return operation;
  };


  operation.available = function() {
    return context.mode().id === 'browse';
  };


  operation.disabled = function() {
    return !context.copyIDs().length;
  };


  operation.tooltip = function() {
    const oldGraph = context.copyGraph();
    const ids = context.copyIDs();
    if (!ids.length) {
      return t('operations.paste.nothing_copied');
    }
    return t('operations.paste.description', { feature: utilDisplayLabel(oldGraph.entity(ids[0]), oldGraph), n: ids.length });
  };


  operation.annotation = function() {
    const ids = context.copyIDs();
    return t('operations.paste.annotation', { n: ids.length });
  };


  operation.id = 'paste';
  operation.keys = [ uiCmd('⌘V') ];
  operation.title = t('operations.paste.title');

  return operation;
}
