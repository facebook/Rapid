import { select as d3_select } from 'd3-selection';
import { utilQsString, utilStringQs } from '@id-sdk/util';
import marked from 'marked';

import { t, localizer } from '../core/localizer';
import { prefs } from '../core/preferences';
import { icon } from './intro/helper';
import { modeBrowse } from '../modes';
import { svgIcon } from '../svg/icon';
import { uiModal } from './modal';
import { uiRapidColorpicker } from './rapid_colorpicker';
import { uiRapidViewManageDatasets } from './rapid_view_manage_datasets';


export function uiRapidFeatureToggleDialog(context, AIFeatureToggleKey, featureToggleKeyDispatcher) {
  const rapidContext = context.rapidContext();
  let _modalSelection = d3_select(null);
  let _content = d3_select(null);
  let _viewManageModal;
  let _colorpicker;


  function datasetEnabled(d) {
    const dataset = rapidContext.datasets()[d.id];
    return dataset && dataset.enabled;
  }

  function toggleDataset(event, d) {
    let datasets = rapidContext.datasets();
    let dataset = datasets[d.id];
    if (dataset) {
      dataset.enabled = !dataset.enabled;

      // update url hash
      let hash = utilStringQs(window.location.hash);
      hash.datasets = Object.values(datasets)
        .filter(ds => ds.added && ds.enabled)
        .map(ds => ds.id)
        .join(',');

      if (!window.mocha) {
        window.location.replace('#' + utilQsString(hash, true));  // update hash
      }

      const rapidLayer = context.layers().getLayer('rapid');
      rapidLayer.makeDirty();

      context.enter(modeBrowse(context));   // return to browse mode (in case something was selected)
      context.map().immediateRedraw();
    }
  }

  function changeColor(datasetID, color) {
    let datasets = rapidContext.datasets();
    let dataset = datasets[datasetID];
    if (dataset) {
      const rapidLayer = context.layers().getLayer('rapid');
      rapidLayer.makeDirty();

      dataset.color = color;
      context.map().immediateRedraw();
      _content.call(renderModalContent);

      // if a RapiD feature is selected, reselect it to update sidebar too
      const mode = context.mode();
      if (mode && mode.id === 'select-ai-features') {
        context.enter(mode, mode.selectedDatum());
      }
    }
  }

  function toggleRapid() {
    context.layers().toggle('rapid');
    _content.call(renderModalContent);
  }


  function keyPressHandler(d3_event) {
    if (d3_event.shiftKey && d3_event.key === t('map_data.layers.ai-features.key')) {
      toggleRapid();
    }
  }


  return function render(selection) {
    _modalSelection = uiModal(selection);

    _modalSelection.select('.modal')
      .attr('class', 'modal rapid-modal');   // RapiD styling

    _viewManageModal = uiRapidViewManageDatasets(context, _modalSelection)
      .on('done', () => _content.call(renderModalContent));

    _colorpicker = uiRapidColorpicker(context, _modalSelection)
      .on('change', changeColor);

    _content = _modalSelection.select('.content')
      .append('div')
      .attr('class', 'rapid-stack')
      .on('keypress', keyPressHandler);

    _content
      .call(renderModalContent);

    _content.selectAll('.ok-button')
      .node()
      .focus();

    featureToggleKeyDispatcher
      .on('ai_feature_toggle', () => _content.call(renderModalContent) );
  };


  function renderModalContent(selection) {
    const rapidLayer = context.layers().getLayer('rapid');
    if (!rapidLayer) return;

    /* Toggle All */
    let toggleAll = selection.selectAll('.rapid-toggle-all')
      .data([0]);

    // enter
    let toggleAllEnter = toggleAll
      .enter()
      .append('div')
      .attr('class', 'modal-section rapid-checkbox rapid-toggle-all');

    let toggleAllTextEnter = toggleAllEnter
      .append('div')
      .attr('class', 'rapid-feature-label-container');

    toggleAllTextEnter
      .append('div')
      .attr('class', 'rapid-feature-label')
      .html(t('rapid_feature_toggle.toggle_all', { rapidicon: icon('#iD-logo-rapid', 'logo-rapid') }));

    toggleAllTextEnter
      .append('span')
      .attr('class', 'rapid-feature-hotkey')
      .html('(' + AIFeatureToggleKey + ')');

    let toggleAllCheckboxEnter = toggleAllEnter
      .append('div')
      .attr('class', 'rapid-checkbox-inputs')
      .append('label')
      .attr('class', 'rapid-checkbox-label');

    toggleAllCheckboxEnter
      .append('input')
      .attr('type', 'checkbox')
      .attr('class', 'rapid-feature-checkbox')
      .on('click', toggleRapid);

    toggleAllCheckboxEnter
      .append('div')
      .attr('class', 'rapid-checkbox-custom');

    // update
    toggleAll = toggleAll
      .merge(toggleAllEnter);

    toggleAll.selectAll('.rapid-feature-checkbox')
      .property('checked', rapidLayer.enabled);


    /* Dataset List */
    let datasets = selection.selectAll('.rapid-datasets-container')
      .data([0]);

    let datasetsEnter = datasets.enter()
      .append('div')
      .attr('class', 'rapid-datasets-container');

    datasets
      .merge(datasetsEnter)
      .call(renderDatasets);


    /* View/Manage Datasets */
    let manageDatasetsEnter = selection.selectAll('.rapid-manage-datasets')
      .data([0])
      .enter()
      .append('div')
      .attr('class', 'modal-section rapid-checkbox rapid-manage-datasets')
      .on('click', () => context.container().call(_viewManageModal));

    manageDatasetsEnter
      .append('div')
      .attr('class', 'rapid-feature-label-container')
      .append('div')
      .attr('class', 'rapid-feature-label')
      .text(t('rapid_feature_toggle.view_manage_datasets'));

    manageDatasetsEnter
      .append('div')
      .attr('class', 'rapid-checkbox-inputs')
      .append('div')
      .attr('class', 'rapid-checkbox-label')
      .call(svgIcon(localizer.textDirection() === 'rtl' ? '#iD-icon-backward' : '#iD-icon-forward', 'icon-30'));


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


  function renderDatasets(selection) {
    const showPreview = prefs('rapid-internal-feature.previewDatasets') === 'true';
    const datasets = Object.values(rapidContext.datasets())
      .filter(d => d.added && (showPreview || !d.beta));    // exclude preview datasets unless user has opted into them
    const rapidLayer = context.layers().getLayer('rapid');
    if (!rapidLayer) return;

    let rows = selection.selectAll('.rapid-checkbox-dataset')
      .data(datasets, d => d.id);

    // exit
    rows.exit()
      .remove();

    // enter
    let rowsEnter = rows.enter()
      .append('div')
      .attr('class', 'modal-section rapid-checkbox rapid-checkbox-dataset');

    rowsEnter
      .append('div')
      .attr('class', 'rapid-feature')
      .each((d, i, nodes) => {
        let selection = d3_select(nodes[i]);

        // line1: name and details
        let labelEnter = selection
          .append('div')
          .attr('class', 'rapid-feature-label-container');

        labelEnter
          .append('div')
          .attr('class', 'rapid-feature-label')
          .text(d.label || d.id);   // fallback to dataset ID

        if (d.beta) {
          labelEnter
            .append('div')
            .attr('class', 'rapid-feature-label-beta beta')
            .attr('title', t('rapid_poweruser_features.beta'));
        }

        if (d.description) {
          labelEnter
            .append('div')
            .attr('class', 'rapid-feature-label-divider');

          labelEnter
            .append('div')
            .attr('class', 'rapid-feature-description')
            .text(d.description);
        }

        if (d.license_markdown) {
          labelEnter
            .append('div')
            .attr('class', 'rapid-feature-label-divider');

          labelEnter
            .append('div')
            .attr('class', 'rapid-feature-license')
            .html(marked(d.license_markdown));

          labelEnter.select('p a')
            .attr('target', '_blank');
        }

        // line2: dataset extent
        selection
          .append('div')
          .attr('class', 'rapid-feature-extent-container')
          .each((d, i, nodes) => {
            let selection = d3_select(nodes[i]);

            // if the data spans more than 100°*100°, it might as well be worldwide
            if (d.extent && d.extent.area() < 10000) {
              selection
                .append('a')
                .attr('href', '#')
                .text(t('rapid_feature_toggle.center_map'))
                .on('click', (d3_event) => {
                  d3_event.preventDefault();
                  context.map().extent(d.extent);
                });
            } else {
              selection
                .text(t('rapid_feature_toggle.worldwide'));
            }
          });
      });

    let inputsEnter = rowsEnter
      .append('div')
      .attr('class', 'rapid-checkbox-inputs');

    inputsEnter
      .append('label')
      .attr('class', 'rapid-colorpicker-label');

    let checkboxEnter = inputsEnter
      .append('label')
      .attr('class', 'rapid-checkbox-label');

    checkboxEnter
      .append('input')
      .attr('type', 'checkbox')
      .attr('class', 'rapid-feature-checkbox')
      .on('click', toggleDataset);

    checkboxEnter
      .append('div')
      .attr('class', 'rapid-checkbox-custom');


    // update
    rows = rows
      .merge(rowsEnter)
      .classed('disabled', !rapidLayer.enabled);

    rows.selectAll('.rapid-colorpicker-label')
      .attr('disabled', rapidLayer.enabled ? null : true)
      .call(_colorpicker);

    rows.selectAll('.rapid-checkbox-label')
      .classed('disabled', !rapidLayer.enabled);

    rows.selectAll('.rapid-feature-checkbox')
      .property('checked', datasetEnabled)
      .attr('disabled', rapidLayer.enabled ? null : true);
  }
}
