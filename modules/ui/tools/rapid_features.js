import _debounce from 'lodash-es/debounce';

import { dispatch as d3_dispatch } from 'd3-dispatch';
import { t } from '../../core/localizer';
import { uiTooltip } from '../tooltip';
import { uiCmd } from '../cmd';
import { uiRapidFeatureToggleDialog } from '../rapid_feature_toggle_dialog';
import { uiRapidPowerUserFeaturesDialog } from '../rapid_poweruser_features_dialog';


export function uiToolRapidFeatures(context) {
  const toggleKeyDispatcher = d3_dispatch('ai_feature_toggle');
  const rapidFeaturesToggleKey = '⇧' + t('map_data.layers.ai-features.key');
  const datasetDialog = uiRapidFeatureToggleDialog(context, uiCmd(rapidFeaturesToggleKey), toggleKeyDispatcher);
  const powerUserDialog = uiRapidPowerUserFeaturesDialog(context);
  const showPowerUser = context.rapidContext().showPowerUser;

  let tool = {
    id: 'rapid_features',
    label: t('toolbar.rapid_features')
  };

  function layerEnabled() {
    if (!context.scene) return false;
    let rapidLayer = context.scene().layers.get('rapid');
    return rapidLayer?.enabled;
  }


  function toggleFeatures() {
    context.scene().toggleLayers('rapid');
    toggleKeyDispatcher.call('ai_feature_toggle');
  }


  function showFeatureToggleDialog() {
    context.container().call(datasetDialog);
  }

  function showPowerUserFeaturesDialog() {
    context.container().call(powerUserDialog);
  }

  let debouncedUpdate;

  tool.install = (selection) => {
    debouncedUpdate = _debounce(update, 100, { leading: true, trailing: true });

    context.keybinding()
      .on(uiCmd(rapidFeaturesToggleKey), d3_event => {
        d3_event.preventDefault();
        d3_event.stopPropagation();
        toggleFeatures();
      });

    context.map()
      .on('draw', debouncedUpdate);

    context
      .on('enter.rapid_features', update);

    let wrap = selection
      .append('div')
      .attr('class', showPowerUser ? 'joined' : null)
      .style('display', 'flex');

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
        .attr('xlink:href', '#rapid-logo-rapid-wordmark');

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


  tool.uninstall = function () {
    context.map().off('draw', debouncedUpdate);
    context.keybinding().off(uiCmd(rapidFeaturesToggleKey));
  };

  return tool;
}
