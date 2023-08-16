import { utilGetAllNodes } from '@rapid-sdk/util';

import { actionOrthogonalize } from '../actions/orthogonalize';
import { KeyOperationBehavior } from '../behaviors/KeyOperationBehavior';
import { utilTotalExtent } from '../util';


export function operationOrthogonalize(context, selectedIDs) {
  const multi = selectedIDs.length === 1 ? 'single' : 'multiple';
  const entities = selectedIDs.map(entityID => context.hasEntity(entityID)).filter(Boolean);
  const isNew = entities.every(entity => entity.isNew());
  const extent = utilTotalExtent(entities, context.graph());

  let _type;   // 'feature' or 'corner'
  const actions = entities.map(getAction).filter(Boolean);
  const coords = utilGetAllNodes(selectedIDs, context.graph()).map(node => node.loc);


  function getAction(entity) {
    const graph = context.graph();
    const geometry = entity.geometry(graph);

    // square a line/area
    if (entity.type === 'way' && new Set(entity.nodes).size > 2) {
      if (_type && _type !== 'feature') return null;
      _type = 'feature';
      return actionOrthogonalize(entity.id, context.projection);

    // square a single vertex
    } else if (geometry === 'vertex') {
      if (_type && _type !== 'corner') return null;
      _type = 'corner';
      const parents = graph.parentWays(entity);
      if (parents.length === 1) {
        const way = parents[0];
        if (way.nodes.indexOf(entity.id) !== -1) {
          return actionOrthogonalize(way.id, context.projection, entity.id);
        }
      }
    }

    return null;
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
    window.setTimeout(() => context.systems.validator.validate(), 300);  // after any transition
  };


  operation.available = function() {
    return actions.length && selectedIDs.length === actions.length;
  };


  operation.disabled = function() {
    if (!actions.length) return '';

    const disabledReasons = actions.map(action => action.disabled(context.graph())).filter(Boolean);
    if (disabledReasons.length === actions.length) {   // none of the features can be squared
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
      const prefs = context.systems.storage;
      const allowLargeEdits = prefs.getItem('rapid-internal-feature.allowLargeEdits') === 'true';
      return !allowLargeEdits && extent.percentContainedIn(context.systems.map.extent()) < 0.8;
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
      context.t(`operations.orthogonalize.${disabledReason}.${multi}`) :
      context.t(`operations.orthogonalize.description.${_type}.${multi}`);
  };


  operation.annotation = function() {
    return context.t('operations.orthogonalize.annotation.' + _type, { n: actions.length });
  };


  operation.id = 'orthogonalize';
  operation.keys = [ context.t('operations.orthogonalize.key') ];
  operation.title = context.t('operations.orthogonalize.title');
  operation.behavior = new KeyOperationBehavior(context, operation);

  return operation;
}
