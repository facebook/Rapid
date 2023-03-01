import { utilGetAllNodes } from '@id-sdk/util';

import { t } from '../core/localizer';
import { BehaviorKeyOperation } from '../behaviors/BehaviorKeyOperation';
import { prefs } from '../core/preferences';
import { utilTotalExtent } from '../util/util';


export function operationMove(context, selectedIDs) {
  const multi = selectedIDs.length === 1 ? 'single' : 'multiple';
  const entities = selectedIDs.map(entityID => context.hasEntity(entityID)).filter(Boolean);
  const isNew = entities.every(entity => entity.isNew());
  const nodes = utilGetAllNodes(selectedIDs, context.graph());
  const coords = nodes.map(node => node.loc);
  const extent = utilTotalExtent(entities, context.graph());


  let operation = function() {
    const selection = new Map();
    for (const entityID of selectedIDs) {
      selection.set(entityID, context.entity(entityID));
    }
    context.enter('move', { selection: selection });
  };


  operation.available = function() {
    return entities.length > 0;
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
      t(`operations.move.${disabledReason}.${multi}`) :
      t(`operations.move.description.${multi}`);
  };


  operation.annotation = function() {
    return selectedIDs.length === 1 ?
      t('operations.move.annotation.' + context.graph().geometry(selectedIDs[0])) :
      t('operations.move.annotation.feature', { n: selectedIDs.length });
  };


  operation.id = 'move';
  operation.keys = [ t('operations.move.key') ];
  operation.title = t('operations.move.title');
  operation.behavior = new BehaviorKeyOperation(context, operation);

  operation.mouseOnly = true;

  return operation;
}
