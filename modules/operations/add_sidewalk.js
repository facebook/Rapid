import { t } from '../core/localizer';
import { actionCircularize } from '../actions/circularize';
import { behaviorOperation } from '../behavior/operation';
import { actionCopyEntities } from '../actions/copy_entities';
import { utilGetAllNodes } from '../util';
import { utilArrayGroupBy, utilTotalExtent } from '../util';
import { geoExtent, geoVecSubtract } from '../geo';
import { modeSelect } from '../modes/select';
import { actionChangePreset } from '../actions/change_preset';
import { actionChangeTags } from '../actions/index';
import { presetManager, presetCollection} from '../presets';
import { modeMove } from '../modes/move';

import { actionMove } from '../actions/move';

export function operationAddSidewalk(context, selectedIDs) {
    var _pastePoint;
    var _extent;
    var _actions = selectedIDs.map(getAction).filter(Boolean);
    var _amount = _actions.length === 1 ? 'single' : 'multiple';
    var _coords = utilGetAllNodes(selectedIDs, context.graph())
        .map(function(n) { return n.loc; });


    // TODO: not needed
    function getFilteredIdsToCopy() {
        return selectedIDs.filter(function(selectedID) {
            var entity = context.graph().hasEntity(selectedID);
            // don't copy untagged vertices separately from ways
            return entity.hasInterestingTags() || entity.geometry(context.graph()) !== 'vertex';
        });
    }

    // TODO: might not be needed later
    function groupEntities(ids, graph) {
        var entities = ids.map(function (id) { return graph.entity(id); });
        return Object.assign(
            { relation: [], way: [], node: [] },
            utilArrayGroupBy(entities, 'type')
        );
    }

    function getDescendants(id, graph, descendants) {
        var entity = graph.entity(id);
        var children;

        descendants = descendants || {};

        if (entity.type === 'relation') {
            children = entity.members.map(function(m) { return m.id; });
        } else if (entity.type === 'way') {
            children = entity.nodes;
        } else {
            children = [];
        }

        for (var i = 0; i < children.length; i++) {
            if (!descendants[children[i]]) {
                descendants[children[i]] = true;
                descendants = getDescendants(children[i], graph, descendants);
            }
        }

        return descendants;
    }

    function getAction(entityID) {

        var entity = context.entity(entityID);

        if (entity.type !== 'way' || new Set(entity.nodes).size <= 1) return null;

        if (!_extent) {
            _extent =  entity.extent(context.graph());
        } else {
            _extent = _extent.extend(entity.extent(context.graph()));
        }

        // return a new action here
        return null;
        return actionCircularize(entityID, context.projection);
    }

    var operation = function() {
        if (!_pastePoint) return;

        // 1st copy the points
        var graph = context.graph();
        var selected = groupEntities(getFilteredIdsToCopy(), graph);
        var canCopy = [];
        var skip = {};
        var entity;
        var i;

        for (i = 0; i < selected.relation.length; i++) {
            console.log('THERE IS A RELATION!')
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


        // Now paster the selected as side walk
        var oldIDs = canCopy;
        if (!oldIDs.length) return;

        var projection = context.projection;
        var extent = geoExtent();
        var oldGraph = context.graph();
        var newIDs = [];

        console.log(oldIDs);
        var action = actionCopyEntities(oldIDs, oldGraph);
        context.perform(action);

        var copies = action.copies();
        var originals = new Set();
        Object.values(copies).forEach(function(entity) { originals.add(entity.id); });

        for (var id in copies) {
            var oldEntity = oldGraph.entity(id);
            var newEntity = copies[id];

            extent._extend(oldEntity.extent(oldGraph));

            // Exclude child nodes from newIDs if their parent way was also copied.
            var parents = context.graph().parentWays(newEntity);
            var parentCopied = parents.some(function(parent) {
                return originals.has(parent.id);
            });

            const preset = presetManager.item('highway/footway/sidewalk');
            var entityID = newEntity.id;
            var entity = context.graph().entity(entityID);
            var geometry = entity.geometry(context.graph());

            console.log(entityID);
            var oldPreset = presetManager.match(context.graph().entity(entityID), context.graph());
            var tags = {};
            console.log(entity.tags);
            if (oldPreset) tags = oldPreset.unsetTags(tags, geometry);
            if(newEntity.type === 'way' && preset) {
                tags = preset.setTags({name: entity.tags.name}, geometry, false);
            }
            console.log(tags);
            context.perform(actionChangeTags(entityID, tags));
            if (!parentCopied) {
                newIDs.push(newEntity.id);
            }
        }

        // Use the location of the copy operation to offset the paste location,
        // or else use the center of the pasted extent
        var copyPoint = (context.copyLonLat() && projection(context.copyLonLat())) ||
            projection(extent.center());
        var delta = geoVecSubtract(_pastePoint, copyPoint);



        // Move the pasted objects to be anchored at the paste location
        context.replace(actionMove(newIDs, delta, projection), operation.annotation());
        // context.enter(modeMove(context, newIDs, graph));
        context.enter(modeSelect(context, newIDs));

        window.setTimeout(function() {
            // TODO: Do we need validation
            console.log('validate sidewalk here')
            // context.validator().validate();
        }, 300);  // after any transition
    };

    operation.point = function(val) {
        _pastePoint = val;
        return operation;
    };


    operation.available = function() {
        return true;
        return _actions.length && selectedIDs.length === _actions.length;
    };


    // don't cache this because the visible extent could change
    operation.disabled = function() {

        return false;
        if (!_actions.length) return '';

        var actionDisableds = _actions.map(function(action) {
            return action.disabled(context.graph());
        }).filter(Boolean);

        if (actionDisableds.length === _actions.length) {
            // none of the features can be circularized

            if (new Set(actionDisableds).size > 1) {
                return 'multiple_blockers';
            }
            return actionDisableds[0];
        } else if (_extent.percentContainedIn(context.map().extent()) < 0.8) {
            return 'too_large';
        } else if (someMissing()) {
            return 'not_downloaded';
        } else if (selectedIDs.some(context.hasHiddenConnections)) {
            return 'connected_to_hidden';
        }

        return false;


        function someMissing() {
            if (context.inIntro()) return false;
            var osm = context.connection();
            if (osm) {
                var missing = _coords.filter(function(loc) { return !osm.isDataLoaded(loc); });
                if (missing.length) {
                    missing.forEach(function(loc) { context.loadTileAtLoc(loc); });
                    return true;
                }
            }
            return false;
        }
    };


    operation.tooltip = function() {
        var disable = operation.disabled();
        return disable ?
            'adding sidewalk is disabled cause: ' :
            'add a sidewalk to selected way';
    };


    operation.annotation = function() {
        return t('operations.circularize.annotation.feature', { n: _actions.length });
    };


    operation.id = 'add_sidewalk';
    operation.keys = [t('operations.add_sidewalk.key')];
    operation.title = t('operations.add_sidewalk.title');
    // operation.behavior = behaviorOperation(context).which(operation);

    return operation;
}
