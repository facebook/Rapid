import { geoSphericalDistance } from '@id-sdk/math';
import { utilGetAllNodes } from '@id-sdk/util';

import { t } from '../core/localizer';
import { actionDeleteMultiple } from '../actions/delete_multiple';
import { BehaviorKeyOperation } from '../behaviors/BehaviorKeyOperation';
import { modeSelect } from '../modes/select';
import { prefs } from '../core/preferences';
import { uiCmd } from '../ui/cmd';
import { utilTotalExtent } from '../util';


export function operationDelete(context, selectedIDs) {
  const multi = selectedIDs.length === 1 ? 'single' : 'multiple';
  const entities = selectedIDs.map(entityID => context.hasEntity(entityID)).filter(Boolean);
  const isNew = entities.every(entity => entity.isNew());
  const action = actionDeleteMultiple(selectedIDs);
  const nodes = utilGetAllNodes(selectedIDs, context.graph());
  const coords = nodes.map(node => node.loc);
  const extent = utilTotalExtent(entities, context.graph());


  let operation = function() {
    let nextSelectedID;
    let nextSelectedLoc;

    // If we are deleting a vertex, try to select the next nearest vertex along the way.
    if (entities.length === 1) {
      const entity = entities[0];
      const geometry = entity.geometry(context.graph());
      const parents = context.graph().parentWays(entity);
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
          const a = geoSphericalDistance(entity.loc, context.entity(nodes[i - 1]).loc);
          const b = geoSphericalDistance(entity.loc, context.entity(nodes[i + 1]).loc);
          i = a < b ? i - 1 : i + 1;
        }

        nextSelectedID = nodes[i];
        nextSelectedLoc = context.entity(nextSelectedID).loc;
      }
    }

    context.perform(action, operation.annotation());
    context.validator().validate();

    if (nextSelectedID && nextSelectedLoc) {
      if (context.hasEntity(nextSelectedID)) {
        context.enter(modeSelect(context, [nextSelectedID]).follow(true));
      } else {
        context.map().centerEase(nextSelectedLoc);
        context.enter('browse');
      }
    } else {
      context.enter('browse');
    }
  };


  operation.available = function() {
    return true;
  };


  operation.disabled = function() {
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
      const allowLargeEdits = prefs('rapid-internal-feature.allowLargeEdits') === 'true';
      return !allowLargeEdits && extent.percentContainedIn(context.map().extent()) < 0.8;
    }

    // If fhe selection spans tiles that haven't been downloaded yet
    function notDownloaded() {
      if (context.inIntro()) return false;
      const osm = context.connection();
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
      const entity = context.entity(id);
      return entity.tags.wikidata && entity.tags.wikidata.trim().length > 0;
    }

    function incompleteRelation(id) {
      const entity = context.entity(id);
      return entity.type === 'relation' && !entity.isComplete(context.graph());
    }

    function protectedMember(id) {
      const entity = context.entity(id);
      if (entity.type !== 'way') return false;

      const parents = context.graph().parentRelations(entity);
      for (let i = 0; i < parents.length; i++) {
        const parent = parents[i];
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
      t(`operations.delete.${disabledReason}.${multi}`) :
      t(`operations.delete.description.${multi}`);
  };


  operation.annotation = function() {
    return selectedIDs.length === 1 ?
      t('operations.delete.annotation.' + context.graph().geometry(selectedIDs[0])) :
      t('operations.delete.annotation.feature', { n: selectedIDs.length });
  };


  operation.id = 'delete';
  operation.keys = [ uiCmd('⌘⌫'), uiCmd('⌘⌦'), uiCmd('⌦') ];
  operation.title = t('operations.delete.title');
  operation.behavior = new BehaviorKeyOperation(context, operation);

  return operation;
}
