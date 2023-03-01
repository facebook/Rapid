import { t } from '../core/localizer';
import { actionSplit } from '../actions/split';
import { BehaviorKeyOperation } from '../behaviors/BehaviorKeyOperation';
import { modeSelect } from '../modes/select';


export function operationSplit(context, selectedIDs) {
  const graph = context.graph();
  const entities = selectedIDs.map(entityID => context.hasEntity(entityID)).filter(Boolean);

  const vertices = entities.filter(entity => entity.type === 'node' && entity.geometry(graph) === 'vertex');
  const vertexIDs = vertices.map(entity => entity.id);
  const vertexMulti = vertexIDs.length === 1 ? 'single' : 'multiple';

  const ways = entities.filter(entity => entity.type === 'way');
  const wayIDs = ways.map(entity => entity.id);

  const isAvailable = vertices.length > 0 && (vertices.length + ways.length === selectedIDs.length);
  const action = actionSplit(vertexIDs);

  let _geometry = 'feature';   // 'line', 'area', or 'feature'
  let _splittable = [];
  let _waysMulti = 'single';


  if (isAvailable) {
    if (wayIDs.length) {
      action.limitWays(wayIDs);
    }

    _splittable = action.ways(graph);

    // Check the geometries of the splittable ways (line or area)
    let geometries = new Set();
    for (const way of _splittable) {
      geometries.add(way.geometry(graph));
    }
    // Are all splittable ways same geometry?  (line or area)
    // (this only affects messages shown in annotation and tooltip)
    if (geometries.size === 1) {
      _geometry = Array.from(geometries)[0];
    }

    _waysMulti = _splittable.length === 1 ? 'single' : 'multiple';
  }


  let operation = function() {
    const difference = context.perform(action, operation.annotation());
    context.validator().validate();

    let idsToSelect = vertexIDs.slice();  // copy

    // select both the nodes and the ways so the mapper can immediately disconnect them if desired
    for (const [entityID, change] of difference.changes) {
      const entity = change.head;
      if (entity && entity.type === 'way') {
        idsToSelect.push(entityID);
      }
    }
    context.enter(modeSelect(context, idsToSelect));
  };


  operation.relatedEntityIds = function() {
    return _splittable.map(way => way.id);
  };


  operation.available = function() {
    return isAvailable;
  };


  operation.disabled = function() {
    const disabledReason = action.disabled(context.graph());
    if (disabledReason) {
      return disabledReason;
    } else if (selectedIDs.some(context.hasHiddenConnections)) {
      return 'connected_to_hidden';
    }
    return false;
  };


  operation.tooltip = function() {
    const disabledReason = operation.disabled();
    return disabledReason ?
      t(`operations.split.${disabledReason}`) :
      t(`operations.split.description.${_geometry}.${_waysMulti}.${vertexMulti}_node`);
  };


  operation.annotation = function() {
    return t(`operations.split.annotation.${_geometry}`, { n: _splittable.length });
  };


  operation.id = 'split';
  operation.keys = [ t('operations.split.key') ];
  operation.title = t('operations.split.title');
  operation.behavior = new BehaviorKeyOperation(context, operation);

  return operation;
}
