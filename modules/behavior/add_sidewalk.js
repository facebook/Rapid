import { t } from '../core/localizer';
import { actionCircularize } from '../actions/circularize';
import { behaviorOperation } from '../behavior/operation';
import { actionCopyEntities } from '../actions/copy_entities';
import {actionDeleteNode} from '../actions/delete_node';
import { utilGetAllNodes } from '../util';
import { utilArrayGroupBy, utilTotalExtent } from '../util';
import { geoExtent, geoVecSubtract, geoPointInPolygon } from '../geo';
import { modeSelect } from '../modes/select';
import { actionChangePreset } from '../actions/change_preset';
import { actionChangeTags } from '../actions/index';
import { presetManager, presetCollection} from '../presets';
import { uiCmd } from '../ui/cmd';
import { modeMove } from '../modes/move';
import { osmEntity, osmNode, osmWay } from '../osm';

import { actionMove } from '../actions/move';

export function behaviorAddSidewalk(context, selectedIDs) {
    var _pastePoint;
    var _extent;
    var _actions = selectedIDs.map(getAction).filter(Boolean);
    console.log('swo')
    console.log(_actions);
    var _amount = _actions.length === 1 ? 'single' : 'multiple';
    var _coords = utilGetAllNodes(selectedIDs, context.graph())
        .map(function(n) { return n.loc; });


    function getFilteredIdsToCopy() {
        console.log(selectedIDs);
        return selectedIDs.filter(function(selectedID) {
            var entity = context.graph().hasEntity(selectedID);
            console.log('++++++++++++++++++')
            console.log(entity.type);
            console.log('++++++++++++++++++')
            return entity.type === 'way';
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

    function addSidewalk() {
        console.log('behaviour addSidewalk');

        // 1st copy the points
        var graph = context.graph();
        var mouse = context.map().mouse();
        var selected = groupEntities(getFilteredIdsToCopy(), graph);
        var canCopy = [];
        var skip = {};
        var entity;
        var i;

        var projection = context.projection;
        var viewport = geoExtent(projection.clipExtent()).polygon();

        if (!geoPointInPolygon(mouse, viewport)) return;
        console.log('checking relations')
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


        // Now paster the selected as side walk
        var oldIDs = canCopy;
        if (!oldIDs.length) return;

        var extent = geoExtent();
        var oldGraph = context.graph();
        var newIDs = [];

        // canCopy.forEach(id => {
        //     console.log('in osm way create loop');
        //     var oldEntity = oldGraph.entity(id);
        //     // create a copy of nodes
        //     if(oldEntity.type === 'way') {
        //         // var nodes = oldEntity.nodes.map(n => new osmNode(n));
        //         // console.log(nodes);
        //         // // create a new way
        //         // var newWay = new osmWay({
        //         //     tags: oldEntity.tags,
        //         //     nodes: nodes,
        //         // });

        //         var newWay = oldEntity.copy(oldGraph, []);
        //         console.log(newWay);
        //     }
        // })

        // return;


        console.log(oldIDs);
        console.log(oldGraph);
        var action = actionCopyEntities(oldIDs, oldGraph);
        context.perform(action);

        var copies = action.copies();
        console.log(copies);
        var originals = new Set();
        Object.values(copies).forEach(function(entity) { originals.add(entity.id); });

        for (var id in copies) {
            var oldEntity = oldGraph.entity(id);
            var newEntity = copies[id];

            if(oldEntity.type === 'way') {
                console.log(oldEntity.geometry(graph));
            }

            extent._extend(oldEntity.extent(oldGraph));

            // Exclude child nodes from newIDs if their parent way was also copied.
            var parents = context.graph().parentWays(newEntity);
            var parentCopied = parents.some(function(parent) {
                return originals.has(parent.id);
            });
            console.log(id)

            console.log('running in pareentCopied')
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

        // Put pasted objects where mouse pointer is..
        var copyPoint = (context.copyLonLat() && projection(context.copyLonLat())) || projection(extent.center());
        var delta = geoVecSubtract(mouse, copyPoint);

        // Move the pasted objects to be anchored at the paste location
        context.replace(actionMove(newIDs, delta, projection));
        context.enter(modeMove(context, newIDs, graph));
        // context.enter(modeSelect(context, newIDs));

        window.setTimeout(function() {
            // TODO: Do we need validation
            console.log('validate sidewalk here')
            // context.validator().validate();
        }, 300);  // after any transition
    };

    function behavior() {
        context.keybinding().on(uiCmd('⌘K'), addSidewalk);
        return behavior;
    }


    behavior.off = function() {
        context.keybinding().off(uiCmd('⌘K'));
    };


    return behavior;
}
