import { select as d3_select } from 'd3-selection';

import { t } from '../core/localizer';
import { prefs } from '../core/preferences';
import { icon } from './intro/helper';
import { uiModal } from './modal';


export function uiRapidPowerUserFeaturesDialog() {
  const featureFlags = [
    'tagnosticRoadCombine',
    'tagSources'
  ];
  let _modalSelection = d3_select(null);
  let _content = d3_select(null);


  function isEnabled(featureFlag) {
    return prefs(`rapid-internal-feature.${featureFlag}`) === 'true';
  }

  function toggleFeature(featureFlag) {
    const enabled = prefs(`rapid-internal-feature.${featureFlag}`) === 'true';
    prefs(`rapid-internal-feature.${featureFlag}`, !enabled);
  }


  return (selection) => {
    _modalSelection = uiModal(selection);

    _modalSelection.select('.modal')
      .attr('class', 'modal rapid-modal');   // RapiD styling

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
      .html(t('rapid_poweruser_features.heading.label'));

    headerEnter
      .append('div')
      .attr('class', 'modal-heading-desc')
      .html(t('rapid_poweruser_features.heading.description'));


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
      .text(t('confirm.okay'));
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
          .text(d => t(`rapid_poweruser_features.${d}.label`));

        // line2: description
        selection
          .append('div')
          .attr('class', 'rapid-feature-description')
          .text(d => t(`rapid_poweruser_features.${d}.description`));
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



  //   addCheckBox({
  //     modal: modal,
  //     id: 'rapid-poweruser-features-ai-halo',
  //     label: t('rapid_poweruser_features.ai_feature_halo'),
  //     description: t('rapid_poweruser_features.ai_feature_halo_desc'),
  //     handler: toggleAiFeatureHalo,
  //     enabled: storage.featureEnabled('aiFeatureHalo'),
  //     greyout: false,
  //     imgid: 'ai-feature-halo',
  //   });

  //   modal
  //     .append('div')
  //     .attr('class','modal-section rapid-checkbox section-divider');

  //   addCheckBox({
  //     modal: modal,
  //     id: 'rapid-poweruser-features-tagnostic-combine',
  //     label: t('rapid_poweruser_features.tagnostic_road_combine'),
  //     description: t('rapid_poweruser_features.tagnostic_road_combine_desc'),
  //     handler: toggleTagnosticRoadCombine,
  //     enabled: storage.featureEnabled('tagnosticRoadCombine'),
  //     greyout: false,
  //     imgid: 'tagnostic-road-combine',
  //   });

  //   modal
  //     .append('div')
  //     .attr('class','modal-section rapid-checkbox section-divider');

  //   addCheckBox({
  //     modal: modal,
  //     id: 'rapid-poweruser-features-tag-sources',
  //     label: t('rapid_poweruser_features.tag_sources'),
  //     description: t('rapid_poweruser_features.tag_sources_desc'),
  //     handler: toggleTagSources,
  //     enabled: storage.featureEnabled('tagSources'),
  //     greyout: false,
  //     imgid: 'tag-sources',
  //   });
  // };

}
