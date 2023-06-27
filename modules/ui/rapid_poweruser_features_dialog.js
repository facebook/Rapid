import { select as d3_select } from 'd3-selection';

import { uiModal } from './modal';


export function uiRapidPowerUserFeaturesDialog(context) {
  const prefs = context.systems.storage;
  const featureFlags = [
    'previewDatasets', 'tagnosticRoadCombine', 'tagSources', 'showAutoFix', 'allowLargeEdits'
  ];
  const rapid = context.systems.rapid;
  const showPowerUser = rapid.showPowerUser;
  let _modalSelection = d3_select(null);
  let _content = d3_select(null);

  // if we are not currently showing poweruser features, move all the feature flags to a different keyspace
  if (!showPowerUser) {
    featureFlags.forEach(featureFlag => {
      const val = prefs.getItem(`rapid-internal-feature.${featureFlag}`);
      if (val) {
        prefs.setItem(`rapid-internal-feature.was.${featureFlag}`, val);
        prefs.removeItem(`rapid-internal-feature.${featureFlag}`);
      }
    });
  } else {
    featureFlags.forEach(featureFlag => {
      const val = prefs.getItem(`rapid-internal-feature.was.${featureFlag}`);
      if (val) {
        prefs.setItem(`rapid-internal-feature.${featureFlag}`, val);
        prefs.removeItem(`rapid-internal-feature.was.${featureFlag}`);
      }
    });
  }


  function isEnabled(featureFlag) {
    return prefs.getItem(`rapid-internal-feature.${featureFlag}`) === 'true';
  }

  function toggleFeature(_, featureFlag) {
    let enabled = prefs.getItem(`rapid-internal-feature.${featureFlag}`) === 'true';
    enabled = !enabled;
    prefs.setItem(`rapid-internal-feature.${featureFlag}`, enabled);

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
    _modalSelection = uiModal(selection);

    _modalSelection.select('.modal')
      .attr('class', 'modal rapid-modal');   // Rapid styling

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
      .html(context.t('rapid_poweruser_features.heading.label'));

    headerEnter
      .append('div')
      .attr('class', 'modal-heading-desc')
      .text(context.t('rapid_poweruser_features.heading.description'))
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
      .text(context.t('confirm.okay'));
  }


  function renderFeatures(selection) {
    let rows = selection.selectAll('.rapid-checkbox-feature')
      .data(featureFlags, d => d);

    // enter
    let rowsEnter = rows.enter()
      .append('div')
      .attr('class', 'modal-section rapid-checkbox rapid-checkbox-feature');

    rowsEnter
      .append('div')
      .attr('class', 'rapid-feature')
      .each((d, i, nodes) => {
        let selection = d3_select(nodes[i]);

        // line1: Label
        selection
          .append('div')
          .attr('class', 'rapid-feature-label')
          .text(d => context.t(`rapid_poweruser_features.${d}.label`));

        // line2: description
        selection
          .append('div')
          .attr('class', 'rapid-feature-description')
          .text(d => context.t(`rapid_poweruser_features.${d}.description`));
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
