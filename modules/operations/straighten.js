import { utilArrayDifference, utilGetAllNodes } from '@rapid-sdk/util';

import { actionStraightenNodes } from '../actions/straighten_nodes.js';
import { actionStraightenWay } from '../actions/straighten_way.js';
import { KeyOperationBehavior } from '../behaviors/KeyOperationBehavior.js';
import { utilTotalExtent } from '../util/index.js';


export function operationStraighten(context, selectedIDs) {
  const editor = context.systems.editor;
  const graph = editor.staging.graph;
  const l10n = context.systems.l10n;
  const storage = context.systems.storage;
  const viewport = context.viewport;

  const entities = selectedIDs.map(entityID => graph.hasEntity(entityID)).filter(Boolean);
  const isNew = entities.every(entity => entity.isNew());

  const ways = entities.filter(entity => entity.type === 'way');
  const wayIDs = ways.map(entity => entity.id);
  const nodes = entities.filter(entity => entity.type === 'node');
  const nodeIDs = nodes.map(entity => entity.id);
  const multi = ((ways.length ? ways : nodes).length === 1 ? 'single' : 'multiple');

  const coords = utilGetAllNodes(selectedIDs, graph).map(node => node.loc);
  let extent = utilTotalExtent(selectedIDs, graph);
  let geometry;  // 'point' or 'line'

  const action = chooseAction();


  function chooseAction() {
    const graph = editor.staging.graph;

    // straighten selected nodes
    if (ways.length === 0 && nodes.length > 2) {
      geometry = 'point';
      return actionStraightenNodes(nodeIDs, context.viewport);

    // straighten selected ways (possibly between range of 2 selected nodes)
    } else if (ways.length > 0 && (nodes.length === 0 || nodes.length === 2)) {
      let startNodeIDs = [];
      let endNodeIDs = [];

      // check the selected ways, gather their start/end nodes
      for (const entity of entities) {
        if (entity.type !== 'way') continue;
        if (entity.type === 'way' && entity.isClosed()) return null;  // exit early, can't straighten these

        startNodeIDs.push(entity.first());
        endNodeIDs.push(entity.last());
      }

      // Remove duplicate start/endNodeIDs (duplicate nodes cannot be at the line end)
      startNodeIDs = startNodeIDs.filter(nodeID => startNodeIDs.indexOf(nodeID) === startNodeIDs.lastIndexOf(nodeID));
      endNodeIDs = endNodeIDs.filter(nodeID => endNodeIDs.indexOf(nodeID) === endNodeIDs.lastIndexOf(nodeID));

      // Ensure all ways are connected (i.e. only 2 unique endpoints/startpoints)
      if (utilArrayDifference(startNodeIDs, endNodeIDs).length +
        utilArrayDifference(endNodeIDs, startNodeIDs).length !== 2) return null;

      // Ensure path contains at least 3 unique nodes
      const wayNodeIDs = utilGetAllNodes(wayIDs, graph).map(node => node.id);
      if (wayNodeIDs.length <= 2) return null;

      // If range of 2 selected nodes is supplied, ensure nodes lie on the selected path
      if (nodeIDs.length === 2 &&
        (wayNodeIDs.indexOf(nodeIDs[0]) === -1 || wayNodeIDs.indexOf(nodeIDs[1]) === -1)
      ) return null;

      if (nodeIDs.length) {
        // If we're only straightenting between two points, we only need that extent visible
        extent = utilTotalExtent(nodeIDs, graph);
      }

      geometry = 'line';
      return actionStraightenWay(selectedIDs, context.viewport);
    }

    return null;
  }


  let operation = function() {
    if (!action) return;

    const annotation = operation.annotation();
    editor
      .performAsync(action)
      .then(() => editor.commit({ annotation: annotation, selectedIDs: selectedIDs }));
  };


  operation.available = function() {
    return Boolean(action);
  };


  operation.disabled = function() {
    const graph = editor.staging.graph;
    const disabledReason = action.disabled(graph);

    if (disabledReason) {
      return disabledReason;
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
  };


  operation.tooltip = function() {
    const disabledReason = operation.disabled();
    return disabledReason ?
      l10n.t(`operations.straighten.${disabledReason}.${multi}`) :
      l10n.t(`operations.straighten.description.${geometry}` + (ways.length === 1 ? '' : 's'));
  };


  operation.annotation = function() {
    return l10n.t(`operations.straighten.annotation.${geometry}`, { n: ways.length ? ways.length : nodes.length });
  };


  operation.id = 'straighten';
  operation.keys = [ l10n.t('operations.straighten.key') ];
  operation.title = l10n.t('operations.straighten.title');
  operation.behavior = new KeyOperationBehavior(context, operation);

  return operation;
}
