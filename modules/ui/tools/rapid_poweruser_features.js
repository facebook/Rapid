import _debounce from 'lodash-es/debounce';
import { t } from '../../util/locale';
import { tooltip } from '../../util/tooltip';
import { uiTooltipHtml } from '../tooltipHtml';
import {uiRapidPowerUserFeaturesDialog} from '../rapid_poweruser_features_dialog'; 


export function uiToolRapidPowerUserFeatures(context) {

    var tool = {
        id: 'rapid_poweruser_features',
        label: t('toolbar.rapid_poweruser_features')
    };
    

    function enabled() {
        return context.layers().layer('ai-features').enabled();
    }    

    function showRapidPowerUserFeaturesDialog() {
        context.container().call(uiRapidPowerUserFeaturesDialog(context)); 
    }


    tool.render = function(selection) {
        var debouncedUpdate = _debounce(update, 100, { leading: true, trailing: true });

        context.map()
            .on('move.rapid_poweruser_features', debouncedUpdate)
            .on('drawn.rapid_poweruser_features', debouncedUpdate);

        context
            .on('enter.rapid_poweruser_features', update);

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
                .attr('class', 'bar-button rapid-poweruser-features')
                .attr('tabindex', -1)
                .on('click', showRapidPowerUserFeaturesDialog)
                .call(tooltip()
                    .placement('bottom')
                    .html(true)
                    .title(uiTooltipHtml(
                        t('shortcuts.browsing.display_options.rapid_poweruser_features')
                    ))
                )
                .append('svg')
                .attr('class', 'logo-mapwithai')
                .append('use')
                .attr('xlink:href', '#iD-mapwithailogo');

            // update
            buttons
                .merge(buttonsEnter)
                .classed('layer-off', function() { return !enabled(); });
        }
    };



    return tool;
}
