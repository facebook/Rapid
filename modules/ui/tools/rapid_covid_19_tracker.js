import _debounce from 'lodash-es/debounce';
import { t } from '../../util/locale';
import { tooltip } from '../../util/tooltip';
import { uiTooltipHtml } from '../tooltipHtml';
import {uiRapidCovid19TrackerDialog} from '../rapid_covid_19_tracker_dialog';



export function uiToolRapidCovid19Tracker(context) {
    
    
    var tool = {
        id: 'covid-19-tracker',
        label: t('toolbar.covid_19_tracker')
    };
    var layers = context.layers();
    
    var covid19DataDialog = uiRapidCovid19TrackerDialog(context)
        .on('change', covid19Changed);
    
        
    function covid19Changed(d) {
        var dataLayer = layers.layer('covid-19');
        
        if (d && d.fileList) {
            dataLayer.fileList(d.fileList);
        }
    }
    
    function enabled() {
        return context.layers().layer('covid-19').enabled();
    }

    function showDialog() {
        context.container().call(covid19DataDialog);
    }


    tool.render = function(selection) {
        var debouncedUpdate = _debounce(update, 100, { leading: true, trailing: true });

        context.map()
            .on('move.covid-19-tracker', debouncedUpdate)
            .on('drawn.covid-19-tracker', debouncedUpdate);

        context
            .on('enter.covid-19-tracker', update);

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
                .attr('class', 'bar-button covid-19-tracker')
                .attr('tabindex', -1)
                .on('click', showDialog)
                .call(tooltip()
                    .placement('bottom')
                    .html(true)
                    .title(uiTooltipHtml(
                        t('shortcuts.browsing.display_options.covid_19_tracker')
                    ))
                )
                .append('svg')
                .attr('class', 'covid-19-icon')
                .append('use')
                .attr('xlink:href', '#iD-covid-19-icon');

            // update
            buttons
                .merge(buttonsEnter)
                .classed('layer-off', function() { return !enabled(); });
        }
    };



    return tool;
}
