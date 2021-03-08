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
        var oldIDs = getFilteredIdsToCopy();
        if (!oldIDs.length) return;

        var projection = context.projection;
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
        return getFilteredIdsToCopy().length;
    };


    // don't cache this because the visible extent could change
    operation.disabled = function() {

        if (!getFilteredIdsToCopy().length) return 'Please select a way to add sidewalk';

        if (_extent.percentContainedIn(context.map().extent()) < 0.8) {
            return 'too_large';
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
