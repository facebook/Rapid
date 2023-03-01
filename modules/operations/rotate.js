import { utilGetAllNodes } from '@id-sdk/util';

import { t } from '../core/localizer';
import { BehaviorKeyOperation } from '../behaviors/BehaviorKeyOperation';
import { prefs } from '../core/preferences';
import { utilTotalExtent } from '../util/util';


export function operationRotate(context, selectedIDs) {
  const multi = selectedIDs.length === 1 ? 'single' : 'multiple';
  const entities = selectedIDs.map(entityID => context.hasEntity(entityID)).filter(Boolean);
  const isNew = entities.every(entity => entity.isNew());
  const extent = utilTotalExtent(entities, context.graph());
  const nodes = utilGetAllNodes(selectedIDs, context.graph());
  const coords = nodes.map(node => node.loc);


  let operation = function() {
    const selection = new Map();
    for (const entityID of selectedIDs) {
      selection.set(entityID, context.entity(entityID));
    }
    context.enter('rotate', { selection: selection });
  };


  operation.available = function() {
    return nodes.length >= 2;
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

    // If fhe selection involves a relation that has not been completely downloaded
    function incompleteRelation(entity) {
      return entity.type === 'relation' && !entity.isComplete(context.graph());
    }
  };


  operation.tooltip = function() {
    const disabledReason = operation.disabled();
    return disabledReason ?
      t(`operations.rotate.${disabledReason}.${multi}`) :
      t(`operations.rotate.description.${multi}`);
  };


  operation.annotation = function() {
    return selectedIDs.length === 1 ?
      t('operations.rotate.annotation.' + context.graph().geometry(selectedIDs[0])) :
      t('operations.rotate.annotation.feature', { n: selectedIDs.length });
  };


  operation.id = 'rotate';
  operation.keys = [ t('operations.rotate.key') ];
  operation.title = t('operations.rotate.title');
  operation.behavior = new BehaviorKeyOperation(context, operation);

  operation.mouseOnly = true;

  return operation;
}
