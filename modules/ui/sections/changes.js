import { select as d3_select } from 'd3-selection';
import { utilEntityOrMemberSelector } from '@rapid-sdk/util';

import { JXON } from '../../util/jxon';
import { actionDiscardTags } from '../../actions/discard_tags';
import { osmChangeset } from '../../osm';
import { uiIcon } from '../icon';
import { uiSection } from '../section';
import { utilDetect } from '../../util';


export function uiSectionChanges(context) {
  const dataloader = context.systems.dataloader;
  const editor = context.systems.editor;
  const l10n = context.systems.l10n;
  let detected = utilDetect();

  let _discardTags = {};
  dataloader.getDataAsync('discarded')
    .then(d => _discardTags = d)
    .catch(() => { /* ignore */ });

  let section = uiSection(context, 'changes-list')
    .label(() => {
      const summary = editor.difference().summary();
      return l10n.t('inspector.title_count', { title: l10n.tHtml('commit.changes'), count: summary.size });
    })
    .disclosureContent(renderDisclosureContent);


  function renderDisclosureContent(selection) {
    const summary = [...editor.difference().summary().values()];

    let container = selection.selectAll('.commit-section')
      .data([0]);

    let containerEnter = container.enter()
      .append('div')
      .attr('class', 'commit-section');

    containerEnter
      .append('ul')
      .attr('class', 'changeset-list');

    container = containerEnter
      .merge(container);


    let items = container.select('ul').selectAll('li')
      .data(summary);

    let itemsEnter = items.enter()
      .append('li')
      .attr('class', 'change-item');

    let buttons = itemsEnter
      .append('button')
      .on('mouseover', mouseover)
      .on('mouseout', mouseout)
      .on('click', click);

    buttons
      .each((d, i, nodes) => {
        const geom = d.entity.geometry(d.graph);
        d3_select(nodes[i])
          .call(uiIcon(`#rapid-icon-${geom}`, `pre-text ${d.changeType}`));
      });

    buttons
      .append('span')
      .attr('class', 'change-type')
      .html(d => l10n.tHtml(`commit.${d.changeType}`) + ' ');

    buttons
      .append('strong')
      .attr('class', 'entity-type')
      .html(d => {
        const matched = context.systems.presets.match(d.entity, d.graph);
        return (matched && matched.name()) || l10n.displayType(d.entity.id);
      });

    buttons
      .append('span')
      .attr('class', 'entity-name')
      .html(d => {
        const name = l10n.displayName(d.entity.tags);
        let string = '';
        if (name !== '') {
          string += ':';
        }
        return string += ' ' + name;
      });

    items = itemsEnter
      .merge(items);


    // Download changeset link
    let changeset = new osmChangeset().update({ id: undefined });
    const changes = editor.changes(actionDiscardTags(editor.difference(), _discardTags));

    delete changeset.id;  // Export without chnageset_id

    const data = JXON.stringify(changeset.osmChangeJXON(changes));
    const blob = new Blob([data], {type: 'text/xml;charset=utf-8;'});
    const fileName = 'changes.osc';

    let linkEnter = container.selectAll('.download-changes')
      .data([0])
      .enter()
      .append('a')
      .attr('class', 'download-changes');

    if (detected.download) {    // All except IE11 and Edge
      linkEnter                 // download the data as a file
        .attr('href', window.URL.createObjectURL(blob))
        .attr('download', fileName);

    } else {                    // IE11 and Edge
      linkEnter                 // open data uri in a new tab
        .attr('target', '_blank')
        .on('click.download', () => navigator.msSaveBlob(blob, fileName));
    }

    linkEnter
      .call(uiIcon('#rapid-icon-load', 'inline'))
      .append('span')
      .html(l10n.tHtml('commit.download_changes'));


    function mouseover(d) {
      if (d.entity) {
        context.surface().selectAll(
          utilEntityOrMemberSelector([d.entity.id], editor.graph())
        ).classed('hover', true);
      }
    }

    function mouseout() {
      context.surface().selectAll('.hover')
        .classed('hover', false);
    }

    function click(d3_event, change) {
      if (change.changeType !== 'deleted') {
        let entity = change.entity;
        context.systems.map.fitEntitiesEase(entity);
        context.surface().selectAll(utilEntityOrMemberSelector([entity.id], editor.graph()))
          .classed('hover', true);
      }
    }
  }

  return section;
}
