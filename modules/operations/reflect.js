import { utilGetAllNodes } from '@rapid-sdk/util';

import { actionReflect } from '../actions/reflect.js';
import { KeyOperationBehavior } from '../behaviors/KeyOperationBehavior.js';
import { utilTotalExtent } from '../util/util.js';


export function operationReflectShort(context, selectedIDs) {
  return operationReflect(context, selectedIDs, 'short');
}


export function operationReflectLong(context, selectedIDs) {
  return operationReflect(context, selectedIDs, 'long');
}


export function operationReflect(context, selectedIDs, axis = 'long') {
  const editor = context.systems.editor;
  const graph = editor.staging.graph;
  const l10n = context.systems.l10n;
  const storage = context.systems.storage;
  const viewport = context.viewport;

  const multi = selectedIDs.length === 1 ? 'single' : 'multiple';
  const entities = selectedIDs.map(entityID => graph.hasEntity(entityID)).filter(Boolean);
  const isNew = entities.every(entity => entity.isNew());
  const extent = utilTotalExtent(entities, graph);
  const nodes = utilGetAllNodes(selectedIDs, graph);
  const coords = nodes.map(node => node.loc);


  let operation = function() {
    const annotation = operation.annotation();
    const action = actionReflect(selectedIDs, context.viewport)
      .useLongAxis(Boolean(axis === 'long'));

    editor
      .performAsync(action)
      .then(() => editor.commit({ annotation: annotation, selectedIDs: selectedIDs }));
  };


  operation.available = function() {
    return nodes.length >= 3;
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
      l10n.t(`operations.reflect.${disabledReason}.${multi}`) :
      l10n.t(`operations.reflect.description.${axis}.${multi}`);
  };


  operation.annotation = function() {
    return l10n.t(`operations.reflect.annotation.${axis}.feature`, { n: selectedIDs.length });
  };

  operation.id = `reflect-${axis}`;
  operation.keys = [ l10n.t(`operations.reflect.key.${axis}`) ];
  operation.title = l10n.t(`operations.reflect.title.${axis}`);
  operation.behavior = new KeyOperationBehavior(context, operation);

  return operation;
}
