import { select as d3_select } from 'd3-selection';

import { osmEntity } from '../../osm/entity.js';
import { uiIcon } from '../icon.js';
import { uiSection } from '../section.js';
import { utilHighlightEntities } from '../../util/index.js';


export function uiSectionSelectionList(context) {
  const editor = context.systems.editor;
  const l10n = context.systems.l10n;
  const presets = context.systems.presets;

  let _selectedIDs = [];

  const section = uiSection(context, 'selected-features')
    .shouldDisplay(sectionShouldDisplay)
    .label(sectionLabel)
    .disclosureContent(renderDisclosureContent);

  section.entityIDs = function(val) {
    if (!arguments.length) return _selectedIDs;
    _selectedIDs = val;
    return section;
  };


  function sectionShouldDisplay() {
    return _selectedIDs.length > 1;
  }

  function sectionLabel() {
    return l10n.t('inspector.title_count', { title: l10n.t('inspector.features'), count: _selectedIDs.length });
  }

  function selectEntity(d3_event, entity) {
    context.enter('select-osm', { selection: { osm: [entity.id] }} );
  }

  function deselectEntity(d3_event, entity) {
    let selectedIDs = _selectedIDs.slice();
    const index = selectedIDs.indexOf(entity.id);
    if (index > -1) {
      selectedIDs.splice(index, 1);
      context.enter('select-osm', { selection: { osm: selectedIDs }} );
    }
  }


  function renderDisclosureContent(selection) {
    const graph = editor.staging.graph;

    let list = selection.selectAll('.feature-list')
      .data([0]);

    list = list.enter()
      .append('ul')
      .attr('class', 'feature-list')
      .merge(list);

    const entities = _selectedIDs
      .map(d => graph.hasEntity(d))
      .filter(Boolean);

    let items = list.selectAll('.feature-list-item')
      .data(entities, osmEntity.key);

    items.exit()
      .remove();

    // Enter
    let enter = items.enter()
      .append('li')
      .attr('class', 'feature-list-item')
      .each((d, i, nodes) => {
        d3_select(nodes[i])
          .on('mouseover', () => utilHighlightEntities([d.id], true, context))
          .on('mouseout', () => utilHighlightEntities([d.id], false, context));
      });

    let label = enter
      .append('button')
      .attr('class', 'label')
      .on('click', selectEntity);

    label
      .append('span')
      .attr('class', 'entity-geom-icon')
      .call(uiIcon('', 'pre-text'));

    label
      .append('span')
      .attr('class', 'entity-type');

    label
      .append('span')
      .attr('class', 'entity-name');

    enter
      .append('button')
      .attr('class', 'close')
      .attr('title', l10n.t('icons.deselect'))
      .on('click', deselectEntity)
      .call(uiIcon('#rapid-icon-close'));

    // Update
    items = items.merge(enter);

    items.selectAll('.entity-geom-icon use')
      .attr('href', (d, i, nodes) => {
        const thiz = d3_select(nodes[i]);
        const entity = thiz._groups[0][0].parentNode.parentNode.__data__;
        return '#rapid-icon-' + entity.geometry(graph);
      });

    items.selectAll('.entity-type')
      .html(entity => presets.match(entity, graph).name());

    items.selectAll('.entity-name')
      .html(d => {
        const entity = graph.entity(d.id);
        return l10n.displayName(entity.tags);
      });
  }


  editor.on('stablechange', () => section.reRender());

  return section;
}
