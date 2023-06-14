import debounce from 'lodash-es/debounce';

import { dispatch as d3_dispatch } from 'd3-dispatch';
import { uiTooltip } from '../tooltip';
import { uiCmd } from '../cmd';
import { uiRapidFeatureToggleDialog } from '../rapid_feature_toggle_dialog';
import { uiRapidPowerUserFeaturesDialog } from '../rapid_poweruser_features_dialog';


export function uiToolRapidFeatures(context) {
  const toggleKeyDispatcher = d3_dispatch('ai_feature_toggle');
  const rapidFeaturesToggleKey = '⇧' + context.t('map_data.layers.ai-features.key');
  const datasetDialog = uiRapidFeatureToggleDialog(context, uiCmd(rapidFeaturesToggleKey), toggleKeyDispatcher);
  const powerUserDialog = uiRapidPowerUserFeaturesDialog(context);
  const showPowerUser = context.rapidSystem().showPowerUser;
  let debouncedUpdate;
  let _wrap;

  let tool = {
    id: 'rapid_features',
    label: context.t('toolbar.rapid_features')
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

  function update() {
    if (!_wrap) return;
    let rapidButton = _wrap.selectAll('.rapid-features')
      .data([0]);

    // enter
    let rapidButtonEnter = rapidButton.enter()
      .append('button')
      .attr('class', 'bar-button rapid-features')
      .attr('tabindex', -1)
      .on('click', showFeatureToggleDialog)
      .call(uiTooltip(context)
        .placement('bottom')
        .title(context.t('shortcuts.browsing.display_options.rapid_features_data'))
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


    let powerUserButton = _wrap.selectAll('.rapid-poweruser-features')
      .data(showPowerUser ? [0] : []);

    powerUserButton.enter()
      .append('button')
      .attr('class', 'bar-button rapid-poweruser-features')
      .attr('tabindex', -1)
      .on('click', showPowerUserFeaturesDialog)
      .call(uiTooltip(context)
        .placement('bottom')
        .title(context.t('rapid_poweruser_features.heading.label'))
      )
      .append('div')
      .attr('class', 'beta');
  }



  tool.install = (selection) => {
    debouncedUpdate = debounce(update, 100, { leading: true, trailing: true });

    context.keybinding()
      .on(uiCmd(rapidFeaturesToggleKey), d3_event => {
        d3_event.preventDefault();
        d3_event.stopPropagation();
        toggleFeatures();
      });

    context.mapSystem().on('draw', debouncedUpdate);
    context.on('modechange', update);

    _wrap = selection
      .append('div')
      .attr('class', showPowerUser ? 'joined' : null)
      .style('display', 'flex');

    update();
  };


  tool.uninstall = function () {
    debouncedUpdate.cancel();
    context.keybinding().off(uiCmd(rapidFeaturesToggleKey));
    context.mapSystem().off('draw', debouncedUpdate);
    context.off('modechange', update);
    _wrap = null;
  };

  return tool;
}
