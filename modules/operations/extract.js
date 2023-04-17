import { vecSubtract } from '@rapid-sdk/math';
import { utilArrayUniq } from '@rapid-sdk/util';

import { actionExtract } from '../actions/extract';
import { actionMove } from '../actions/move';
import { BehaviorKeyOperation } from '../behaviors/BehaviorKeyOperation';
import { t } from '../core/localizer';
import { prefs } from '../core/preferences';
import { presetManager } from '../presets';
import { utilTotalExtent } from '../util';


export function operationExtract(context, selectedIDs) {
  const multi = selectedIDs.length === 1 ? 'single' : 'multiple';
  const entities = selectedIDs.map(entityID => context.hasEntity(entityID)).filter(Boolean);
  const isNew = entities.every(entity => entity.isNew());
  const extent = utilTotalExtent(entities, context.graph());
  const geometries = utilArrayUniq(entities.map(entity => entity.geometry(context.graph())));
  const geometryType = geometries.length === 1 ? geometries[0] : 'feature';

  const actions = entities.map(entity => {
    if (!entity.hasInterestingTags()) return null;

    const graph = context.graph();
    if (entity.type === 'node' && graph.parentWays(entity).length === 0) return null;

    if (entity.type !== 'node') {
      const preset = presetManager.match(entity, graph);
      // only allow extraction from ways/relations if the preset supports points
      if (preset.geometry.indexOf('point') === -1) return null;
    }

    return actionExtract(entity.id, context.projection);
  }).filter(Boolean);


  let operation = function() {
    if (!actions.length) return;

    const combinedAction = (graph) => {
      for (const action of actions) {
        graph = action(graph);
      }
      return graph;
    };

    context.perform(combinedAction, operation.annotation());
    context.validator().validate();

    // Move the extracted nodes to the mouse cursor location
    const projection = context.projection;
    const extractedNodeIDs = actions.map(action => action.getExtractedNodeID());
    const extractPoint = projection.project(extent.center());
    const delta = vecSubtract(context.map().mouse(), extractPoint);
    context.perform(actionMove(extractedNodeIDs, delta, projection));  // no annotation, we'll move more after this

    // Put the user in move mode so they can place the extracted nodes where they want.
    // We use the latest entities from the graph (because they were just moved).
    const selection = new Map();    // Map (entityID -> Entity)
    for (const extractedNodeID of extractedNodeIDs) {
      selection.set(extractedNodeID, context.entity(extractedNodeID));
    }
    context.enter('move', { selection: selection });
  };


  operation.available = function () {
    return actions.length && selectedIDs.length === actions.length;
  };


  operation.disabled = function () {
    if (!isNew && tooLarge()) {
      return 'too_large';
    } else if (selectedIDs.some(entityID => {
      return context.graph().geometry(entityID) === 'vertex' && context.hasHiddenConnections(entityID);
    })) {
      return 'connected_to_hidden';
    }
    return false;

    // If the selection is not 80% contained in view
    function tooLarge() {
      const allowLargeEdits = prefs('rapid-internal-feature.allowLargeEdits') === 'true';
      return !allowLargeEdits && extent.percentContainedIn(context.map().extent()) < 0.8;
    }
  };


  operation.tooltip = function () {
    const disabledReason = operation.disabled();
    return disabledReason ?
      t(`operations.extract.${disabledReason}.${multi}`) :
      t(`operations.extract.description.${geometryType}.${multi}`);
  };


  operation.annotation = function () {
    return t('operations.extract.annotation', { n: selectedIDs.length });
  };


  operation.id = 'extract';
  operation.keys = [ t('operations.extract.key') ];
  operation.title = t('operations.extract.title');
  operation.behavior = new BehaviorKeyOperation(context, operation);

  return operation;
}
