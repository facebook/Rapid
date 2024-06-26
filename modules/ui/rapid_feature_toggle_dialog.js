import { select as d3_select } from 'd3-selection';
import { marked } from 'marked';

import { icon } from './intro/helper.js';
import { uiIcon } from './icon.js';
import { uiModal } from './modal.js';
import { uiRapidColorpicker } from './rapid_colorpicker.js';
import { uiRapidViewManageDatasets } from './rapid_view_manage_datasets.js';


export function uiRapidFeatureToggleDialog(context, AIFeatureToggleKey, featureToggleKeyDispatcher) {
  const l10n = context.systems.l10n;
  const rapid = context.systems.rapid;

  let _modalSelection = d3_select(null);
  let _content = d3_select(null);
  let _viewManageModal;
  let _colorpicker;


  function datasetEnabled(d) {
    const dataset = rapid.datasets.get(d.id);
    return dataset?.enabled;
  }

  function toggleDataset(event, d) {
    const dataset = rapid.datasets.get(d.id);
    if (dataset) {
      dataset.enabled = !dataset.enabled;

      // update url hash
      const urlhash = context.systems.urlhash;
      const datasetIDs = [...rapid.datasets.values()]
        .filter(ds => ds.added && ds.enabled)
        .map(ds => ds.id)
        .join(',');
      urlhash.setParam('datasets', datasetIDs.length ? datasetIDs : null);

      context.scene().dirtyLayers('rapid');
      context.scene().dirtyLayers('rapid-overlay');
      context.enter('browse');   // return to browse mode (in case something was selected)
    }
  }

  function changeColor(datasetID, color) {
    const dataset = rapid.datasets.get(datasetID);
    if (dataset) {
      dataset.color = color;

      context.scene().dirtyLayers('rapid');
      context.scene().dirtyLayers('rapid-overlay');
      context.systems.map.immediateRedraw();
      _content.call(renderModalContent);

      // If a Rapid feature is already selected, reselect it to update sidebar too
      const mode = context.mode;
      if (mode?.id === 'select') {  // new (not legacy) select mode
        const selection = new Map(mode.selectedData);
        context.enter('select', { selection: selection });
      }
    }
  }

  function toggleRapid() {
    context.scene().toggleLayers('rapid');
    _content.call(renderModalContent);
  }


  function keyPressHandler(d3_event) {
    if (d3_event.shiftKey && d3_event.key === l10n.t('map_data.layers.rapid.key')) {
      toggleRapid();
    }
  }


  return function render(selection) {
    _modalSelection = uiModal(selection);

    _modalSelection.select('.modal')
      .attr('class', 'modal rapid-modal');

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
    const rapidLayer = context.scene().layers.get('rapid');
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
      .html(l10n.t('rapid_feature_toggle.toggle_all', { rapidicon: icon('#rapid-logo-rapid-wordmark', 'logo-rapid') }));

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
      .text(l10n.t('rapid_feature_toggle.view_manage_datasets'));

    manageDatasetsEnter
      .append('div')
      .attr('class', 'rapid-checkbox-inputs')
      .append('div')
      .attr('class', 'rapid-checkbox-label')
      .call(uiIcon(l10n.isRTL() ? '#rapid-icon-backward' : '#rapid-icon-forward', 'icon-30'));


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


  function renderDatasets(selection) {
    const prefs = context.systems.storage;
    const showPreview = prefs.getItem('rapid-internal-feature.previewDatasets') === 'true';
    const datasets = [...rapid.datasets.values()]
      .filter(d => d.added && (showPreview || !d.beta));    // exclude preview datasets unless user has opted into them
    const rapidLayer = context.scene().layers.get('rapid');
    if (!rapidLayer) return;

    let rows = selection.selectAll('.rapid-checkbox-dataset')
      .data(datasets, d => d.id);

    // exit
    rows.exit()
      .remove();

    // enter
    let rowsEnter = rows.enter()
      .append('div')
      .attr('class', 'rapid-checkbox rapid-checkbox-dataset');

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
            .attr('title', l10n.t('rapid_poweruser_features.beta'));
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
            .html(marked.parse(d.license_markdown));

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
                .text(l10n.t('rapid_feature_toggle.center_map'))
                .on('click', (d3_event) => {
                  d3_event.preventDefault();
                  context.systems.map.extent(d.extent);
                });
            } else {
              selection
                .text(l10n.t('rapid_feature_toggle.worldwide'));
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
