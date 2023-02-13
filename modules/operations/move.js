import { utilGetAllNodes } from '@id-sdk/util';

import { t } from '../core/localizer';
import { BehaviorKeyOperation } from '../behaviors/BehaviorKeyOperation';
import { prefs } from '../core/preferences';
import { utilTotalExtent } from '../util/util';


export function operationMove(context, selectedIDs) {
    var multi = (selectedIDs.length === 1 ? 'single' : 'multiple');
    var nodes = utilGetAllNodes(selectedIDs, context.graph());
    var coords = nodes.map(function(n) { return n.loc; });
    var extent = utilTotalExtent(selectedIDs, context.graph());


    var operation = function() {
      const selection = new Map();
      for (const entityID of selectedIDs) {
        selection.set(entityID, context.entity(entityID));
      }
      context.enter('move', { selection: selection });
    };


    operation.available = function() {
        return selectedIDs.length > 0;
    };


    operation.disabled = function() {
        const allowLargeEdits = prefs('rapid-internal-feature.allowLargeEdits') === 'true';
        if (!allowLargeEdits && extent.percentContainedIn(context.map().extent()) < 0.8) {
            return 'too_large';
        } else if (someMissing()) {
            return 'not_downloaded';
        } else if (selectedIDs.some(context.hasHiddenConnections)) {
            return 'connected_to_hidden';
        } else if (selectedIDs.some(incompleteRelation)) {
            return 'incomplete_relation';
        }

        return false;


        function someMissing() {
            if (context.inIntro()) return false;
            var osm = context.connection();
            if (osm) {
                var missing = coords.filter(function(loc) { return !osm.isDataLoaded(loc); });
                if (missing.length) {
                    missing.forEach(function(loc) { context.loadTileAtLoc(loc); });
                    return true;
                }
            }
            return false;
        }

        function incompleteRelation(id) {
            var entity = context.entity(id);
            return entity.type === 'relation' && !entity.isComplete(context.graph());
        }
    };


    operation.tooltip = function() {
        var disable = operation.disabled();
        return disable ?
            t('operations.move.' + disable + '.' + multi) :
            t('operations.move.description.' + multi);
    };


    operation.annotation = function() {
        return selectedIDs.length === 1 ?
            t('operations.move.annotation.' + context.graph().geometry(selectedIDs[0])) :
            t('operations.move.annotation.feature', { n: selectedIDs.length });
    };


    operation.id = 'move';
    operation.keys = [t('operations.move.key')];
    operation.title = t('operations.move.title');
    operation.behavior = new BehaviorKeyOperation(context, operation);

    operation.mouseOnly = true;

    return operation;
}
