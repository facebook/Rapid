import { uiTooltip } from '../tooltip';
import { uiSection } from '../section';


export function uiSectionMapFeatures(context) {
  const filters = context.systems.filters;
  const l10n = context.systems.l10n;

  const section = uiSection(context, 'map-features')
    .label(l10n.tHtml('map_data.map_features'))
    .disclosureContent(renderDisclosureContent);


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
      .html(l10n.tHtml('issues.disable_all'))
      .on('click', d3_event => {
        d3_event.preventDefault();
        filters.disableAll();
      });

    footer
      .append('a')
      .attr('class', 'feature-list-link')
      .attr('href', '#')
      .html(l10n.tHtml('issues.enable_all'))
      .on('click', d3_event => {
        d3_event.preventDefault();
        filters.enableAll();
      });

    // Update
    container = container
      .merge(containerEnter);

    container.selectAll('.layer-feature-list')
      .call(drawListItems);
  }


  function drawListItems(selection) {
    let items = selection.selectAll('li')
      .data(filters.keys);

    // Exit
    items.exit()
      .remove();

    // Enter
    let enter = items.enter()
      .append('li')
      .call(uiTooltip(context)
        .title(d => l10n.tHtml(`feature.${d}.tooltip`))
        .placement('top')
      );

    let label = enter
      .append('label');

    label
      .append('input')
      .attr('type', 'checkbox')
      .attr('name', 'feature')
      .on('change', clickFeature);

    label
      .append('span')
      .html(d => l10n.tHtml(`feature.${d}.description`));

    // Update
    items = items
      .merge(enter);

    items
      .classed('active', showsFeature)
      .selectAll('input')
      .property('checked', showsFeature);
  }

  function showsFeature(d) {
    return filters.isEnabled(d);
  }

  function clickFeature(d3_event, d) {
    filters.toggle(d);
  }

  filters.on('filterchange', section.reRender);

  return section;
}
