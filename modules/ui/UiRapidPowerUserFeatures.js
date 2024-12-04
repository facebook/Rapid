import { selection } from 'd3-selection';

import { uiModal } from './modal.js';


/**
 * UiRapidPowerUserFeatures
 * This is the modal where the user can toggle on and off power user features.
 * It is shown by clicking the "Beta" button in the top menu, if `&poweruser=true` is in the url.
 */
export class UiRapidPowerUserFeatures {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    this.context = context;

    const l10n = context.systems.l10n;
    const urlhash = context.systems.urlhash;

    this.featureFlags = [
      'previewDatasets', 'tagnosticRoadCombine', 'tagSources', 'showAutoFix', 'allowLargeEdits'
    ];

    // D3 selections
    this.$parent = null;
    this.$content = null;
    this.$modal = null;

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.show = this.show.bind(this);
    this.render = this.render.bind(this);
    this.rerender = (() => this.render());  // call render without argument
    this.renderFeatures = this.renderFeatures.bind(this);
    this.updateFeatureFlags = this.updateFeatureFlags.bind(this);
    this.isFeatureEnabled = this.isFeatureEnabled.bind(this);
    this.toggleFeature = this.toggleFeature.bind(this);

    // Setup event handlers
    l10n.on('localechange', this.rerender);
    urlhash.on('hashchange', this.updateFeatureFlags);
  }


  /**
   * show
   * This shows the poweruser features modal if it isn't already being shown.
   * For this kind of popup component, must first `show()` to create the modal.
   * Accepts a parent selection, and renders the content under it.
   * @param {d3-selection} $parent - A d3-selection to a HTMLElement that this component should render itself into
   */
  show($parent) {
    const isShowing = $parent.selectAll('.shaded').size();

    this.updateFeatureFlags();

    if (!isShowing) {
      this.$modal = uiModal($parent);

      this.$modal.select('.modal')
        .attr('class', 'modal rapid-modal');

      this.$content = this.$modal.select('.content')
        .append('div')
        .attr('class', 'rapid-stack poweruser');
    }

    this.render($parent);
  }


  /**
   * render
   * Accepts a parent selection, and renders the content under it.
   * (The parent selection is required the first time, but can be inferred on subsequent renders.)
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

    if (!this.$modal) return;  // need to call `show()` first to create the modal.

    const $content = this.$content;

    /* Heading */
    let $heading = $content.selectAll('.modal-section-heading')
      .data([0]);

    // enter
    const $$heading = $heading.enter()
      .append('div')
      .attr('class', 'modal-section-heading');

    $$heading
      .append('h3')
      .attr('class', 'modal-heading');

    const $$description = $$heading
      .append('div')
      .attr('class', 'modal-heading-desc');

    $$description
      .append('span')
      .attr('class', 'modal-heading-desc-text');

    $$description
      .append('span')
      .attr('class', 'smile')
      .text('😎');

    // update
    $heading = $heading.merge($$heading);

    $heading.selectAll('.modal-heading')
      .html(l10n.t('rapid_poweruser_features.heading.label'));

    $heading.selectAll('.modal-heading-desc-text')
      .text(l10n.t('rapid_poweruser_features.heading.description'));


    /* Features */
    let $features = $content.selectAll('.rapid-features-container')
      .data([0]);

    // enter
    const $$features = $features.enter()
      .append('div')
      .attr('class', 'rapid-features-container');

    $features = $features.merge($$features);

    $features
      .call(this.renderFeatures);


    /* OK Button */
    let $buttons = $content.selectAll('.modal-section.buttons')
      .data([0]);

    // enter
    const $$buttons = $buttons.enter()
      .append('div')
      .attr('class', 'modal-section buttons');

    $$buttons
      .append('button')
      .attr('class', 'button ok-button action')
      .on('click', () => this.$modal.close());

    // set focus (but only on enter)
    const buttonNode = $$buttons.selectAll('button').node();
    if (buttonNode) buttonNode.focus();

    // update
    $buttons = $buttons.merge($$buttons);

    $buttons.selectAll('.button')
      .text(l10n.t('confirm.okay'));
  }


  /**
   * renderFeatureFlags
   * Renders the list of feature flag checkboxes into the `.rapid-features-container` div.
   * @param {d3-selection} $container - A d3-selection to a HTMLElement that this component should render itself into
   */
  renderFeatures($container) {
    const context = this.context;
    const l10n = context.systems.l10n;

    let $rows = $container.selectAll('.rapid-checkbox-feature')
      .data(this.featureFlags, d => d);

    // enter
    const $$rows = $rows.enter()
      .append('div')
      .attr('class', 'rapid-checkbox rapid-checkbox-feature');

    const $$descriptions = $$rows
      .append('div')
      .attr('class', 'rapid-feature');

    $$descriptions
      .append('div')
      .attr('class', 'rapid-feature-label');

    $$descriptions
      .append('div')
      .attr('class', 'rapid-feature-description');

    const $$inputs = $$rows
      .append('div')
      .attr('class', 'rapid-checkbox-inputs');

    const $$checkboxes = $$inputs
      .append('label')
      .attr('class', 'rapid-checkbox-label');

    $$checkboxes
      .append('input')
      .attr('type', 'checkbox')
      .attr('class', 'rapid-feature-checkbox')
      .on('click', this.toggleFeature);

    $$checkboxes
      .append('div')
      .attr('class', 'rapid-checkbox-custom');


    // update
    $rows = $rows.merge($$rows);

    // localize and style everything...
    $rows.selectAll('.rapid-feature-label')
      .text(d => l10n.t(`rapid_poweruser_features.${d}.label`));

    $rows.selectAll('.rapid-feature-description')
      .text(d => l10n.t(`rapid_poweruser_features.${d}.description`));

    $rows.selectAll('.rapid-feature-checkbox')
      .property('checked', this.isFeatureEnabled);
  }


  /**
   * updateFeatureFlags
   * On any change in poweruser setting, update the storage for the flags.
   * If user is not currently a poweruser, move all the feature flags to a different storage space.
   * @param  currParams   Map(key -> value) of the current hash parameters
   * @param  prevParams   Map(key -> value) of the previous hash parameters
   */
  updateFeatureFlags(currParams, prevParams) {
    let needsUpdate = true;
    if (currParams && prevParams) {
      needsUpdate = currParams.get('poweruser') !== prevParams.get('poweruser');
    }
    if (!needsUpdate) return;

    const context = this.context;
    const urlhash = context.systems.urlhash;
    const storage = context.systems.storage;

    const isPowerUser = urlhash.getParam('poweruser') === 'true';
    if (!isPowerUser) {
      for (const featureFlag of this.featureFlags) {
        const val = storage.getItem(`rapid-internal-feature.${featureFlag}`);
        if (val) {
          storage.setItem(`rapid-internal-feature.was.${featureFlag}`, val);
          storage.removeItem(`rapid-internal-feature.${featureFlag}`);
        }
      }
    } else {
      for (const featureFlag of this.featureFlags) {
        const val = storage.getItem(`rapid-internal-feature.was.${featureFlag}`);
        if (val) {
          storage.setItem(`rapid-internal-feature.${featureFlag}`, val);
          storage.removeItem(`rapid-internal-feature.was.${featureFlag}`);
        }
      }
    }
  }


  /**
   * isFeatureEnabled
   * Test whether the given feature flag is enabled.
   * @param   {string}   featureFlag - the feature flag to test
   * @return  {boolean}  `true` if the flag is enabled, `false` if not
   */
  isFeatureEnabled(featureFlag) {
    const storage = this.context.systems.storage;
    return storage.getItem(`rapid-internal-feature.${featureFlag}`) === 'true';
  }


  /**
   * toggleFeature
   * Toggles the given feature flag between on/off
   * @param  {Event}   e? - triggering event (if any)
   * @param  {string}  featureFlag - the feature flag to toggle
   */
  toggleFeature(e, featureFlag) {
    const context = this.context;
    const gfx = context.systems.gfx;
    const rapid = context.systems.rapid;
    const storage = context.systems.storage;

    let enabled = storage.getItem(`rapid-internal-feature.${featureFlag}`) === 'true';
    enabled = !enabled;
    storage.setItem(`rapid-internal-feature.${featureFlag}`, enabled);

    // custom on-toggle behaviors can go here
    if (featureFlag === 'previewDatasets' && !enabled) {   // if user unchecked previewDatasets feature
      for (const dataset of rapid.datasets.values()) {
        if (dataset.beta) {
          dataset.added = false;
          dataset.enabled = false;
        }
      }
      context.enter('browse');   // return to browse mode (in case something was selected)
      gfx.immediateRedraw();
    }
  }

}
