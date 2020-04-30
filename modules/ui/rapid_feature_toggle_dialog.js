import { event as d3_event, select as d3_select } from 'd3-selection';

import marked from 'marked';
import { t, textDirection } from '../util/locale';
import { icon } from './intro/helper';
import { svgIcon } from '../svg/icon';
import { uiModal } from './modal';
import { uiRapidViewManageDatasets } from './rapid_view_manage_datasets';


export function uiRapidFeatureToggleDialog(context, AIFeatureToggleKey, featureToggleKeyDispatcher) {
  const RAPID_MAGENTA = '#ff26d4';
  const rapidContext = context.rapidContext();
  let _modalSelection = d3_select(null);
  let _content = d3_select(null);


  function datasetEnabled(d) {
    const dataset = rapidContext.datasets()[d.key];
    return dataset && dataset.enabled;
  }

  function toggleDataset(d) {
    const dataset = rapidContext.datasets()[d.key];
    if (dataset) {
      dataset.enabled = !dataset.enabled;
      context.map().pan([0,0]);   // trigger a map redraw
    }
  }

  function changeColor(d, i, nodes) {
    const input = nodes[i];
    const dataset = rapidContext.datasets()[d.key];
    if (dataset) {
      dataset.color = input.value || RAPID_MAGENTA;
      context.map().pan([0,0]);   // trigger a map redraw
    }
  }

  function toggleAll() {
    const rapidLayer = context.layers().layer('ai-features');
    rapidLayer.enabled(!rapidLayer.enabled());   // toggling the layer will trigger a map redraw
    _content.call(renderModalContent);
  }

  function keyPressFormHandler() {
    if (d3_event.shiftKey && d3_event.key === t('map_data.layers.ai-features.key')) {
      toggleAll();
    }
  }


  return function render(selection) {
    _modalSelection = uiModal(selection);

    _modalSelection.select('.modal')
      .attr('class', 'modal-splash modal modal-rapid');

    _content = _modalSelection.select('.content')
      .append('form')
      .attr('class', 'fillL rapid-feature rapid-stack')
      .on('keypress', keyPressFormHandler);

    _content
      .call(renderModalContent);

    featureToggleKeyDispatcher
      .on('ai_feature_toggle', () => _content.call(renderModalContent) );
  };


  function renderModalContent(selection) {
    const rapidLayer = context.layers().layer('ai-features');

    /* Toggle All */
    let toggleAllEnter = selection.selectAll('.rapid-toggle-all')
      .data([0])
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
      .property('checked', rapidLayer.showAll())
      .on('click', toggleAll);

    toggleAllCheckboxEnter
      .append('div')
      .attr('class', 'rapid-checkbox-custom');


    /* Dataset List */
    selection
      .call(renderDatasets);


    /* View/Manage Datasets */
    let manageDatasetsEnter = selection.selectAll('.rapid-manage-datasets')
      .data([0])
      .enter()
      .append('div')
      .attr('class', 'modal-section rapid-checkbox rapid-manage-datasets')
      .on('click', () => {
        context.container().call(uiRapidViewManageDatasets(context, _modalSelection));
      });

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
      .call(svgIcon(textDirection === 'rtl' ? '#iD-icon-backward' : '#iD-icon-forward', 'icon-30'));
  }


  function renderDatasets(selection) {
    const datasets = Object.values(rapidContext.datasets());
    const rapidLayer = context.layers().layer('ai-features');

    let rows = selection.selectAll('.rapid-checkbox-dataset')
      .data(datasets, d => d.key);

    // exit
    rows.exit()
      .remove();

    // enter
    let rowsEnter = rows.enter()
      .append('div')
      .attr('class', 'modal-section rapid-checkbox rapid-checkbox-dataset');

    rowsEnter
      .append('div')
      .attr('class', 'rapid-feature-label-container')
      .each((d, i, nodes) => {
        let selection = d3_select(nodes[i]);
        selection
          .append('div')
          .attr('class', 'rapid-feature-label')
          .text(d.label || d.key);   // fallback to key

        if (d.description) {
          selection
            .append('div')
            .attr('class', 'rapid-feature-label-divider');

          selection
            .append('div')
            .attr('class', 'rapid-feature-description')
            .text(d.description);
        }

        if (d.license_markdown) {
          selection
            .append('div')
            .attr('class', 'rapid-feature-label-divider');

          selection
            .append('div')
            .attr('class', 'rapid-feature-license')
            .html(marked(d.license_markdown));

          selection.select('p a')
            .attr('target', '_blank');
        }
      });

    let inputsEnter = rowsEnter
      .append('div')
      .attr('class', 'rapid-checkbox-inputs');


    let colorPickerEnter = inputsEnter
      .append('label')
      .attr('class', 'rapid-colorpicker-label');

    colorPickerEnter
      .append('input')
      .attr('type', 'text')
      .attr('class', 'rapid-feature-colorpicker')
      .on('change', changeColor);


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
      .classed('disabled', !rapidLayer.showAll());

    rows.selectAll('.rapid-feature-colorpicker')
      .property('value', d => d.color || RAPID_MAGENTA);

    rows.selectAll('.rapid-feature-checkbox')
      .property('checked', datasetEnabled)
      .attr('disabled', rapidLayer.showAll() ? null : true);
  }
}
