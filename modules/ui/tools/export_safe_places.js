import { geoExtent } from '../../geo';
import { event as d3_event, select as d3_select } from 'd3-selection';
import { t } from '../../util/locale';
import { modeSave } from '../../modes';
import { svgIcon } from '../../svg';
import { uiCmd } from '../cmd';
import { uiTooltipHtml } from '../tooltipHtml';
import { tooltip } from '../../util/tooltip';
import { uiExportSafePlacesData} from '../export_safe_places_data'; 

export function uiToolExportSafePlaces(context) {

    var tool = {
        id: 'safeplaces_export',
        label: t('safeplaces_export.title'),
        userToggleable: false
    };

    var button = null;
    var tooltipBehavior = tooltip()
        .placement('bottom')
        .html(true)
        .title(uiTooltipHtml(t('safeplaces_export.no_changes'), key))
        .scrollContainer(d3_select('#bar'));
    var key = uiCmd('⌘S');
    var _numChanges;

    function isSaving() {
        var mode = context.mode();
        return mode && mode.id === 'save';
    }

    function isDisabled() {
        return !_numChanges || isSaving();
    }

    function safeplaces() {
        d3_event.preventDefault();
        uiExportSafePlacesData(context)(); 
    }

    function updateCount() {
        var extent = geoExtent([
            [-180, -90],
            [180, 90]
          ]);
        var all = context.intersects(extent);
        _numChanges = all.length;

        if (tooltipBehavior) {
            tooltipBehavior
                .title(uiTooltipHtml(
                    t(_numChanges > 0 ? 'safeplaces_export.help' : 'safeplaces_export.no_changes'), key)
                );
        }

        if (button) {
            button
                .classed('disabled', isDisabled());

            button.select('span.count')
                .text(_numChanges);
        }
    }


    tool.render = function(selection) {

        button = selection
            .selectAll('.bar-button')
            .data([0]);

        var buttonEnter = button
            .enter()
            .append('button')
            .attr('class', 'safeplaces disabled bar-button')
            .on('click', safeplaces)
            .call(tooltipBehavior);

        buttonEnter
            .call(svgIcon('#iD-icon-save'));

        buttonEnter
            .append('span')
            .attr('class', 'count')
            .attr('aria-hidden', 'true')
            .text('0');

        button = buttonEnter.merge(button);

        updateCount();
    };

    tool.allowed = function() {
        return true;
    };

    tool.install = function() {
        context.keybinding()
            .on(key, safeplaces, true);

        context.history()
            .on('change.safeplaces_export', updateCount);

        context
            .on('enter.safeplaces_export', function() {
                if (button) {
                    button
                        .classed('disabled', isDisabled());

                    if (isSaving()) {
                        button.call(tooltipBehavior.hide);
                    }
                }
            });
    };


    tool.uninstall = function() {

        _numChanges = null;

        context.keybinding()
            .off(key, true);

        context.history()
            .on('change.safeplaces_export', null);

        context
            .on('enter.safeplaces_export', null);

        button = null;
    };

    return tool;
}
    