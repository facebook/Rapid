import _debounce from 'lodash-es/debounce';

import { t } from '../../util/locale';
import { tooltip } from '../../util/tooltip';
import { uiCmd } from '../cmd';
import { uiTooltipHtml } from '../tooltipHtml';
import {uiRapidFeatureToggle} from '../rapid_feature_toggle_dialog'; 

var aiFeaturesToggleKey;


export function getAIFeaturesToggleKey(context){
    return aiFeaturesToggleKey; 
}


export function uiToolAiFeaturesToggle(context) {
    aiFeaturesToggleKey = uiCmd('⇧' + t('map_data.layers.ai-features.key'));

    var tool = {
        id: 'ai_features_toggle',
        label: t('toolbar.ai_features')
    };


    function enabled() {
        return context.layers().layer('ai-features').enabled();
    }


    function toggle() {
        var aiFeatures = context.layers().layer('ai-features');
        aiFeatures.enabled(!aiFeatures.enabled());

        var buildings = context.layers().layer('ai-buildings');
        aiFeatures.enabled(!aiFeatures.enabled());
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
                .on('click', toggle)
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
