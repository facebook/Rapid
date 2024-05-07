import { select as d3_select } from 'd3-selection';

import { uiModal } from './modal.js';


export function uiRapidPowerUserFeaturesDialog(context) {
  const l10n = context.systems.l10n;
  const rapid = context.systems.rapid;
  const storage = context.systems.storage;
  const urlhash = context.systems.urlhash;

  const featureFlags = [
    'previewDatasets', 'tagnosticRoadCombine', 'tagSources', 'showAutoFix', 'allowLargeEdits'
  ];

  let _modalSelection = d3_select(null);
  let _content = d3_select(null);
  urlhash.on('hashchange', updatePowerUserKeys);


  /**
   * On any change in poweruser setting, update the storage keys.
   * If user is not currently a poweruser, move all the feature flags to a different keyspace
   * @param  currParams   Map(key -> value) of the current hash parameters
   * @param  prevParams   Map(key -> value) of the previous hash parameters
   */
  function updatePowerUserKeys(currParams, prevParams) {
    let needsUpdate = true;
    if (currParams && prevParams) {
      needsUpdate = currParams.get('poweruser') !== prevParams.get('poweruser');
    }
    if (!needsUpdate) return;


    const isPowerUser = urlhash.getParam('poweruser') === 'true';
    if (!isPowerUser) {
      for (const featureFlag of featureFlags) {
        const val = storage.getItem(`rapid-internal-feature.${featureFlag}`);
        if (val) {
          storage.setItem(`rapid-internal-feature.was.${featureFlag}`, val);
          storage.removeItem(`rapid-internal-feature.${featureFlag}`);
        }
      }
    } else {
      for (const featureFlag of featureFlags) {
        const val = storage.getItem(`rapid-internal-feature.was.${featureFlag}`);
        if (val) {
          storage.setItem(`rapid-internal-feature.${featureFlag}`, val);
          storage.removeItem(`rapid-internal-feature.was.${featureFlag}`);
        }
      }
    }
  }


  function isEnabled(featureFlag) {
    return storage.getItem(`rapid-internal-feature.${featureFlag}`) === 'true';
  }


  function toggleFeature(_, featureFlag) {
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
      context.systems.map.immediateRedraw();
    }
  }


  return (selection) => {
    updatePowerUserKeys();

    _modalSelection = uiModal(selection);

    _modalSelection.select('.modal')
      .attr('class', 'modal rapid-modal');

    _content = _modalSelection.select('.content')
      .append('div')
      .attr('class', 'rapid-stack poweruser');

    _content
      .call(renderModalContent);

    _content.selectAll('.ok-button')
      .node()
      .focus();
  };


  function renderModalContent(selection) {
    /* Header */
    let headerEnter = selection.selectAll('.modal-section-heading')
      .data([0])
      .enter()
      .append('div')
      .attr('class', 'modal-section-heading');

    headerEnter
      .append('h3')
      .attr('class', 'modal-heading')
      .html(l10n.t('rapid_poweruser_features.heading.label'));

    headerEnter
      .append('div')
      .attr('class', 'modal-heading-desc')
      .text(l10n.t('rapid_poweruser_features.heading.description'))
      .append('span')
      .attr('class', 'smile')
      .text('😎');


    /* Features */
    let features = selection.selectAll('.rapid-features-container')
      .data([0]);

    let featuresEnter = features.enter()
      .append('div')
      .attr('class', 'rapid-features-container');

    features
      .merge(featuresEnter)
      .call(renderFeatures);


    /* OK Button */
    let buttonsEnter = selection.selectAll('.modal-section.buttons')
      .data([0])
      .enter()
      .append('div')
      .attr('class', 'modal-section buttons');

    buttonsEnter
      .append('button')
      .attr('class', 'button ok-button action')
      .on('click', () => _modalSelection.remove())
      .text(l10n.t('confirm.okay'));
  }


  function renderFeatures(selection) {
    let rows = selection.selectAll('.rapid-checkbox-feature')
      .data(featureFlags, d => d);

    // enter
    let rowsEnter = rows.enter()
      .append('div')
      .attr('class', 'rapid-checkbox rapid-checkbox-feature');

    rowsEnter
      .append('div')
      .attr('class', 'rapid-feature')
      .each((d, i, nodes) => {
        let selection = d3_select(nodes[i]);

        // line1: Label
        selection
          .append('div')
          .attr('class', 'rapid-feature-label')
          .text(d => l10n.t(`rapid_poweruser_features.${d}.label`));

        // line2: description
        selection
          .append('div')
          .attr('class', 'rapid-feature-description')
          .text(d => l10n.t(`rapid_poweruser_features.${d}.description`));
      });

    let inputsEnter = rowsEnter
      .append('div')
      .attr('class', 'rapid-checkbox-inputs');

    let checkboxEnter = inputsEnter
      .append('label')
      .attr('class', 'rapid-checkbox-label');

    checkboxEnter
      .append('input')
      .attr('type', 'checkbox')
      .attr('class', 'rapid-feature-checkbox')
      .on('click', toggleFeature);

    checkboxEnter
      .append('div')
      .attr('class', 'rapid-checkbox-custom');


    // update
    rows = rows
      .merge(rowsEnter);

    rows.selectAll('.rapid-feature-checkbox')
      .property('checked', isEnabled);
  }

}
