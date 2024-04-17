import { geoSphericalDistance } from '@rapid-sdk/math';
import { utilGetAllNodes } from '@rapid-sdk/util';

import { actionDeleteMultiple } from '../actions/delete_multiple.js';
import { KeyOperationBehavior } from '../behaviors/KeyOperationBehavior.js';
import { uiCmd } from '../ui/cmd.js';
import { utilTotalExtent } from '../util/index.js';


export function operationDelete(context, selectedIDs) {
  const editor = context.systems.editor;
  const graph = editor.staging.graph;
  const l10n = context.systems.l10n;
  const map = context.systems.map;
  const storage = context.systems.storage;
  const viewport = context.viewport;

  const multi = selectedIDs.length === 1 ? 'single' : 'multiple';
  const entities = selectedIDs.map(entityID => graph.hasEntity(entityID)).filter(Boolean);
  const isNew = entities.every(entity => entity.isNew());
  const action = actionDeleteMultiple(selectedIDs);
  const nodes = utilGetAllNodes(selectedIDs, graph);
  const coords = nodes.map(node => node.loc);
  const extent = utilTotalExtent(entities, graph);


  let operation = function() {
    const graph = editor.staging.graph;
    let nextNode;
    let nextLoc;

    // If we are deleting a vertex, try to select the next nearest vertex along the way.
    if (entities.length === 1) {
      const entity = entities[0];
      const geometry = entity.geometry(graph);
      const parents = graph.parentWays(entity);
      const parent = parents[0];

      // Select the next closest node in the way.
      if (geometry === 'vertex') {
        const nodes = parent.nodes;
        let i = nodes.indexOf(entity.id);

        if (i === 0) {
          i++;
        } else if (i === nodes.length - 1) {
          i--;
        } else {
          const a = geoSphericalDistance(entity.loc, graph.entity(nodes[i - 1]).loc);
          const b = geoSphericalDistance(entity.loc, graph.entity(nodes[i + 1]).loc);
          i = a < b ? i - 1 : i + 1;
        }

        nextNode = graph.entity(nodes[i]);
        nextLoc = nextNode.loc;
      }
    }

    const annotation = operation.annotation();  // watch out! calculate this _before_ we delete the stuff.
    editor.perform(action);
    editor.commit({ annotation: annotation, selectedIDs: selectedIDs });

    if (nextNode && nextLoc) {
      map.centerEase(nextLoc);
      // Try to select the next node.
      // It may be deleted and that's ok, we'll fallback to browse mode automatically
      context.enter('select-osm', { selection: { osm: [nextNode.id] }} );
    } else {
      context.enter('browse');
    }
  };


  operation.available = function() {
    return true;
  };


  operation.disabled = function() {
    const graph = editor.staging.graph;

    if (!isNew && tooLarge()) {
      return 'too_large';
    } else if (!isNew && notDownloaded()) {
      return 'not_downloaded';
    } else if (selectedIDs.some(context.hasHiddenConnections)) {
      return 'connected_to_hidden';
    } else if (selectedIDs.some(protectedMember)) {
      return 'part_of_relation';
    } else if (selectedIDs.some(incompleteRelation)) {
      return 'incomplete_relation';
    } else if (selectedIDs.some(hasWikidataTag)) {
      return 'has_wikidata_tag';
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

    function hasWikidataTag(id) {
      const entity = graph.entity(id);
      return entity.tags.wikidata && entity.tags.wikidata.trim().length > 0;
    }

    function incompleteRelation(id) {
      const entity = graph.entity(id);
      return entity.type === 'relation' && !entity.isComplete(graph);
    }

    function protectedMember(id) {
      const entity = graph.entity(id);
      if (entity.type !== 'way') return false;

      const parents = graph.parentRelations(entity);
      for (const parent of parents) {
        const type = parent.tags.type;
        const role = parent.memberById(id).role || 'outer';
        if (type === 'route' || type === 'boundary' || (type === 'multipolygon' && role === 'outer')) {
          return true;
        }
      }
      return false;
    }
  };


  operation.tooltip = function() {
    const disabledReason = operation.disabled();
    return disabledReason ?
      l10n.t(`operations.delete.${disabledReason}.${multi}`) :
      l10n.t(`operations.delete.description.${multi}`);
  };


  operation.annotation = function() {
    const graph = editor.staging.graph;
    return selectedIDs.length === 1 ?
      l10n.t('operations.delete.annotation.' + graph.geometry(selectedIDs[0])) :
      l10n.t('operations.delete.annotation.feature', { n: selectedIDs.length });
  };


  operation.id = 'delete';
  operation.keys = [ uiCmd('⌘⌫'), uiCmd('⌘⌦'), uiCmd('⌦') ];
  operation.title = l10n.t('operations.delete.title');
  operation.behavior = new KeyOperationBehavior(context, operation);

  return operation;
}
