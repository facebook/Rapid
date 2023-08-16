import { uiTooltip } from '../tooltip';
import { uiSection } from '../section';


export function uiSectionMapFeatures(context) {
  const filterSystem = context.systems.filters;
  const section = uiSection('map-features', context)
    .label(context.tHtml('map_data.map_features'))
    .disclosureContent(renderDisclosureContent)
    .expandedByDefault(false);


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
      .html(context.tHtml('issues.disable_all'))
      .on('click', d3_event => {
        d3_event.preventDefault();
        filterSystem.disableAll();
      });

    footer
      .append('a')
      .attr('class', 'feature-list-link')
      .attr('href', '#')
      .html(context.tHtml('issues.enable_all'))
      .on('click', d3_event => {
        d3_event.preventDefault();
        filterSystem.enableAll();
      });

    // Update
    container = container
      .merge(containerEnter);

    container.selectAll('.layer-feature-list')
      .call(drawListItems, filterSystem.keys, 'checkbox', 'feature', clickFeature, showsFeature);
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
      .call(uiTooltip(context)
        .title(d => context.tHtml(`${name}.${d}.tooltip`))
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
      .html(d => context.tHtml(`${name}.${d}.description`));

    // Update
    items = items
      .merge(enter);

    items
      .classed('active', active)
      .selectAll('input')
      .property('checked', active);
  }

  function showsFeature(d) {
    return filterSystem.isEnabled(d);
  }

  function clickFeature(d3_event, d) {
    filterSystem.toggle(d);
  }

  function showsLayer(id) {
    let layer = context.scene().layer(id);
    return layer && layer.enabled();
  }


  filterSystem.on('filterchange', section.reRender);

  return section;
}
