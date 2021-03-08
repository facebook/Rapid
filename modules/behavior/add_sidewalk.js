import { t } from '../core/localizer';
import { actionCopyEntities } from '../actions/copy_entities';
import { geoExtent, geoVecSubtract, geoPointInPolygon } from '../geo';
import { modeSelect } from '../modes/select';
import { actionChangeTags } from '../actions/index';
import { presetManager} from '../presets';
import { uiCmd } from '../ui/cmd';
import { modeMove } from '../modes/move';
import { actionMove } from '../actions/move';

export function behaviorAddSidewalk(context, selectedIDs) {

    function getFilteredIdsToCopy() {
        return selectedIDs.filter(selectedID => {
            var entity = context.graph().hasEntity(selectedID);
            return entity.type === 'way';
        });
    }

    function setTags(entity) {
        const preset = presetManager.item('highway/footway/sidewalk');
        var entityID = entity.id;
        var geometry = entity.geometry(context.graph());

        var oldPreset = presetManager.match(context.graph().entity(entityID), context.graph());
        var tags = {};
        if (oldPreset) tags = oldPreset.unsetTags(tags, geometry);
        if(entity.type === 'way' && preset) {
            tags = preset.setTags({name: entity.tags.name}, geometry, false);
        }
        context.perform(actionChangeTags(entityID, tags));
    }

    function addSidewalk() {
        // 1st copy the points
        var graph = context.graph();
        var mouse = context.map().mouse();
        var oldIDs = getFilteredIdsToCopy();
        if (!oldIDs.length) return;

        var projection = context.projection;
        var viewport = geoExtent(projection.clipExtent()).polygon();
        if (!geoPointInPolygon(mouse, viewport)) return;

        var extent = geoExtent();
        var oldGraph = context.graph();
        var newIDs = [];

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
            setTags(newEntity);
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
