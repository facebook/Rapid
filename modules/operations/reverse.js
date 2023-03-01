import { t } from '../core/localizer';
import { actionReverse } from '../actions/reverse';
import { BehaviorKeyOperation } from '../behaviors/BehaviorKeyOperation';


export function operationReverse(context, selectedIDs) {
  const actions = selectedIDs.map(getAction).filter(Boolean);
  const reverseType = getReverseType();


  function getAction(entityID) {
    const entity = context.hasEntity(entityID);
    if (!entity) return null;

    const geometry = entity.geometry(context.graph());
    if (entity.type !== 'node' && geometry !== 'line') return null;

    const action = actionReverse(entityID);
    if (action.disabled(context.graph())) return null;

    return action;
  }


  function getReverseType() {
    const nodeActionCount = actions.filter(action => {
      const entity = context.hasEntity(action.entityID());
      return entity?.type === 'node';
    }).length;

    if (nodeActionCount === 0) return 'line';
    if (nodeActionCount === actions.length) return 'point';
    return 'feature';
  }



  let operation = function() {
    if (!actions.length) return;

    let combinedAction = function(graph) {
      for (const action of actions) {
        graph = action(graph);
      }
      return graph;
    };

    context.perform(combinedAction, operation.annotation());
    context.validator().validate();
  };


  operation.available = function() {
    return actions.length > 0;
  };


  operation.disabled = function() {
    return false;
  };


  operation.tooltip = function() {
    return t(`operations.reverse.description.${reverseType}`);
  };


  operation.annotation = function() {
    return t(`operations.reverse.annotation.${reverseType}`, { n: actions.length });
  };


  operation.id = 'reverse';
  operation.keys = [ t('operations.reverse.key') ];
  operation.title = t('operations.reverse.title');
  operation.behavior = new BehaviorKeyOperation(context, operation);

  return operation;
}
