import { t } from '../../core/localizer';
import { uiTooltip } from '../tooltip';
import { uiSection } from '../section';


export function uiSectionMapFeatures(context) {
  const section = uiSection('map-features', context)
    .label(t.html('map_data.map_features'))
    .disclosureContent(renderDisclosureContent)
    .expandedByDefault(false);

  const featureKeys = context.features().keys();


  function renderDisclosureContent(selection) {
    let container = selection.selectAll('.layer-feature-list-container')
      .data([0]);

    let containerEnter = container.enter()
      .append('div')
      .attr('class', 'layer-feature-list-container');

    containerEnter
      .append('ul')
      .attr('class', 'layer-list layer-feature-list');

    let footer = containerEnter
      .append('div')
      .attr('class', 'feature-list-links section-footer');

    footer
      .append('a')
      .attr('class', 'feature-list-link')
      .attr('href', '#')
      .html(t.html('issues.disable_all'))
      .on('click', d3_event => {
        d3_event.preventDefault();
        context.features().disableAll();
      });

    footer
      .append('a')
      .attr('class', 'feature-list-link')
      .attr('href', '#')
      .html(t.html('issues.enable_all'))
      .on('click', d3_event => {
        d3_event.preventDefault();
        context.features().enableAll();
      });

    // Update
    container = container
      .merge(containerEnter);

    container.selectAll('.layer-feature-list')
      .call(drawListItems, featureKeys, 'checkbox', 'feature', clickFeature, showsFeature);
  }


  function drawListItems(selection, data, type, name, change, active) {
    let items = selection.selectAll('li')
      .data(data);

    // Exit
    items.exit()
      .remove();

    // Enter
    let enter = items.enter()
      .append('li')
      .call(uiTooltip()
        .title(function(d) {
          let tip = t.html(`${name}.${d}.tooltip`);
          if (autoHiddenFeature(d)) {
            const msg = showsLayer('osm') ? t.html('map_data.autohidden') : t.html('map_data.osmhidden');
            tip += `<div>${msg}</div>`;
          }
          return tip;
        })
        .placement('top')
      );

    let label = enter
      .append('label');

    label
      .append('input')
      .attr('type', type)
      .attr('name', name)
      .on('change', change);

    label
      .append('span')
      .html(d => t.html(`${name}.${d}.description`));

    // Update
    items = items
      .merge(enter);

    items
      .classed('active', active)
      .selectAll('input')
      .property('checked', active)
      .property('indeterminate', autoHiddenFeature);
  }

  function autoHiddenFeature(d) {
    return context.features().autoHidden(d);
  }

  function showsFeature(d) {
    return context.features().enabled(d);
  }

  function clickFeature(d3_event, d) {
    context.features().toggle(d);
  }

  function showsLayer(id) {
    let layer = context.scene().layer(id);
    return layer && layer.enabled();
  }


  context.features()
    .on('change.map_features', section.reRender);

  return section;
}
