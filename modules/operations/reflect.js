import { utilGetAllNodes } from '@id-sdk/util';

import { t } from '../core/localizer';
import { actionReflect } from '../actions/reflect';
import { BehaviorKeyOperation } from '../behaviors/BehaviorKeyOperation';
import { prefs } from '../core/preferences';
import { utilTotalExtent } from '../util/util';


export function operationReflectShort(context, selectedIDs) {
  return operationReflect(context, selectedIDs, 'short');
}


export function operationReflectLong(context, selectedIDs) {
  return operationReflect(context, selectedIDs, 'long');
}


export function operationReflect(context, selectedIDs, axis = 'long') {
  const multi = selectedIDs.length === 1 ? 'single' : 'multiple';
  const entities = selectedIDs.map(entityID => context.hasEntity(entityID)).filter(Boolean);
  const isNew = entities.every(entity => entity.isNew());
  const extent = utilTotalExtent(entities, context.graph());
  const nodes = utilGetAllNodes(selectedIDs, context.graph());
  const coords = nodes.map(node => node.loc);


  let operation = function() {
    const action = actionReflect(selectedIDs, context.projection)
      .useLongAxis(Boolean(axis === 'long'));

    context.perform(action, operation.annotation());
    window.setTimeout(() => context.validator().validate(), 300);  // after any transition
  };


  operation.available = function() {
    return nodes.length >= 3;
  };


  operation.disabled = function() {
    if (!isNew && tooLarge()) {
      return 'too_large';
    } else if (!isNew && notDownloaded()) {
      return 'not_downloaded';
    } else if (selectedIDs.some(context.hasHiddenConnections)) {
      return 'connected_to_hidden';
    } else if (entities.some(incompleteRelation)) {
      return 'incomplete_relation';
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

    function incompleteRelation(entity) {
      return entity.type === 'relation' && !entity.isComplete(context.graph());
    }
  };


  operation.tooltip = function() {
    const disabledReason = operation.disabled();
    return disabledReason ?
      t(`operations.reflect.${disabledReason}.${multi}`) :
      t(`operations.reflect.description.${axis}.${multi}`);
  };


  operation.annotation = function() {
    return t(`operations.reflect.annotation.${axis}.feature`, { n: selectedIDs.length });
  };

  operation.id = `reflect-${axis}`;
  operation.keys = [ t(`operations.reflect.key.${axis}`) ];
  operation.title = t(`operations.reflect.title.${axis}`);
  operation.behavior = new BehaviorKeyOperation(context, operation);

  return operation;
}
