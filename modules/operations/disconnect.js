import { utilArrayUniq, utilGetAllNodes } from '@id-sdk/util';

import { t } from '../core/localizer';
import { actionDisconnect } from '../actions/disconnect';
import { BehaviorKeyOperation } from '../behaviors/BehaviorKeyOperation';
import { prefs } from '../core/preferences';
import { utilTotalExtent } from '../util/util';


export function operationDisconnect(context, selectedIDs) {
  const entities = selectedIDs.map(entityID => context.hasEntity(entityID)).filter(Boolean);
  const isNew = entities.every(entity => entity.isNew());

  let _vertexIDs = [];
  let _wayIDs = [];
  let _otherIDs = [];
  let _actions = [];

  entities.forEach(entity => {
    if (entity.type === 'way'){
      _wayIDs.push(entity.id);
    } else if (entity.geometry(context.graph()) === 'vertex') {
      _vertexIDs.push(entity.id);
    } else {
      _otherIDs.push(entity.id);
    }
  });

  let _coords;
  let _descriptionID = '';
  let _annotationID = 'features';
  let _disconnectingVertexIDs = [];
  let _disconnectingWayIDs = [];

  const graph = context.graph();

  if (_vertexIDs.length > 0) {
    // At the selected vertices, disconnect the selected ways, if any, else
    // disconnect all connected ways
    _disconnectingVertexIDs = _vertexIDs;

    _vertexIDs.forEach(vertexID => {
      const action = actionDisconnect(vertexID);

      if (_wayIDs.length > 0) {
        const waysIDsForVertex = _wayIDs.filter(wayID => {
          const way = graph.entity(wayID);
          return way.nodes.indexOf(vertexID) !== -1;
        });
        action.limitWays(waysIDsForVertex);
      }
      _actions.push(action);
      _disconnectingWayIDs = _disconnectingWayIDs
        .concat(graph.parentWays(graph.entity(vertexID)).map(d => d.id));
    });

    _disconnectingWayIDs = utilArrayUniq(_disconnectingWayIDs).filter(id => {
      return _wayIDs.indexOf(id) === -1;
    });

    _descriptionID += _actions.length === 1 ? 'single_point.' : 'multiple_points.';
    if (_wayIDs.length === 1) {
      _descriptionID += 'single_way.' + graph.geometry(_wayIDs[0]);
    } else {
      _descriptionID += _wayIDs.length === 0 ? 'no_ways' : 'multiple_ways';
    }

  } else if (_wayIDs.length > 0) {
    // Disconnect the selected ways from each other, if they're connected,
    // else disconnect them from all connected ways

    const ways = _wayIDs.map(wayID => graph.entity(wayID));
    const nodes = utilGetAllNodes(_wayIDs, graph);
    _coords = nodes.map(node => node.loc);

    // actions for connected nodes shared by at least two selected ways
    let sharedActions = [];
    let sharedNodes = [];
    // actions for connected nodes
    let unsharedActions = [];
    let unsharedNodes = [];

    nodes.forEach(node => {
      const action = actionDisconnect(node.id).limitWays(_wayIDs);
      if (action.disabled(graph) !== 'not_connected') {
        let count = 0;
        for (let i in ways) {
          const way = ways[i];
          if (way.nodes.indexOf(node.id) !== -1) {
            count += 1;
          }
          if (count > 1) break;
        }

        if (count > 1) {
          sharedActions.push(action);
          sharedNodes.push(node);
        } else {
          unsharedActions.push(action);
          unsharedNodes.push(node);
        }
      }
    });

    _descriptionID += 'no_points.';
    _descriptionID += _wayIDs.length === 1 ? 'single_way.' : 'multiple_ways.';

    if (sharedActions.length) {
      // if any nodes are shared, only disconnect the selected ways from each other
      _actions = sharedActions;
      _disconnectingVertexIDs = sharedNodes.map(node => node.id);
      _descriptionID += 'conjoined';
      _annotationID = 'from_each_other';
    } else {
      // if no nodes are shared, disconnect the selected ways from all connected ways
      _actions = unsharedActions;
      _disconnectingVertexIDs = unsharedNodes.map(node => node.id);
      if (_wayIDs.length === 1) {
        _descriptionID += graph.geometry(_wayIDs[0]);
      } else {
        _descriptionID += 'separate';
      }
    }
  }

  const extent = utilTotalExtent(_disconnectingVertexIDs, graph);


  let operation = function() {
    const combinedAction = function(graph) {
      _actions.forEach(action => {
        if (!action.disabled(graph)) {
          graph = action(graph);
        }
      });
      return graph;
    };
    context.perform(combinedAction, operation.annotation());
    context.validator().validate();
  };


  operation.relatedEntityIds = function() {
    if (_vertexIDs.length) {
      return _disconnectingWayIDs;
    }
    return _disconnectingVertexIDs;
  };


  operation.available = function() {
    if (_actions.length === 0) return false;
    if (_otherIDs.length !== 0) return false;

    if (_vertexIDs.length !== 0 && _wayIDs.length !== 0 && !_wayIDs.every(function(wayID) {
      return _vertexIDs.some(vertexID => {
        const way = context.entity(wayID);
        return way.nodes.indexOf(vertexID) !== -1;
      });
    })) return false;

    return true;
  };


  operation.disabled = function() {
    let disabledReason;
    for (const action of _actions) {
      disabledReason = action.disabled(context.graph());
      if (disabledReason) return disabledReason;
    }

    if (!isNew && tooLarge()) {
      return 'too_large.' + ((_vertexIDs.length ? _vertexIDs : _wayIDs).length === 1 ? 'single' : 'multiple');
    } else if (!isNew && _coords && notDownloaded()) {
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
        const missing = _coords.filter(loc => !osm.isDataLoaded(loc));
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
      t(`operations.disconnect.${disabledReason}`) :
      t(`operations.disconnect.description.${_descriptionID}`);
  };


  operation.annotation = function() {
    return t(`operations.disconnect.annotation.${_annotationID}`);
  };


  operation.id = 'disconnect';
  operation.keys = [ t('operations.disconnect.key') ];
  operation.title = t('operations.disconnect.title');
  operation.behavior = new BehaviorKeyOperation(context, operation);

  return operation;
}
