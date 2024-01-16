import { utilArrayGroupBy } from '@rapid-sdk/util';

import { KeyOperationBehavior } from '../behaviors/KeyOperationBehavior.js';


export function operationContinue(context, selectedIDs) {
  const graph = context.systems.editor.staging.graph;
  const filters = context.systems.filters;
  const l10n = context.systems.l10n;

  const entities = selectedIDs.map(entityID => graph.hasEntity(entityID)).filter(Boolean);
  const geometries = Object.assign(
    { line: [], vertex: [] },
    utilArrayGroupBy(entities, entity => entity.geometry(graph))
  );
  const continueFromNode = geometries.vertex.length === 1 && geometries.vertex[0];
  const candidates = candidateWays();


  function candidateWays() {
    if (!continueFromNode) return [];

    return graph.parentWays(continueFromNode).filter(parent => {
      return parent.geometry(graph) === 'line' &&
        !parent.isClosed() &&
        parent.affix(continueFromNode.id) &&
        (geometries.line.length === 0 || geometries.line[0] === parent);
    });
  }


  let operation = function() {
    if (!candidates.length) return;

    context.enter('draw-line', { continueWayID: candidates[0].id, continueNodeID: continueFromNode.id });
  };


  operation.relatedEntityIds = function() {
    return candidates.length ? [candidates[0].id] : [];
  };


  operation.available = function() {
    const graph = context.systems.editor.staging.graph;
    return geometries.vertex.length === 1 && geometries.line.length <= 1 &&
      !filters.hasHiddenConnections(continueFromNode, graph);
  };


  operation.disabled = function() {
    if (candidates.length === 0) {
      return 'not_eligible';
    } else if (candidates.length > 1) {
      return 'multiple';
    }

    return false;
  };


  operation.tooltip = function() {
    const disabledReason = operation.disabled();
    return disabledReason ?
      l10n.t(`operations.continue.${disabledReason}`) :
      l10n.t('operations.continue.description');
  };


  operation.annotation = function() {
    return l10n.t('operations.continue.annotation.line');
  };


  operation.id = 'continue';
  operation.keys = [ l10n.t('operations.continue.key') ];
  operation.title = l10n.t('operations.continue.title');
  operation.behavior = new KeyOperationBehavior(context, operation);

  return operation;
}
