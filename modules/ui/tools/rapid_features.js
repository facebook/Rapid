import { dispatch as d3_dispatch } from 'd3-dispatch';

import { uiCmd } from '../cmd.js';
import { uiRapidFeatureToggleDialog } from '../rapid_feature_toggle_dialog.js';
import { uiRapidPowerUserFeaturesDialog } from '../rapid_poweruser_features_dialog.js';
import { uiTooltip } from '../tooltip.js';


export function uiToolRapidFeatures(context) {
  const l10n = context.systems.l10n;
  const map = context.systems.map;
  const ui = context.systems.ui;
  const urlhash = context.systems.urlhash;

  const toggleKeyDispatcher = d3_dispatch('ai_feature_toggle');
  const rapidFeaturesToggleKey = uiCmd('⇧' + l10n.t('map_data.layers.rapid.key'));

  // Create child components
  const DatasetDialog = uiRapidFeatureToggleDialog(context, rapidFeaturesToggleKey, toggleKeyDispatcher);
  const PowerUserDialog = uiRapidPowerUserFeaturesDialog(context);

  let $wrap = null;

  const tool = {
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
    context.container().call(DatasetDialog);
  }


  function showPowerUserFeaturesDialog() {
    context.container().call(PowerUserDialog);
  }


  /**
   * render
   */
  function render() {
    if (!$wrap) return;  // called too early?

    const isPowerUser = urlhash.getParam('poweruser') === 'true';
    const isNarrow = context.container().selectAll('.top-toolbar.narrow').size();

    $wrap
      .attr('class', isPowerUser ? 'joined' : null);

    let $rapidButton = $wrap.selectAll('.rapid-features')
      .data([0]);

    // enter
    let $$rapidButton = $rapidButton.enter()
      .append('button')
      .attr('class', 'bar-button rapid-features')
      .attr('tabindex', -1)
      .on('click', showFeatureToggleDialog)
      .call(uiTooltip(context)
        .placement('bottom')
        .title(l10n.t('shortcuts.browsing.display_options.rapid_features_data'))
        .shortcut(rapidFeaturesToggleKey)
      );

    $$rapidButton
      .append('svg')
      .attr('class', 'logo-rapid')
      .append('use')
      .attr('xlink:href', '#rapid-logo-rapid-wordmark');

    // update
    $rapidButton = $rapidButton.merge($$rapidButton)
      .classed('layer-off', !layerEnabled());

    $rapidButton
      .selectAll('.logo-rapid use')
      .attr('xlink:href',  isNarrow ? '#rapid-logo-rapid' : '#rapid-logo-rapid-wordmark' );


    let $powerUserButton = $wrap.selectAll('.rapid-poweruser-features')
      .data(isPowerUser ? [0] : []);

    $powerUserButton.exit()
      .remove();

    $powerUserButton.enter()
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



  tool.install = ($parent) => {
    context.keybinding().off(rapidFeaturesToggleKey);
    context.keybinding()
      .on(rapidFeaturesToggleKey, d3_event => {
        d3_event.preventDefault();
        d3_event.stopPropagation();
        toggleFeatures();
      });

    ui.on('uichange', render);
    urlhash.on('hashchange', render);
    map.scene.on('layerchange', render);
    context.on('modechange', render);

    $wrap = $parent
      .append('div')
      .style('display', 'flex');

    render();
  };


  tool.uninstall = function () {
    context.keybinding().off(rapidFeaturesToggleKey);
    ui.off('uichange', render);
    urlhash.off('hashchange', render);
    map.scene.off('layerchange', render);
    context.off('modechange', render);
    $wrap = null;
  };

  return tool;
}
