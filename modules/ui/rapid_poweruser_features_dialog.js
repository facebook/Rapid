import { t } from '../core/localizer';
import { icon } from './intro/helper';
import { uiModal } from './modal';
import { select as d3_select } from 'd3-selection';
import { rapidPowerUserFeaturesStorage } from './rapid_poweruser_features_storage';


export function uiRapidPowerUserFeaturesDialog() {
  const storage = rapidPowerUserFeaturesStorage();


  function toggleAiFeatureHalo () {
    const osmLayer = d3_select('.data-layer.osm');
    const enabled = storage.featureEnabled('aiFeatureHalo');
    osmLayer.classed('ai-feature-halo', !enabled);
    storage.featureEnabled('aiFeatureHalo', !enabled);
  }


  function toggleTagnosticRoadCombine() {
    const enabled = storage.featureEnabled('tagnosticRoadCombine');
    storage.featureEnabled('tagnosticRoadCombine', !enabled);
  }


  function toggleTagSources() {
    const enabled = storage.featureEnabled('tagSources');
    storage.featureEnabled('tagSources', !enabled);
  }


  return function(selection) {
    let modalSelection = uiModal(selection);

    modalSelection.select('.modal')
      .attr('class', 'modal-splash modal modal-rapid');

    let modal = modalSelection.select('.content')
      .append('form')
      .attr('class', 'fillL poweruser rapid-stack');

    modal
      .append('div')
      .attr('class', 'modal-heading rapid')
      .html(t('rapid_poweruser_features.top_label', { icon: icon('#iD-mapwithailogo', 'logo-rapid') }));

    modal
      .append('div')
      .attr('class', 'modal-heading-desc rapid')
      .html(t('rapid_poweruser_features.top_label_desc'));

    modal
      .append('div')
      .attr('class', 'modal-section rapid-checkbox section-divider strong');


    addCheckBox({
      modal: modal,
      id: 'rapid-poweruser-features-ai-halo',
      label: t('rapid_poweruser_features.ai_feature_halo'),
      description: t('rapid_poweruser_features.ai_feature_halo_desc'),
      handler: toggleAiFeatureHalo,
      enabled: storage.featureEnabled('aiFeatureHalo'),
      greyout: false,
      imgid: 'ai-feature-halo',
    });

    modal
      .append('div')
      .attr('class','modal-section rapid-checkbox section-divider');

    addCheckBox({
      modal: modal,
      id: 'rapid-poweruser-features-tagnostic-combine',
      label: t('rapid_poweruser_features.tagnostic_road_combine'),
      description: t('rapid_poweruser_features.tagnostic_road_combine_desc'),
      handler: toggleTagnosticRoadCombine,
      enabled: storage.featureEnabled('tagnosticRoadCombine'),
      greyout: false,
      imgid: 'tagnostic-road-combine',
    });

    modal
      .append('div')
      .attr('class','modal-section rapid-checkbox section-divider');

    addCheckBox({
      modal: modal,
      id: 'rapid-poweruser-features-tag-sources',
      label: t('rapid_poweruser_features.tag_sources'),
      description: t('rapid_poweruser_features.tag_sources_desc'),
      handler: toggleTagSources,
      enabled: storage.featureEnabled('tagSources'),
      greyout: false,
      imgid: 'tag-sources',
    });
  };


  function addCheckBox(options) {
    let toggleOption = options.modal
      .append('div')
      .attr('class','modal-section rapid-checkbox poweruser')
      .classed('disabled', options.greyout)
      .attr('id', `section-${options.id}`);

    let toggleOptionContainer = toggleOption
      .append('div')
      .attr('class', 'rapid-feature-label-container poweruser');

    toggleOptionContainer
      .append('div')
      .attr('id', options.imgid)
      .attr('class', 'rapid-feature-animation poweruser');
      // background-image is blank, to be filled in by .css depending on hover state

    if (options.description) {
      let description = toggleOptionContainer
        .append('div')
        .attr('class', 'rapid-feature-description poweruser');

      description
        .append('div')
        .attr('class', 'heading')
        .html(options.label);

      description
        .append('div')
        .attr('class', 'description')
        .text(options.description);
    }

    let inputs = toggleOption
      .append('div')
      .attr('class', 'rapid-checkbox-inputs');

    let checkbox = inputs
      .append('div')
      .attr('class', 'rapid-checkbox-label');

    checkbox
      .append('input')
      .attr('type', 'checkbox')
      .attr('id', options.id)
      .attr('class', 'rapid-feature-checkbox')
      .property('checked', options.enabled)
      .attr('disabled', options.greyout ? true : null);

    checkbox
      .append('div')
      .attr('class', 'rapid-checkbox-custom')
      .on('click', options.handler);
  }
}
