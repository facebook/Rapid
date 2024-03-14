import { utilGetAllNodes } from '@rapid-sdk/util';

import { KeyOperationBehavior } from '../behaviors/KeyOperationBehavior.js';
import { utilTotalExtent } from '../util/util.js';


export function operationMove(context, selectedIDs) {
  const editor = context.systems.editor;
  const graph = editor.staging.graph;
  const l10n = context.systems.l10n;
  const storage = context.systems.storage;
  const viewport = context.viewport;

  const multi = selectedIDs.length === 1 ? 'single' : 'multiple';
  const entities = selectedIDs.map(entityID => graph.hasEntity(entityID)).filter(Boolean);
  const isNew = entities.every(entity => entity.isNew());
  const nodes = utilGetAllNodes(selectedIDs, graph);
  const coords = nodes.map(node => node.loc);
  const extent = utilTotalExtent(entities, graph);


  let operation = function() {
    context.enter('move', { selection: { osm: selectedIDs }} );
  };


  operation.available = function() {
    return entities.length > 0;
  };


  operation.disabled = function() {
    const graph = editor.staging.graph;
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
      return !allowLargeEdits && extent.percentContainedIn(viewport.visibleExtent()) < 0.8;
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

    function incompleteRelation(entity) {
      return entity.type === 'relation' && !entity.isComplete(graph);
    }
  };


  operation.tooltip = function() {
    const disabledReason = operation.disabled();
    return disabledReason ?
      l10n.t(`operations.move.${disabledReason}.${multi}`) :
      l10n.t(`operations.move.description.${multi}`);
  };


  operation.annotation = function() {
    const graph = editor.staging.graph;
    return selectedIDs.length === 1 ?
      l10n.t('operations.move.annotation.' + graph.geometry(selectedIDs[0])) :
      l10n.t('operations.move.annotation.feature', { n: selectedIDs.length });
  };


  operation.id = 'move';
  operation.keys = [ l10n.t('operations.move.key') ];
  operation.title = l10n.t('operations.move.title');
  operation.behavior = new KeyOperationBehavior(context, operation);

  operation.mouseOnly = true;

  return operation;
}
