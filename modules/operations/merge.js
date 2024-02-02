import { actionJoin } from '../actions/join.js';
import { actionMerge } from '../actions/merge.js';
import { actionMergeNodes } from '../actions/merge_nodes.js';
import { actionMergePolygon } from '../actions/merge_polygon.js';

import { KeyOperationBehavior } from '../behaviors/KeyOperationBehavior.js';


export function operationMerge(context, selectedIDs) {
  const editor = context.systems.editor;
  const l10n = context.systems.l10n;
  const presets = context.systems.presets;
  const storage = context.systems.storage;

  let action = chooseAction();

  function chooseAction() {
    const graph = editor.staging.graph;
    const tagnosticRoadCombine = storage.getItem('rapid-internal-feature.tagnosticRoadCombine') === 'true';
    const options = { tagnosticRoadCombine: tagnosticRoadCombine };

    // prefer a non-disabled action first
    const join = actionJoin(selectedIDs, options);
    if (!join.disabled(graph)) return join;

    const merge = actionMerge(selectedIDs);
    if (!merge.disabled(graph)) return merge;

    const mergePolygon = actionMergePolygon(selectedIDs);
    if (!mergePolygon.disabled(graph)) return mergePolygon;

    const mergeNodes = actionMergeNodes(selectedIDs);
    if (!mergeNodes.disabled(graph)) return mergeNodes;

    // otherwise prefer an action with an interesting disabled reason
    if (join.disabled(graph) !== 'not_eligible') return join;
    if (merge.disabled(graph) !== 'not_eligible') return merge;
    if (mergePolygon.disabled(graph) !== 'not_eligible') return mergePolygon;

    return mergeNodes;
  }


  let operation = function() {
    if (operation.disabled()) return;

    const annotation = operation.annotation();
    editor.perform(action);
    editor.commit({ annotation: annotation, selectedIDs: selectedIDs });

    const graph = editor.staging.graph;  // after edit
    let successorIDs = selectedIDs.filter(entityID => graph.hasEntity(entityID));
    if (successorIDs.length > 1) {
      const interestingIDs = successorIDs.filter(entityID => graph.entity(entityID).hasInterestingTags());
      if (interestingIDs.length) {
        successorIDs = interestingIDs;
      }
    }
    context.enter('select-osm', { selection: { osm: successorIDs }} );
  };


  operation.available = function() {
    return selectedIDs.length >= 2;
  };


  operation.disabled = function() {
    const graph = editor.staging.graph;
    const actionDisabled = action.disabled(graph);
    if (actionDisabled) return actionDisabled;

    const osm = context.services.osm;
    if (osm && action.resultingWayNodesLength && action.resultingWayNodesLength(graph) > osm.maxWayNodes) {
      return 'too_many_vertices';
    }

    return false;
  };


  operation.tooltip = function() {
    const disabledReason = operation.disabled();

    if (disabledReason) {
      if (disabledReason === 'conflicting_relations') {
        return l10n.t('operations.merge.conflicting_relations');
      } else if (disabledReason === 'restriction' || disabledReason === 'connectivity') {
        const preset = presets.item('type/' + disabledReason);
        return l10n.t('operations.merge.damage_relation', { relation: preset.name() });
      } else {
        return l10n.t(`operations.merge.${disabledReason}`);
      }
    } else {
      return l10n.t('operations.merge.description');
    }
  };


  operation.annotation = function() {
    return l10n.t('operations.merge.annotation', { n: selectedIDs.length });
  };


  operation.id = 'merge';
  operation.keys = [ l10n.t('operations.merge.key') ];
  operation.title = l10n.t('operations.merge.title');
  operation.behavior = new KeyOperationBehavior(context, operation);

  return operation;
}
