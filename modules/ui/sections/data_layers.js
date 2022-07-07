import { select as d3_select } from 'd3-selection';

import { t, localizer } from '../../core/localizer';
import { uiTooltip } from '../tooltip';
import { svgIcon } from '../../svg/icon';
import { uiCmd } from '../cmd';
import { uiSection } from '../section';
import { uiSettingsCustomData } from '../settings/custom_data';


export function uiSectionDataLayers(context) {
  let settingsCustomData = uiSettingsCustomData(context)
    .on('change', customChanged);

  let layers = context.layers();

  let section = uiSection('data-layers', context)
    .label(t.html('map_data.data_layers'))
    .disclosureContent(renderDisclosureContent);


  function renderDisclosureContent(selection) {
    let container = selection.selectAll('.data-layer-container')
      .data([0]);

    container.enter()
      .append('div')
      .attr('class', 'data-layer-container')
      .merge(container)
      .call(drawOsmItems)
      .call(drawQAItems)
      .call(drawCustomDataItems)
      .call(drawPanelItems);
  }


  function showsLayer(layerID) {
    const layer = layers.getLayer(layerID);
    return layer && layer.enabled;
  }


  function setLayer(layerID, val) {
    // Don't allow layer changes while drawing - #6584
    const mode = context.mode();
    if (mode && /^draw/.test(mode.id)) return;

    if (val) {
      layers.enable(layerID);
    } else {
      layers.disable(layerID);
      if (layerID === 'osm' || layerID === 'notes') {
        context.enter('browse');
      }
    }
  }


  function toggleLayer(layerID) {
    setLayer(layerID, !showsLayer(layerID));
  }


  function drawOsmItems(selection) {
    const osmKeys = new Set(['osm', 'notes']);
    const osmLayers = layers.all().filter(layer => osmKeys.has(layer.id));

    let ul = selection
      .selectAll('.layer-list-osm')
      .data([0]);

    ul = ul.enter()
      .append('ul')
      .attr('class', 'layer-list layer-list-osm')
      .merge(ul);

    let li = ul.selectAll('.list-item')
      .data(osmLayers);

    li.exit()
      .remove();

    let liEnter = li.enter()
      .append('li')
      .attr('class', d => `list-item list-item-${d.id}`);

    let labelEnter = liEnter
      .append('label')
      .each((d, i, nodes) => {
        if (d.id === 'osm') {
          d3_select(nodes[i])
            .call(uiTooltip()
              .title(t.html(`map_data.layers.${d.id}.tooltip`))
              .keys([uiCmd('⌥' + t('area_fill.wireframe.key'))])
              .placement('bottom')
            );
        } else {
          d3_select(nodes[i])
            .call(uiTooltip()
              .title(t.html(`map_data.layers.${d.id}.tooltip`))
              .placement('bottom')
            );
        }
      });

    labelEnter
      .append('input')
      .attr('type', 'checkbox')
      .on('change', (d3_event, d) => toggleLayer(d.id));

    labelEnter
      .append('span')
      .html(d => t.html(`map_data.layers.${d.id}.title`));

    // Update
    li
      .merge(liEnter)
      .classed('active', d => d.enabled)
      .selectAll('input')
      .property('checked', d => d.enabled);
  }


  function drawQAItems(selection) {
    const qaKeys = new Set(['keepRight', 'improveOSM', 'osmose']);
    const qaLayers = layers.all().filter(layer => qaKeys.has(layer.id));

    let ul = selection
      .selectAll('.layer-list-qa')
      .data([0]);

    ul = ul.enter()
      .append('ul')
      .attr('class', 'layer-list layer-list-qa')
      .merge(ul);

    let li = ul.selectAll('.list-item')
      .data(qaLayers);

    li.exit()
      .remove();

    let liEnter = li.enter()
      .append('li')
      .attr('class', d => `list-item list-item-${d.id}`);

    let labelEnter = liEnter
      .append('label')
      .each((d, i, nodes) => {
        d3_select(nodes[i])
          .call(uiTooltip()
            .title(t.html(`map_data.layers.${d.id}.tooltip`))
            .placement('bottom')
          );
      });

    labelEnter
      .append('input')
      .attr('type', 'checkbox')
      .on('change', (d3_event, d) => toggleLayer(d.id));

    labelEnter
      .append('span')
      .html(d => t.html(`map_data.layers.${d.id}.title`));

    // Update
    li
      .merge(liEnter)
      .classed('active', d => d.enabled)
      .selectAll('input')
      .property('checked', d => d.enabled);
  }



  function drawCustomDataItems(selection) {
    const dataLayer = layers.getLayer('custom-data');
    const hasData = dataLayer && dataLayer.hasData();
    const showsData = hasData && dataLayer.enabled;

    let ul = selection
      .selectAll('.layer-list-data')
      .data(dataLayer ? [0] : []);

    // Exit
    ul.exit()
      .remove();

    // Enter
    let ulEnter = ul.enter()
      .append('ul')
      .attr('class', 'layer-list layer-list-data');

    let liEnter = ulEnter
      .append('li')
      .attr('class', 'list-item-data');

    let labelEnter = liEnter
      .append('label')
      .call(uiTooltip()
        .title(t.html('map_data.layers.custom.tooltip'))
        .placement('top')
      );

    labelEnter
      .append('input')
      .attr('type', 'checkbox')
      .on('change', () => toggleLayer('custom-data'));

    labelEnter
      .append('span')
      .html(t.html('map_data.layers.custom.title'));

    liEnter
      .append('button')
      .attr('class', 'open-data-options')
      .call(uiTooltip()
        .title(t.html('settings.custom_data.tooltip'))
        .placement((localizer.textDirection() === 'rtl') ? 'right' : 'left')
      )
      .on('click', d3_event => {
        d3_event.preventDefault();
        editCustom();
      })
      .call(svgIcon('#iD-icon-more'));

    liEnter
      .append('button')
      .attr('class', 'zoom-to-data')
      .call(uiTooltip()
        .title(t.html('map_data.layers.custom.zoom'))
        .placement((localizer.textDirection() === 'rtl') ? 'right' : 'left')
      )
      .on('click', function(d3_event) {
        if (d3_select(this).classed('disabled')) return;

        d3_event.preventDefault();
        d3_event.stopPropagation();
        dataLayer.fitZoom();
      })
      .call(svgIcon('#iD-icon-framed-dot', 'monochrome'));

    // Update
    ul = ul
      .merge(ulEnter);

    ul.selectAll('.list-item-data')
      .classed('active', showsData)
      .selectAll('label')
      .classed('deemphasize', !hasData)
      .selectAll('input')
      .property('disabled', !hasData)
      .property('checked', showsData);

    ul.selectAll('button.zoom-to-data')
      .classed('disabled', !hasData);
  }


  function editCustom() {
    context.container()
      .call(settingsCustomData);
  }


  function customChanged(d) {
    let dataLayer = layers.getLayer('custom-data');

    if (d && d.url) {
      dataLayer.url(d.url);
    } else if (d && d.fileList) {
      dataLayer.fileList(d.fileList);
    }
  }


  function drawPanelItems(selection) {
    let panelsListEnter = selection.selectAll('.md-extras-list')
      .data([0])
      .enter()
      .append('ul')
      .attr('class', 'layer-list md-extras-list');

    let historyPanelLabelEnter = panelsListEnter
      .append('li')
      .attr('class', 'history-panel-toggle-item')
      .append('label')
      .call(uiTooltip()
        .title(t.html('map_data.history_panel.tooltip'))
        .keys([uiCmd('⌘⇧' + t('info_panels.history.key'))])
        .placement('top')
      );

    historyPanelLabelEnter
      .append('input')
      .attr('type', 'checkbox')
      .on('change', d3_event => {
        d3_event.preventDefault();
        context.ui().info.toggle('history');
      });

    historyPanelLabelEnter
      .append('span')
      .html(t.html('map_data.history_panel.title'));

    let measurementPanelLabelEnter = panelsListEnter
      .append('li')
      .attr('class', 'measurement-panel-toggle-item')
      .append('label')
      .call(uiTooltip()
        .title(t.html('map_data.measurement_panel.tooltip'))
        .keys([uiCmd('⌘⇧' + t('info_panels.measurement.key'))])
        .placement('top')
      );

    measurementPanelLabelEnter
      .append('input')
      .attr('type', 'checkbox')
      .on('change', d3_event => {
        d3_event.preventDefault();
        context.ui().info.toggle('measurement');
      });

    measurementPanelLabelEnter
      .append('span')
      .html(t.html('map_data.measurement_panel.title'));
  }

  context.layers().on('layerchange', section.reRender);

  return section;
}
