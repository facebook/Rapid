import { t } from '../core/localizer';

import { actionJoin } from '../actions/join';
import { actionMerge } from '../actions/merge';
import { actionMergeNodes } from '../actions/merge_nodes';
import { actionMergePolygon } from '../actions/merge_polygon';

import { BehaviorKeyOperation } from '../behaviors/BehaviorKeyOperation';
import { modeSelect } from '../modes/select';


export function operationMerge(context, selectedIDs) {
  let action = chooseAction();

  function chooseAction() {
    const prefs = context.storageSystem();
    const tagnosticRoadCombine = prefs.getItem('rapid-internal-feature.tagnosticRoadCombine') === 'true';
    const options = { tagnosticRoadCombine: tagnosticRoadCombine };

    // prefer a non-disabled action first
    const join = actionJoin(selectedIDs, options);
    if (!join.disabled(context.graph())) return join;

    const merge = actionMerge(selectedIDs);
    if (!merge.disabled(context.graph())) return merge;

    const mergePolygon = actionMergePolygon(selectedIDs);
    if (!mergePolygon.disabled(context.graph())) return mergePolygon;

    const mergeNodes = actionMergeNodes(selectedIDs);
    if (!mergeNodes.disabled(context.graph())) return mergeNodes;

    // otherwise prefer an action with an interesting disabled reason
    if (join.disabled(context.graph()) !== 'not_eligible') return join;
    if (merge.disabled(context.graph()) !== 'not_eligible') return merge;
    if (mergePolygon.disabled(context.graph()) !== 'not_eligible') return mergePolygon;

    return mergeNodes;
  }


  let operation = function() {
    if (operation.disabled()) return;

    context.perform(action, operation.annotation());
    context.validator().validate();

    let successorIDs = selectedIDs.filter(entityID => context.hasEntity(entityID));
    if (successorIDs.length > 1) {
      const interestingIDs = successorIDs.filter(entityID => context.entity(entityID).hasInterestingTags());
      if (interestingIDs.length) {
        successorIDs = interestingIDs;
      }
    }
    context.enter(modeSelect(context, successorIDs));
  };


  operation.available = function() {
    return selectedIDs.length >= 2;
  };


  operation.disabled = function() {
    const actionDisabled = action.disabled(context.graph());
    if (actionDisabled) return actionDisabled;

    const osm = context.services.get('osm');
    if (osm && action.resultingWayNodesLength && action.resultingWayNodesLength(context.graph()) > osm.maxWayNodes) {
      return 'too_many_vertices';
    }

    return false;
  };


  operation.tooltip = function() {
    const disabledReason = operation.disabled();
    const presetSystem = context.presetSystem();

    if (disabledReason) {
      if (disabledReason === 'conflicting_relations') {
        return t('operations.merge.conflicting_relations');
      } else if (disabledReason === 'restriction' || disabledReason === 'connectivity') {
        const preset = presetSystem.item('type/' + disabledReason);
        return t('operations.merge.damage_relation', { relation: preset.name() });
      } else {
        return t(`operations.merge.${disabledReason}`);
      }
    } else {
      return t('operations.merge.description');
    }
  };


  operation.annotation = function() {
    return t('operations.merge.annotation', { n: selectedIDs.length });
  };


  operation.id = 'merge';
  operation.keys = [ t('operations.merge.key') ];
  operation.title = t('operations.merge.title');
  operation.behavior = new BehaviorKeyOperation(context, operation);

  return operation;
}
