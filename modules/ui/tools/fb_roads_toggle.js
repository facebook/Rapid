import _debounce from 'lodash-es/debounce';

import { t } from '../../util/locale';
import { tooltip } from '../../util/tooltip';
import { uiCmd } from '../cmd';
import { uiTooltipHtml } from '../tooltipHtml';


export function uiToolFbRoadsToggle(context) {

    var fbRoadsDataToggleKey = uiCmd('⇧' + t('map_data.layers.fb-roads.key'));
    var tool = {
        id: 'fb_roads_toggle',
        label: t('toolbar.fb_roads'),
        iconName: 'iD-logo-rapid', 
        iconClass: 'logo-rapid'
    };


    function enabled() {
        return context.layers().layer('fb-roads').enabled();
    }


    function toggle() {
        var fbRoads = context.layers().layer('fb-roads');
        fbRoads.enabled(!fbRoads.enabled());
    }


    tool.render = function(selection) {
        var debouncedUpdate = _debounce(update, 100, { leading: true, trailing: true });

        context.map()
            .on('move.fb_roads_toggle', debouncedUpdate)
            .on('drawn.fb_roads_toggle', debouncedUpdate);

        context
            .on('enter.fb_roads_toggle', update);

        update();


        function update() {
            var buttons = selection
                .selectAll('button.bar-button')
                .data([0]);

            // exit
            buttons.exit()
                .remove();

            var buttonsEnter = buttons.enter()
                .append('button')
                .attr('class', 'bar-button fb-roads-toggle')
                .attr('tabindex', -1)
                .on('click', toggle)
                .call(tooltip()
                    .placement('bottom')
                    .html(true)
                    .title(uiTooltipHtml(
                        t('shortcuts.browsing.display_options.fb_roads_data'),
                        fbRoadsDataToggleKey))
                )
                .append('svg')
                .attr('class', 'logo-rapid')
                .append('use')
                .attr('xlink:href', '#iD-logo-rapid');

            // update
            buttons
                .merge(buttonsEnter)
                .classed('layer-off', function() { return !enabled(); });
        }
    };

    return tool;
}
