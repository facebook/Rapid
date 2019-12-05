import _debounce from 'lodash-es/debounce';
import {dispatch as d3_dispatch} from 'd3-dispatch'; 
import {event as d3_event} from 'd3-selection'; 
import { t } from '../../util/locale';
import { tooltip } from '../../util/tooltip';
import { uiCmd } from '../cmd';
import { uiTooltipHtml } from '../tooltipHtml';
import {uiRapidFeatureToggleDialog} from '../rapid_feature_toggle_dialog'; 

var aiFeaturesToggleKey;
var toggleKeyDispatcher; 


export function uiToolAiFeaturesToggle(context) {

    toggleKeyDispatcher = d3_dispatch('ai_feature_toggle'); 
    aiFeaturesToggleKey = uiCmd('⇧' + t('map_data.layers.ai-features.key'));

    var tool = {
        id: 'ai_features_toggle',
        label: t('toolbar.ai_features')
    };

    context.keybinding()
        .on(aiFeaturesToggleKey, function () {
            d3_event.preventDefault();
            d3_event.stopPropagation();
            toggleFeatures();
        }); 
    

    function enabled() {
        return context.layers().layer('ai-features').enabled();
    }

    function toggleFeatures() {
        var drawAiFeatures = context.layers().layer('ai-features');
        drawAiFeatures.enabled(!drawAiFeatures.enabled());
        toggleKeyDispatcher.call('ai_feature_toggle');
    }

    function showFeatureToggleDialog() {
        context.container().call(uiRapidFeatureToggleDialog(context, aiFeaturesToggleKey, toggleKeyDispatcher )); 
    }


    tool.render = function(selection) {
        var debouncedUpdate = _debounce(update, 100, { leading: true, trailing: true });

        context.map()
            .on('move.ai_features_toggle', debouncedUpdate)
            .on('drawn.ai_features_toggle', debouncedUpdate);

        context
            .on('enter.ai_features_toggle', update);

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
                .attr('class', 'bar-button ai-features-toggle')
                .attr('tabindex', -1)
                .on('click', showFeatureToggleDialog)
                .call(tooltip()
                    .placement('bottom')
                    .html(true)
                    .title(uiTooltipHtml(
                        t('shortcuts.browsing.display_options.ai_features_data'),
                        aiFeaturesToggleKey))
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
