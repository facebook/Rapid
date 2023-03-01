import { utilGetAllNodes } from '@id-sdk/util';

import { t } from '../core/localizer';
import { actionCircularize } from '../actions/circularize';
import { BehaviorKeyOperation } from '../behaviors/BehaviorKeyOperation';
import { prefs } from '../core/preferences';
import { utilTotalExtent } from '../util';


export function operationCircularize(context, selectedIDs) {
  const multi = selectedIDs.length === 1 ? 'single' : 'multiple';
  const entities = selectedIDs.map(entityID => context.hasEntity(entityID)).filter(Boolean);
  const isNew = entities.every(entity => entity.isNew());
  const extent = utilTotalExtent(entities, context.graph());
  const actions = entities.map(getAction).filter(Boolean);
  const coords = utilGetAllNodes(selectedIDs, context.graph()).map(node => node.loc);


  function getAction(entity) {
    if (entity.type !== 'way' || new Set(entity.nodes).size <= 1) return null;
    return actionCircularize(entity.id, context.projection);
  }


  let operation = function() {
    if (!actions.length) return;

    let combinedAction = function(graph, t) {
      actions.forEach(action => {
        if (!action.disabled(graph)) {
          graph = action(graph, t);
        }
      });
      return graph;
    };
    combinedAction.transitionable = true;

    context.perform(combinedAction, operation.annotation());
    window.setTimeout(() => context.validator().validate(), 300);  // after any transition
  };


  operation.available = function() {
    return actions.length && selectedIDs.length === actions.length;
  };


  // don't cache this because the visible extent could change
  operation.disabled = function() {
    if (!actions.length) return '';

    const disabledReasons = actions.map(action => action.disabled(context.graph())).filter(Boolean);
    if (disabledReasons.length === actions.length) {  // none of the features can be circularized
      if (new Set(disabledReasons).size > 1) {
        return 'multiple_blockers';
      }
      return disabledReasons[0];
    } else if (!isNew && tooLarge()) {
      return 'too_large';
    } else if (!isNew && notDownloaded()) {
      return 'not_downloaded';
    } else if (selectedIDs.some(context.hasHiddenConnections)) {
      return 'connected_to_hidden';
    }

    return false;

    // If the selection is not 80% contained in view
    function tooLarge() {
      const allowLargeEdits = prefs('rapid-internal-feature.allowLargeEdits') === 'true';
      return !allowLargeEdits && extent.percentContainedIn(context.map().extent()) < 0.8;
    }

    // If fhe selection spans tiles that haven't been downloaded yet
    function notDownloaded() {
      if (context.inIntro()) return false;
      const osm = context.connection();
      if (osm) {
        const missing = coords.filter(loc => !osm.isDataLoaded(loc));
        if (missing.length) {
          missing.forEach(loc => context.loadTileAtLoc(loc));
          return true;
        }
      }
      return false;
    }
  };


  operation.tooltip = function() {
    const disabledReason = operation.disabled();
    return disabledReason ?
      t(`operations.circularize.${disabledReason}.${multi}`) :
      t(`operations.circularize.description.${multi}`);
  };


  operation.annotation = function() {
    return t('operations.circularize.annotation.feature', { n: actions.length });
  };


  operation.id = 'circularize';
  operation.keys = [ t('operations.circularize.key') ];
  operation.title = t('operations.circularize.title');
  operation.behavior = new BehaviorKeyOperation(context, operation);

  return operation;
}
