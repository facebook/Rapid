import _debounce from 'lodash-es/debounce';

import { dispatch as d3_dispatch } from 'd3-dispatch';
import { t } from '../../core/localizer';
import { uiTooltip } from '../tooltip';
import { uiCmd } from '../cmd';
import { uiRapidFeatureToggleDialog } from '../rapid_feature_toggle_dialog';
import { uiRapidPowerUserFeaturesDialog } from '../rapid_poweruser_features_dialog';


export function uiToolRapidFeatures(context) {
  const toggleKeyDispatcher = d3_dispatch('ai_feature_toggle');
  const rapidFeaturesToggleKey = uiCmd('⇧' + t('map_data.layers.ai-features.key'));
  const datasetDialog = uiRapidFeatureToggleDialog(context, rapidFeaturesToggleKey, toggleKeyDispatcher);
  const powerUserDialog = uiRapidPowerUserFeaturesDialog(context);
  const showPowerUser = context.rapidContext().showPowerUser;

  let tool = {
    id: 'rapid_features',
    label: t('toolbar.rapid_features')
  };

  context.keybinding()
    .on(rapidFeaturesToggleKey, (d3_event) => {
      d3_event.preventDefault();
      d3_event.stopPropagation();
      toggleFeatures();
    });


  function layerEnabled() {
    return context.layers().layer('ai-features').enabled();
  }


  function toggleFeatures() {
    let layer = context.layers().layer('ai-features');
    layer.enabled(!layer.enabled());
    toggleKeyDispatcher.call('ai_feature_toggle');
  }


  function showFeatureToggleDialog() {
    context.container().call(datasetDialog);
  }

  function showPowerUserFeaturesDialog() {
    context.container().call(powerUserDialog);
  }


  tool.render = (selection) => {
    const debouncedUpdate = _debounce(update, 100, { leading: true, trailing: true });
    let wrap = selection
      .append('div')
      .attr('class', showPowerUser ? 'joined' : null)
      .style('display', 'flex');

    context.map()
      .on('move.rapid_features', debouncedUpdate)
      .on('drawn.rapid_features', debouncedUpdate);

    context
      .on('enter.rapid_features', update);

    update();


    function update() {
      let rapidButton = wrap.selectAll('.rapid-features')
        .data([0]);

      // enter
      let rapidButtonEnter = rapidButton.enter()
        .append('button')
        .attr('class', 'bar-button rapid-features')
        .attr('tabindex', -1)
        .on('click', showFeatureToggleDialog)
        .call(uiTooltip()
          .placement('bottom')
          .title(t('shortcuts.browsing.display_options.rapid_features_data'))
          .keys(rapidFeaturesToggleKey)
        );

      rapidButtonEnter
        .append('svg')
        .attr('class', 'logo-rapid')
        .append('use')
        .attr('xlink:href', '#iD-logo-rapid');

      // update
      rapidButton.merge(rapidButtonEnter)
        .classed('layer-off', !layerEnabled());


      let powerUserButton = wrap.selectAll('.rapid-poweruser-features')
        .data(showPowerUser ? [0] : []);

      powerUserButton.enter()
        .append('button')
        .attr('class', 'bar-button rapid-poweruser-features')
        .attr('tabindex', -1)
        .on('click', showPowerUserFeaturesDialog)
        .call(uiTooltip()
          .placement('bottom')
          .title(t('rapid_poweruser_features.heading.label'))
        )
        .append('div')
        .attr('class', 'beta');
    }
  };

  return tool;
}
