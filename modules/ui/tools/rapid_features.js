import { dispatch as d3_dispatch } from 'd3-dispatch';

import { uiCmd } from '../cmd.js';
import { uiRapidFeatureToggleDialog } from '../rapid_feature_toggle_dialog.js';
import { uiRapidPowerUserFeaturesDialog } from '../rapid_poweruser_features_dialog.js';
import { uiTooltip } from '../tooltip.js';


export function uiToolRapidFeatures(context) {
  const l10n = context.systems.l10n;
  const map = context.systems.map;
  const urlhash = context.systems.urlhash;

  const toggleKeyDispatcher = d3_dispatch('ai_feature_toggle');
  const rapidFeaturesToggleKey = '⇧' + l10n.t('map_data.layers.rapid.key');
  const datasetDialog = uiRapidFeatureToggleDialog(context, uiCmd(rapidFeaturesToggleKey), toggleKeyDispatcher);
  const powerUserDialog = uiRapidPowerUserFeaturesDialog(context);

  let _wrap;

  let tool = {
    id: 'rapid_features',
    label: l10n.t('toolbar.rapid_features')
  };


  function layerEnabled() {
    if (!context.scene) return false;
    const rapidLayer = map.scene.layers.get('rapid');
    return rapidLayer?.enabled;
  }


  function toggleFeatures() {
    map.scene.toggleLayers('rapid');
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

    const isPowerUser = urlhash.getParam('poweruser') === 'true';

    _wrap
      .attr('class', isPowerUser ? 'joined' : null);

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
        .title(l10n.t('shortcuts.browsing.display_options.rapid_features_data'))
        .shortcut(rapidFeaturesToggleKey)
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
      .data(isPowerUser ? [0] : []);

    powerUserButton.exit()
      .remove();

    powerUserButton.enter()
      .append('button')
      .attr('class', 'bar-button rapid-poweruser-features')
      .attr('tabindex', -1)
      .on('click', showPowerUserFeaturesDialog)
      .call(uiTooltip(context)
        .placement('bottom')
        .title(l10n.t('rapid_poweruser_features.heading.label'))
      )
      .append('div')
      .attr('class', 'beta');
  }



  tool.install = (selection) => {
    context.keybinding()
      .on(uiCmd(rapidFeaturesToggleKey), d3_event => {
        d3_event.preventDefault();
        d3_event.stopPropagation();
        toggleFeatures();
      });

    urlhash.on('hashchange', update);
    map.scene.on('layerchange', update);
    context.on('modechange', update);

    _wrap = selection
      .append('div')
      .style('display', 'flex');

    update();
  };


  tool.uninstall = function () {
    context.keybinding().off(uiCmd(rapidFeaturesToggleKey));
    urlhash.off('hashchange', update);
    map.scene.off('layerchange', update);
    context.off('modechange', update);
    _wrap = null;
  };

  return tool;
}
