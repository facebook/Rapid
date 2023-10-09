import { vecSubtract } from '@rapid-sdk/math';
import { utilArrayUniq } from '@rapid-sdk/util';

import { actionExtract } from '../actions/extract';
import { actionMove } from '../actions/move';
import { KeyOperationBehavior } from '../behaviors/KeyOperationBehavior';
import { utilTotalExtent } from '../util';


export function operationExtract(context, selectedIDs) {
  const editor = context.systems.editor;
  const graph = editor.current.graph;
  const l10n = context.systems.l10n;
  const map = context.systems.map;
  const presets = context.systems.presets;
  const storage = context.systems.storage;

  const multi = selectedIDs.length === 1 ? 'single' : 'multiple';
  const entities = selectedIDs.map(entityID => graph.hasEntity(entityID)).filter(Boolean);
  const isNew = entities.every(entity => entity.isNew());
  const extent = utilTotalExtent(entities, graph);
  const geometries = utilArrayUniq(entities.map(entity => entity.geometry(graph)));
  const geometryType = geometries.length === 1 ? geometries[0] : 'feature';

  const actions = entities.map(entity => {
    if (!entity.hasInterestingTags()) return null;
    if (entity.type === 'node' && graph.parentWays(entity).length === 0) return null;

    if (entity.type !== 'node') {
      const preset = presets.match(entity, graph);
      // only allow extraction from ways/relations if the preset supports points
      if (!preset.geometry.includes('point')) return null;
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

    editor.perform(combinedAction);
    editor.commit(operation.annotation());

    // Move the extracted nodes to the mouse cursor location
    const projection = context.projection;
    const extractedNodeIDs = actions.map(action => action.getExtractedNodeID());
    const extractPoint = projection.project(extent.center());
    const delta = vecSubtract(map.mouse(), extractPoint);
    editor.perform(actionMove(extractedNodeIDs, delta, projection));  // no annotation, we'll move more after this

    // Put the user in move mode so they can place the extracted nodes where they want.
    context.enter('move', { selection: { osm: extractedNodeIDs }} );
  };


  operation.available = function () {
    return actions.length && selectedIDs.length === actions.length;
  };


  operation.disabled = function () {
    const graph = editor.current.graph;
    if (!isNew && tooLarge()) {
      return 'too_large';
    } else if (selectedIDs.some(entityID => {
      return graph.geometry(entityID) === 'vertex' && context.hasHiddenConnections(entityID);
    })) {
      return 'connected_to_hidden';
    }
    return false;

    // If the selection is not 80% contained in view
    function tooLarge() {
      const allowLargeEdits = storage.getItem('rapid-internal-feature.allowLargeEdits') === 'true';
      return !allowLargeEdits && extent.percentContainedIn(map.extent()) < 0.8;
    }
  };


  operation.tooltip = function () {
    const disabledReason = operation.disabled();
    return disabledReason ?
      l10n.t(`operations.extract.${disabledReason}.${multi}`) :
      l10n.t(`operations.extract.description.${geometryType}.${multi}`);
  };


  operation.annotation = function () {
    return l10n.t('operations.extract.annotation', { n: selectedIDs.length });
  };


  operation.id = 'extract';
  operation.keys = [ l10n.t('operations.extract.key') ];
  operation.title = l10n.t('operations.extract.title');
  operation.behavior = new KeyOperationBehavior(context, operation);

  return operation;
}
