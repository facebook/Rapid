import { utilGetAllNodes } from '@rapid-sdk/util';

import { KeyOperationBehavior } from '../behaviors/KeyOperationBehavior';
import { utilTotalExtent } from '../util/util';


export function operationRotate(context, selectedIDs) {
  const map = context.systems.map;
  const storage = context.systems.storage;

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
      const allowLargeEdits = storage.getItem('rapid-internal-feature.allowLargeEdits') === 'true';
      return !allowLargeEdits && extent.percentContainedIn(map.extent()) < 0.8;
    }

    // If fhe selection spans tiles that haven't been downloaded yet
    function notDownloaded() {
      if (context.inIntro) return false;
      const osm = context.services.osm;
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
      context.t(`operations.rotate.${disabledReason}.${multi}`) :
      context.t(`operations.rotate.description.${multi}`);
  };


  operation.annotation = function() {
    return selectedIDs.length === 1 ?
      context.t('operations.rotate.annotation.' + context.graph().geometry(selectedIDs[0])) :
      context.t('operations.rotate.annotation.feature', { n: selectedIDs.length });
  };


  operation.id = 'rotate';
  operation.keys = [ context.t('operations.rotate.key') ];
  operation.title = context.t('operations.rotate.title');
  operation.behavior = new KeyOperationBehavior(context, operation);

  operation.mouseOnly = true;

  return operation;
}
