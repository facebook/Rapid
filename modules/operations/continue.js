import { utilArrayGroupBy } from '@rapid-sdk/util';

import { BehaviorKeyOperation } from '../behaviors/BehaviorKeyOperation';


export function operationContinue(context, selectedIDs) {
  const entities = selectedIDs.map(entityID => context.hasEntity(entityID)).filter(Boolean);
  const geometries = Object.assign(
    { line: [], vertex: [] },
    utilArrayGroupBy(entities, entity => entity.geometry(context.graph()))
  );
  const continueFromNode = geometries.vertex.length === 1 && geometries.vertex[0];
  const candidates = candidateWays();


  function candidateWays() {
    if (!continueFromNode) return [];

    return context.graph().parentWays(continueFromNode).filter(parent => {
      return parent.geometry(context.graph()) === 'line' &&
        !parent.isClosed() &&
        parent.affix(continueFromNode.id) &&
        (geometries.line.length === 0 || geometries.line[0] === parent);
    });
  }


  let operation = function() {
    if (!candidates.length) return;

    context.enter('draw-line', { continueWay: candidates[0], continueNode: continueFromNode });
  };


  operation.relatedEntityIds = function() {
    return candidates.length ? [candidates[0].id] : [];
  };


  operation.available = function() {
    return geometries.vertex.length === 1 && geometries.line.length <= 1 &&
      !context.filterSystem().hasHiddenConnections(continueFromNode, context.graph());
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
      context.t(`operations.continue.${disabledReason}`) :
      context.t('operations.continue.description');
  };


  operation.annotation = function() {
    return context.t('operations.continue.annotation.line');
  };


  operation.id = 'continue';
  operation.keys = [ context.t('operations.continue.key') ];
  operation.title = context.t('operations.continue.title');
  operation.behavior = new BehaviorKeyOperation(context, operation);

  return operation;
}
