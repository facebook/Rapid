import { utilArrayGroupBy } from '@rapid-sdk/util';

import { KeyOperationBehavior } from '../behaviors/KeyOperationBehavior.js';
import { uiCmd } from '../ui/cmd.js';
import { utilTotalExtent } from '../util/index.js';


export function operationCopy(context, selectedIDs) {
  const editor = context.systems.editor;
  const graph = editor.staging.graph;
  const l10n = context.systems.l10n;
  const storage = context.systems.storage;
  const viewport = context.viewport;

  const entities = selectedIDs
    .map(entityID => graph.hasEntity(entityID))
    .filter(entity => {
      // don't copy untagged vertices separately from ways
      return entity && (entity.hasInterestingTags() || entity.geometry(graph) !== 'vertex');
    });

  const isNew = entities.every(entity => entity.isNew());
  const extent = utilTotalExtent(entities, graph);


  let _point;

  let operation = function() {
    const graph = editor.staging.graph;
    let selected = Object.assign({ relation: [], way: [], node: [] }, utilArrayGroupBy(entities, 'type'));
    let canCopy = [];
    let skip = {};
    let entity;
    let i;

    for (i = 0; i < selected.relation.length; i++) {
      entity = selected.relation[i];
      if (!skip[entity.id] && entity.isComplete(graph)) {
        canCopy.push(entity.id);
        skip = getDescendants(entity.id, graph, skip);
      }
    }
    for (i = 0; i < selected.way.length; i++) {
      entity = selected.way[i];
      if (!skip[entity.id]) {
        canCopy.push(entity.id);
        skip = getDescendants(entity.id, graph, skip);
      }
    }
    for (i = 0; i < selected.node.length; i++) {
      entity = selected.node[i];
      if (!skip[entity.id]) {
        canCopy.push(entity.id);
      }
    }

    context.copyIDs = canCopy;

    if (_point && (canCopy.length !== 1 || graph.entity(canCopy[0]).type !== 'node')) {
      // store the anchor coordinates if copying more than a single node
      context.copyLoc = context.viewport.unproject(_point);
    } else {
      context.copyLoc = null;
    }
  };


  function getDescendants(id, graph, descendants) {
    let entity = graph.entity(id);
    let children;

    descendants = descendants || {};

    if (entity.type === 'relation') {
      children = entity.members.map(member => member.id);
    } else if (entity.type === 'way') {
      children = entity.nodes;
    } else {
      children = [];
    }

    for (let i = 0; i < children.length; i++) {
      if (!descendants[children[i]]) {
        descendants[children[i]] = true;
        descendants = getDescendants(children[i], graph, descendants);
      }
    }

    return descendants;
  }


  operation.available = function() {
    return entities.length > 0;
  };


  operation.disabled = function() {
    if (!isNew && tooLarge()) {
      return 'too_large';
    }
    return false;

    // If the selection is not 80% contained in view
    function tooLarge() {
      const allowLargeEdits = storage.getItem('rapid-internal-feature.allowLargeEdits') === 'true';
      return !allowLargeEdits && extent.percentContainedIn(viewport.visibleExtent()) < 0.8;
    }
  };


  operation.availableForKeypress = function() {
    // if the user has text selected then let them copy that, not the selected feature
    const selection = window.getSelection && window.getSelection();
    return !selection || !selection.toString();
  };


  operation.tooltip = function() {
    const disabledReason = operation.disabled();
    return disabledReason ?
      l10n.t(`operations.copy.${disabledReason}`, { n: selectedIDs.length }) :
      l10n.t('operations.copy.description', { n: selectedIDs.length });
  };


  operation.annotation = function() {
    return l10n.t('operations.copy.annotation', { n: selectedIDs.length });
  };


  operation.point = function(val) {
    _point = val;
    return operation;
  };


  operation.id = 'copy';
  operation.keys = [ uiCmd('⌘C') ];
  operation.title = l10n.t('operations.copy.title');
  operation.behavior = new KeyOperationBehavior(context, operation);

  return operation;
}
