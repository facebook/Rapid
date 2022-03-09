import { actionCopyEntities } from '../actions/copy_entities';
import { actionMove } from '../actions/move';
import { vecSubtract } from '@id-sdk/math';
import { geomPointInPolygon } from '@id-sdk/geom';
import { Extent } from '@id-sdk/extent';
import { modeMove } from '../modes/move';
import { uiCmd } from '../ui/cmd';

// see also `operationPaste`
export function behaviorPaste(context) {

    function doPaste(d3_event) {
        d3_event.preventDefault();

        var startGraph = context.graph();
        var mouse = context.map().mouse();
        var projection = context.projection;
        var dimensions = projection.dimensions();
        var viewport = new Extent(dimensions[0], dimensions[1]).polygon();

        if (!geomPointInPolygon(mouse, viewport)) return;

        var oldIDs = context.copyIDs();
        if (!oldIDs.length) return;

        var extent = new Extent();
        var copyGraph = context.copyGraph();
        var newIDs = [];

        var action = actionCopyEntities(oldIDs, copyGraph);
        context.perform(action);

        var copies = action.copies();
        var originals = new Set();
        Object.values(copies).forEach(function(entity) { originals.add(entity.id); });

        for (var id in copies) {
            var oldEntity = copyGraph.entity(id);
            var newEntity = copies[id];

            extent = extent.extend(oldEntity.extent(copyGraph));

            // Exclude child nodes from newIDs if their parent way was also copied.
            var parents = context.graph().parentWays(newEntity);
            var parentCopied = parents.some(function(parent) {
                return originals.has(parent.id);
            });

            if (!parentCopied) {
                newIDs.push(newEntity.id);
            }
        }

        // Put pasted objects where mouse pointer is..
        var copyPoint = (context.copyLonLat() && projection.project(context.copyLonLat())) || projection.project(extent.center());
        var delta = vecSubtract(mouse, copyPoint);

        context.perform(actionMove(newIDs, delta, projection));
        context.enter(modeMove(context, newIDs, startGraph));
    }


    function behavior() {
        context.keybinding().on(uiCmd('⌘V'), doPaste);
        return behavior;
    }


    behavior.off = function() {
        context.keybinding().off(uiCmd('⌘V'));
    };


    return behavior;
}
