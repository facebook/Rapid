import { actionReverse } from '../actions/reverse.js';
import { KeyOperationBehavior } from '../behaviors/KeyOperationBehavior.js';


export function operationReverse(context, selectedIDs) {
  const editor = context.systems.editor;
  const l10n = context.systems.l10n;

  const actions = selectedIDs.map(getAction).filter(Boolean);
  const reverseType = getReverseType();


  function getAction(entityID) {
    const graph = editor.staging.graph;
    const entity = graph.hasEntity(entityID);
    if (!entity) return null;

    const geometry = entity.geometry(graph);
    if (entity.type !== 'node' && geometry !== 'line') return null;

    const action = actionReverse(entityID);
    if (action.disabled(graph)) return null;

    return action;
  }


  function getReverseType() {
    const graph = editor.staging.graph;
    const nodeActionCount = actions.filter(action => {
      const entity = graph.hasEntity(action.entityID());
      return entity?.type === 'node';
    }).length;

    if (nodeActionCount === 0) return 'line';
    if (nodeActionCount === actions.length) return 'point';
    return 'feature';
  }



  let operation = function() {
    if (!actions.length) return;

    const combinedAction = function(graph) {
      for (const action of actions) {
        graph = action(graph);
      }
      return graph;
    };

    const annotation = operation.annotation();
    editor.perform(combinedAction);
    editor.commit({ annotation: annotation, selectedIDs: selectedIDs });
  };


  operation.available = function() {
    return actions.length > 0;
  };


  operation.disabled = function() {
    return false;
  };


  operation.tooltip = function() {
    return l10n.t(`operations.reverse.description.${reverseType}`);
  };


  operation.annotation = function() {
    return l10n.t(`operations.reverse.annotation.${reverseType}`, { n: actions.length });
  };


  operation.id = 'reverse';
  operation.keys = [ l10n.t('operations.reverse.key') ];
  operation.title = l10n.t('operations.reverse.title');
  operation.behavior = new KeyOperationBehavior(context, operation);

  return operation;
}
