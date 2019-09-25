import {
    event as d3_event,
    select as d3_select
} from 'd3-selection';

import {
    behaviorBreathe,
    behaviorHover,
    behaviorLasso,
    behaviorSelect
} from '../behavior';

import { t } from '../util/locale';

import { modeBrowse, modeDragNode, modeDragNote } from '../modes';
import { serviceFbMLRoads } from '../services';
import { uiFbRoadPicker } from '../ui';
import { utilKeybinding } from '../util';

var _expandedOnce = false;


export function modeSelectFbRoads(context, selectedDatum) {
    var mode = {
        id: 'select-fb-roads',
        button: 'browse'
    };

    var keybinding = utilKeybinding('select-fb-roads');
    var roadsGraph = serviceFbMLRoads.graph();

    var behaviors = [
        behaviorBreathe(context),
        behaviorHover(context),
        behaviorSelect(context),
        behaviorLasso(context),
        modeDragNode(context).behavior,
        modeDragNote(context).behavior
    ];


    // class the data as selected, or return to browse mode if the data is gone
    function selectData(drawn) {
        var selection = context.surface().selectAll('.layer-fb-roads .data' + selectedDatum.__fbid__);

        if (selection.empty()) {
            // Return to browse mode if selected DOM elements have
            // disappeared because the user moved them out of view..
            var source = d3_event && d3_event.type === 'zoom' && d3_event.sourceEvent;
            if (drawn && source && (source.type === 'mousemove' || source.type === 'touchmove')) {
                context.enter(modeBrowse(context));
            }
        } else {
            selection.classed('selected', true);
        }
    }


    function esc() {
        if (d3_select('.combobox').size()) return;
        context.enter(modeBrowse(context));
    }

    mode.selectedDatum = function() {
        return selectedDatum; 
    }
    
    mode.selectedIDs = function() {
        return [selectedDatum.id];
    };


    mode.zoomToSelected = function() {
        var extent = selectedDatum.extent(roadsGraph);
        context.map().centerZoomEase(extent.center(), context.map().trimmedExtentZoom(extent));
    };


    mode.enter = function() {
        behaviors.forEach(context.install);

        keybinding
            .on(t('inspector.zoom_to.key'), mode.zoomToSelected)
            .on('⎋', esc, true);

        d3_select(document)
            .call(keybinding);

        selectData();

        if (!_expandedOnce) {
            // Expand assistant at least once per session to inform user how to
            // accept and reject proposed roads.
            _expandedOnce = true;
            // expand the assistant, avoid obscuring the data if needed
            var extent = selectedDatum.extent(roadsGraph);
        }

        context.map()
            .on('drawn.select-fb-roads', selectData);
    };


    mode.exit = function() {
        behaviors.forEach(context.uninstall);

        d3_select(document)
            .call(keybinding.unbind);

        context.surface()
            .selectAll('.layer-fb-roads .selected')
            .classed('selected hover', false);

        context.map()
            .on('drawn.select-fb-roads', null);
    };


    return mode;
}
