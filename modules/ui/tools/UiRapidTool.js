import { selection } from 'd3-selection';
import { dispatch } from 'd3-dispatch';

import { uiRapidFeatureToggleDialog } from '../rapid_feature_toggle_dialog.js';
import { uiRapidPowerUserFeaturesDialog } from '../rapid_poweruser_features_dialog.js';
import { uiTooltip } from '../tooltip.js';
import { utilCmd } from '../../util/cmd.js';


/**
 * UiRapidTool
 * A toolbar section for the Rapid features
 */
export class UiRapidTool {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    this.context = context;
    this.id = 'rapid_features';
    this.stringID = 'toolbar.rapid_features';

    const l10n = context.systems.l10n;
    const scene = context.systems.gfx.scene;
    const ui = context.systems.ui;
    const urlhash = context.systems.urlhash;

    this.key = utilCmd('⇧' + l10n.t('shortcuts.command.toggle_rapid_data.key'));
    this.dispatch = dispatch('ai_feature_toggle');

    // Create child components
    this.RapidDialog = uiRapidFeatureToggleDialog(context, this.key, this.dispatch);
    this.PoweruserDialog = uiRapidPowerUserFeaturesDialog(context);
    this.RapidTooltip = uiTooltip(context);
    this.PoweruserTooltip = uiTooltip(context);

    // D3 selections
    this.$parent = null;

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.choose = this.choose.bind(this);
    this.render = this.render.bind(this);
    this.toggleFeatures = this.toggleFeatures.bind(this);
    this.rerender = (() => this.render());  // call render without argument

    ui.on('uichange', this.rerender);
    urlhash.on('hashchange', this.rerender);
    scene.on('layerchange', this.rerender);
    context.on('modechange', this.rerender);
    context.keybinding().on(this.key, this.toggleFeatures);
  }


  /**
   * render
   * Accepts a parent selection, and renders the content under it.
   * (The parent selection is required the first time, but can be inferred on subsequent renders)
   * @param {d3-selection} $parent - A d3-selection to a HTMLElement that this component should render itself into
   */
  render($parent = this.$parent) {
    if ($parent instanceof selection) {
      this.$parent = $parent;
    } else {
      return;   // no parent - called too early?
    }

    const context = this.context;
    const l10n = context.systems.l10n;
    const urlhash = context.systems.urlhash;
    const ui = context.systems.ui;

    const isPowerUser = urlhash.getParam('poweruser') === 'true';
    const isNarrow = context.container().selectAll('.map-toolbar.narrow').size();
    const rtl = l10n.isRTL() ? '-rtl' : '';

    // Localize tooltips
    this.RapidTooltip
      .placement('bottom')
      .scrollContainer(context.container().select('.map-toolbar'))
      .title(l10n.t('shortcuts.command.toggle_rapid_data.label'))
      .shortcut(this.key);

    this.PoweruserTooltip
      .placement('bottom')
      .scrollContainer(context.container().select('.map-toolbar'))
      .title(l10n.t('rapid_poweruser_features.heading.label'));


    // Button group
    let $joined = $parent.selectAll('.joined')
      .data([0]);

    const $$joined = $joined.enter()
      .append('div')
      .attr('class', 'joined')
      .style('display', 'flex');

    $joined = $joined.merge($$joined);


    // Rapid Button
    let $rapidButton = $joined.selectAll('button.rapid-features')
      .data([this.RapidDialog]);

    // enter
    let $$rapidButton = $rapidButton.enter()
      .append('button')
      .attr('class', 'bar-button rapid-features')
      .on('click', this.choose)
      .call(this.RapidTooltip);

    $$rapidButton
      .append('svg')
      .attr('class', 'logo-rapid')
      .append('use');

    // update
    $rapidButton = $rapidButton.merge($$rapidButton)
      .classed('layer-off', !this.isLayerEnabled());

    $rapidButton
      .selectAll('.logo-rapid use')
      .attr('xlink:href',  isNarrow ? `#rapid-logo-rapid${rtl}` : `#rapid-logo-rapid-wordmark${rtl}` );


    // Poweruser Button
    let $poweruserButton = $joined.selectAll('button.rapid-poweruser-features')
      .data(isPowerUser ? [this.PoweruserDialog] : []);

    $poweruserButton.exit()
      .remove();

    $poweruserButton.enter()
      .append('button')
      .attr('class', 'bar-button rapid-poweruser-features')
      .on('click', this.choose)
      .call(this.PoweruserTooltip)
      .append('div')
      .attr('class', 'beta');

    // If we are adding/removing any buttons, check if toolbar has overflowed..
    if ($poweruserButton.enter().size() || $poweruserButton.exit().size()) {
      ui.checkOverflow('.map-toolbar', true);
    }
  }


  /**
   * choose
   * @param  {Event}  e? - the triggering event, if any (keypress or click)
   * @param  {Object} d? - object bound to the selection (i.e. the command)
   */
  choose(e, d) {
    if (e)  e.preventDefault();
    if (!d) return;

    this.context.container().call(d);
  }


  /**
   * toggleFeatures
   * @param  {Event}  e? - the triggering event, if any (keypress or click)
   */
  toggleFeatures(e) {
    if (e)  e.preventDefault();

    const scene = this.context.systems.gfx.scene;
    scene.toggleLayers('rapid');
    this.dispatch.call('ai_feature_toggle');
  }


  /**
   * isLayerEnabled
   * @return  {boolean}  `true` if the Rapid layer is enabled, `false` if not
   */
  isLayerEnabled() {
    const scene = this.context.systems.gfx.scene;
    const rapidLayer = scene.layers.get('rapid');
    return rapidLayer?.enabled;
  }

}

