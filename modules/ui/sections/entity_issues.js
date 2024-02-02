import { select as d3_select } from 'd3-selection';
import { utilArrayIdentical } from '@rapid-sdk/util';

import { uiIcon } from '../icon.js';
import { uiSection } from '../section.js';
import { utilHighlightEntities } from '../../util/index.js';


export function uiSectionEntityIssues(context) {
  const editor = context.systems.editor;
  const l10n = context.systems.l10n;
  const map = context.systems.map;
  const storage = context.systems.storage;
  const validator = context.systems.validator;
  const preference = storage.getItem('entity-issues.reference.expanded') || 'true';

  let _isExpanded = (preference === 'true');
  let _entityIDs = [];
  let _issues = [];
  let _activeIssueID;


  let section = uiSection(context, 'entity-issues')
    .shouldDisplay(() => _issues.length)
    .label(() => {
      return l10n.t('inspector.title_count', { title: l10n.t('issues.list_title'), count: _issues.length });
    })
    .disclosureContent(renderDisclosureContent);


  function reloadIssues() {
    _issues = validator.getSharedEntityIssues(_entityIDs, { includeDisabledRules: true });
  }


  function makeActiveIssue(issueID) {
    _activeIssueID = issueID;
    section.selection().selectAll('.issue-container')
      .classed('active', d => d.id === _activeIssueID);
  }


  function renderDisclosureContent(selection) {
    selection.classed('grouped-items-area', true);
    _activeIssueID = _issues.length ? _issues[0].id : null;

    let containers = selection.selectAll('.issue-container')
      .data(_issues, d => d.key);

    // Exit
    containers.exit()
      .remove();

    // Enter
    let containersEnter = containers.enter()
      .append('div')
      .attr('class', 'issue-container');


    let itemsEnter = containersEnter
      .append('div')
      .attr('class', d => `issue severity-${d.severity}`)
      .on('mouseover.highlight', function(d3_event, d) {
        // don't hover-highlight the selected entity
        const otherIDs = d.entityIds.filter(id => !_entityIDs.includes(id));
        utilHighlightEntities(otherIDs, true, context);
      })
      .on('mouseout.highlight', function(d3_event, d) {
        const otherIDs = d.entityIds.filter(id => !_entityIDs.includes(id));
        utilHighlightEntities(otherIDs, false, context);
      });

    let labelsEnter = itemsEnter
      .append('div')
      .attr('class', 'issue-label');

    let textEnter = labelsEnter
      .append('button')
      .attr('class', 'issue-text')
      .on('click', function(d3_event, d) {
        makeActiveIssue(d.id);    // expand only the clicked item
        const graph = editor.staging.graph;
        const extent = d.extent(graph);
        if (extent) {
          const setZoom = Math.max(map.zoom(), 19);
          map.centerZoomEase(extent.center(), setZoom);
        }
      });

    textEnter
      .each((d, i, nodes) => {
        const which = (d.severity === 'warning') ? 'alert' : 'error';
        d3_select(nodes[i])
          .call(uiIcon(`#rapid-icon-${which}`, 'issue-icon'));
      });

    textEnter
      .append('span')
      .attr('class', 'issue-message');


    let infoButton = labelsEnter
      .append('button')
      .attr('class', 'issue-info-button')
      .attr('title', l10n.t('icons.information'))
      .call(uiIcon('#rapid-icon-inspect'));

    infoButton
      .on('click', function(d3_event) {
        d3_event.stopPropagation();
        d3_event.preventDefault();
        this.blur();    // avoid keeping focus on the button - iD#4641

        const container = d3_select(this.parentNode.parentNode.parentNode);
        const info = container.selectAll('.issue-info');
        const isExpanded = info.classed('expanded');
        _isExpanded = !isExpanded;
        storage.setItem('entity-issues.reference.expanded', _isExpanded);  // update preference

        if (isExpanded) {
          info
            .transition()
            .duration(200)
            .style('max-height', '0px')
            .style('opacity', '0')
            .on('end', () => info.classed('expanded', false));
        } else {
          info
            .classed('expanded', true)
            .transition()
            .duration(200)
            .style('max-height', '200px')
            .style('opacity', '1')
            .on('end', () => info.style('max-height', null));
        }
      });

    itemsEnter
      .append('ul')
      .attr('class', 'issue-fix-list');

    containersEnter
      .append('div')
      .attr('class', 'issue-info' + (_isExpanded ? ' expanded' : ''))
      .style('max-height', (_isExpanded ? null : '0'))
      .style('opacity', (_isExpanded ? '1' : '0'))
      .each((d, i, nodes) => {
        const selection = d3_select(nodes[i]);
        if (typeof d.reference === 'function') {
          selection.call(d.reference);
        } else {
          selection.text(l10n.t('inspector.no_documentation_key'));
        }
      });


    // Update
    containers = containers
      .merge(containersEnter)
      .classed('active', d => d.id === _activeIssueID);

    containers.selectAll('.issue-message')
      .html(d => d.message(context));

    // fixes
    let fixLists = containers.selectAll('.issue-fix-list');

    let fixes = fixLists.selectAll('.issue-fix-item')
      .data(d => (d.fixes ? d.fixes() : []), d => d.id);

    fixes.exit()
      .remove();

    let fixesEnter = fixes.enter()
      .append('li')
      .attr('class', 'issue-fix-item');

    let buttons = fixesEnter
      .append('button')
      .on('click', function(d3_event, d) {
        // not all fixes are actionable
        if (d3_select(this).attr('disabled') || !d.onClick) return;

        // Don't run another fix for this issue within a second of running one
        // (Necessary for "Select a feature type" fix. Most fixes should only ever run once)
        if (d.issue.dateLastRanFix && new Date() - d.issue.dateLastRanFix < 1000) return;
        d.issue.dateLastRanFix = new Date();

        utilHighlightEntities(d.issue.entityIds.concat(d.entityIds), false, context);  // remove hover-highlighting
        d.onClick();
      })
      .on('mouseover.highlight', (d3_event, d) => utilHighlightEntities(d.issue.entityIds, true, context))
      .on('mouseout.highlight', (d3_event, d) => utilHighlightEntities(d.issue.entityIds, false, context));

    buttons
      .each((d, i, nodes) => {
        const iconName = d.icon ?? 'rapid-icon-wrench';
        d3_select(nodes[i]).call(uiIcon(`#${iconName}`, 'fix-icon'));
      });

    buttons
      .append('span')
      .attr('class', 'fix-message')
      .text(d => d.title);

    fixesEnter.merge(fixes)
      .selectAll('button')
      .classed('actionable', d => typeof d.onClick === 'function')
      .attr('disabled', d => typeof d.onClick === 'function' ? null : 'true')
      .attr('title', d => d.disabledReason ?? null);
  }


  const _onValidated = () => {
    reloadIssues();   // Refresh on validated events
    section.reRender();
  };

  const _onFocused = (issue) => {
    makeActiveIssue(issue.id);
  };


  // Add or replace event handlers
  validator.off('validated', _onValidated);
  validator.off('focusedIssue', _onFocused);
  validator.on('validated', _onValidated);
  validator.on('focusedIssue', _onFocused);



  section.entityIDs = function(val) {
    if (val === undefined) return _entityIDs;

    if (!_entityIDs || !val || !utilArrayIdentical(_entityIDs, val)) {
      _entityIDs = val;
      _activeIssueID = null;
      reloadIssues();
    }
    return section;
  };


  return section;
}
