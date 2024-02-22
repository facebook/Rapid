import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';
import { Extent, numWrap } from '@rapid-sdk/math';

import { JXON } from '../util/jxon.js';
import { osmChangeset } from '../osm/index.js';
import { uiIcon } from './icon.js';
import { utilDetect, utilKeybinding, utilRebind } from '../util/index.js';


export function uiConflicts(context) {
  const editor = context.systems.editor;
  const l10n = context.systems.l10n;
  const map = context.systems.map;

  const dispatch = d3_dispatch('cancel', 'save');
  const keybinding = utilKeybinding('conflicts');
  let _origChanges;
  let _conflictList;
  let _shownConflictIndex;


  function keybindingOn() {
    d3_select(document)
      .call(keybinding.on('⎋', cancel, true));
  }

  function keybindingOff() {
    d3_select(document)
      .call(keybinding.unbind);
  }

  function tryAgain() {
    keybindingOff();
    dispatch.call('save');
  }

  function cancel() {
    keybindingOff();
    dispatch.call('cancel');
  }


  function conflicts(selection) {
    keybindingOn();

    let headerEnter = selection.selectAll('.header')
      .data([0])
      .enter()
      .append('div')
      .attr('class', 'header fillL');

    headerEnter
      .append('button')
      .attr('class', 'fr')
      .on('click', cancel)
      .call(uiIcon('#rapid-icon-close'));

    headerEnter
      .append('h3')
      .html(l10n.tHtml('save.conflict.header'));

    let bodyEnter = selection.selectAll('.body')
      .data([0])
      .enter()
      .append('div')
      .attr('class', 'body fillL');

    let conflictsHelpEnter = bodyEnter
      .append('div')
      .attr('class', 'conflicts-help')
      .html(l10n.tHtml('save.conflict.help'));


    // Download changes link
    const detected = utilDetect();
    let changeset = new osmChangeset();
    delete changeset.id;  // Export without changeset_id

    const data = JXON.stringify(changeset.osmChangeJXON(_origChanges));
    const blob = new Blob([data], { type: 'text/xml;charset=utf-8;' });
    const fileName = 'changes.osc';

    let linkEnter = conflictsHelpEnter.selectAll('.download-changes')
      .append('a')
      .attr('class', 'download-changes');

    if (detected.download) {   // All except IE11 and Edge
      linkEnter                // download the data as a file
        .attr('href', window.URL.createObjectURL(blob))
        .attr('download', fileName);
    } else {                   // IE11 and Edge
      linkEnter                // open data uri in a new tab
        .attr('target', '_blank')
        .on('click.download', () => navigator.msSaveBlob(blob, fileName));
    }

    linkEnter
      .call(uiIcon('#rapid-icon-load', 'inline'))
      .append('span')
      .html(l10n.tHtml('save.conflict.download_changes'));

    bodyEnter
      .append('div')
      .attr('class', 'conflict-container fillL3')
      .call(showConflict, 0);

    bodyEnter
      .append('div')
      .attr('class', 'conflicts-done')
      .attr('opacity', 0)
      .style('display', 'none')
      .html(l10n.tHtml('save.conflict.done'));

    let buttonsEnter = bodyEnter
      .append('div')
      .attr('class','buttons col12 joined conflicts-buttons');

    buttonsEnter
      .append('button')
      .attr('disabled', _conflictList.length > 1)
      .attr('class', 'action conflicts-button col6')
      .html(l10n.tHtml('save.title'))
      .on('click.try_again', tryAgain);

    buttonsEnter
      .append('button')
      .attr('class', 'secondary-action conflicts-button col6')
      .html(l10n.tHtml('confirm.cancel'))
      .on('click.cancel', cancel);
  }


  function showConflict(selection, index) {
    index = numWrap(index, 0, _conflictList.length);
    _shownConflictIndex = index;

    const parent = d3_select(selection.node().parentNode);

    // enable save button if this is the last conflict being reviewed..
    if (index === _conflictList.length - 1) {
      window.setTimeout(() => {
        parent.select('.conflicts-button')
          .attr('disabled', null);

        parent.select('.conflicts-done')
          .transition()
          .attr('opacity', 1)
          .style('display', 'block');
      }, 250);
    }

    let conflict = selection
      .selectAll('.conflict')
      .data([_conflictList[index]]);

    conflict.exit()
      .remove();

    let conflictEnter = conflict.enter()
      .append('div')
      .attr('class', 'conflict');

    conflictEnter
      .append('h4')
      .attr('class', 'conflict-count')
      .html(l10n.tHtml('save.conflict.count', { num: index + 1, total: _conflictList.length }));

    conflictEnter
      .append('a')
      .attr('class', 'conflict-description')
      .attr('href', '#')
      .text(d => d.name)
      .on('click', (d3_event, d) => {
        d3_event.preventDefault();
        showEntityID(d.id);
      });

    let details = conflictEnter
      .append('div')
      .attr('class', 'conflict-detail-container');

    details
      .append('ul')
      .attr('class', 'conflict-detail-list')
      .selectAll('li')
      .data(d => d.details || [])
      .enter()
      .append('li')
      .attr('class', 'conflict-detail-item')
      .html(d => d);

    details
      .append('div')
      .attr('class', 'conflict-choices')
      .call(addChoices);

    details
      .append('div')
      .attr('class', 'conflict-nav-buttons joined cf')
      .selectAll('button')
      .data(['previous', 'next'])
      .enter()
      .append('button')
      .html(d => l10n.tHtml(`save.conflict.${d}`))
      .attr('class', 'conflict-nav-button action col6')
      .attr('disabled', (d, i) => {
        return (i === 0 && index === 0) || (i === 1 && index === _conflictList.length - 1) || null;
      })
      .on('click', (d3_event, d) => {
        d3_event.preventDefault();

        const container = parent.selectAll('.conflict-container');
        const sign = (d === 'previous') ? -1 : 1;

        container
          .selectAll('.conflict')
          .remove();

        container
          .call(showConflict, index + sign);
      });
  }


  function addChoices(selection) {
    let choices = selection
      .append('ul')
      .attr('class', 'layer-list')
      .selectAll('li')
      .data(d => d.choices || []);

    // enter
    let choicesEnter = choices.enter()
      .append('li')
      .attr('class', 'layer');

    let labelEnter = choicesEnter
      .append('label');

    labelEnter
      .append('input')
      .attr('type', 'radio')
      .attr('name', d => d.id)
      .on('change', function(d3_event, d) {
        const ul = this.parentNode.parentNode.parentNode;
        ul.__data__.chosen = d.id;
        choose(d3_event, ul, d);
      });

    labelEnter
      .append('span')
      .text(d => d.text);

    // update
    choicesEnter
      .merge(choices)
      .each((d, i, nodes) => {
        const ul = nodes[i].parentNode;
        if (ul.__data__.chosen === d.id) {
          choose(null, ul, d);
        }
      });
  }


  function choose(d3_event, ul, datum) {
    if (d3_event) d3_event.preventDefault();

    d3_select(ul)
      .selectAll('li')
      .classed('active', d => d === datum)
      .selectAll('input')
      .property('checked', d => d === datum);

    let extent = new Extent();
    let graph, entity;

    graph = editor.staging.graph;
    entity = graph.hasEntity(datum.id);
    if (entity) extent = extent.extend(entity.extent(graph));

    datum.action();

    graph = editor.staging.graph;
    entity = graph.hasEntity(datum.id);
    if (entity) extent = extent.extend(entity.extent(graph));

    showEntityID(datum.id, extent);
  }


  function showEntityID(id, extent) {
// todo replace legacy surface css class .hover
//    context.surface().selectAll('.hover')
//      .classed('hover', false);

    const graph = editor.staging.graph;
    const entity = graph.hasEntity(id);
    if (entity) {
      if (extent) {
          map.trimmedExtent(extent);
      } else {
          map.fitEntitiesEase(entity);
      }
// todo replace legacy surface css class .hover
//      context.surface().selectAll(utilEntityOrMemberSelector([entity.id], graph))
//        .classed('hover', true);
    }
  }


  // The conflict list should be an Array of Objects like:
  // {
  //   id: id,
  //   name: entityName(local),
  //   details: merge.conflicts(),
  //   chosen: 1,
  //   choices: [
  //     choice(id, keepMine, forceLocal),
  //     choice(id, keepTheirs, forceRemote)
  //   ]
  // }
  conflicts.conflictList = function(val) {
    if (!arguments.length) return _conflictList;
    _conflictList = val;
    return conflicts;
  };


  conflicts.origChanges = function(val) {
    if (!arguments.length) return _origChanges;
    _origChanges = val;
    return conflicts;
  };


  conflicts.shownEntityIds = function() {
    if (_conflictList && typeof _shownConflictIndex === 'number') {
      return [_conflictList[_shownConflictIndex].id];
    }
    return [];
  };


  return utilRebind(conflicts, dispatch, 'on');
}
