import debounce from 'lodash-es/debounce.js';
import { select as d3_select } from 'd3-selection';
import { geoSphericalDistance } from '@rapid-sdk/math';

import { uiIcon } from '../icon.js';
import { uiSection } from '../section.js';
import { utilHighlightEntities } from '../../util/index.js';

const MAX_ISSUES = 1000;


/**
 *  uiSectionValidateIssues
 *  @param  `context`    Global shared application context
 *  @param  `sectionID`  String 'issues-errors' or 'issues-warnings'
 *  @param  `severity`   String 'error' or 'warning'
 */
export function uiSectionValidationIssues(context, sectionID, severity) {
  const editor = context.systems.editor;
  const l10n = context.systems.l10n;
  const map = context.systems.map;
  const storage = context.systems.storage;
  const urlhash = context.systems.urlhash;
  const validator = context.systems.validator;
  const viewport = context.viewport;

  const section = uiSection(context, sectionID)
    .label(sectionLabel)
    .shouldDisplay(sectionShouldDisplay)
    .disclosureContent(renderDisclosureContent);

  let _issues = [];


  function sectionLabel() {
    const countText = _issues.length > MAX_ISSUES ? `${MAX_ISSUES}+` : String(_issues.length);
    const titleText = l10n.t(`issues.${severity}s.list_title`);
    return l10n.t('inspector.title_count', { title: titleText, count: countText });
  }


  function sectionShouldDisplay() {
    return _issues.length;
  }


  // Accepts a d3-selection to render the content into
  function renderDisclosureContent(selection) {
    const graph = editor.staging.graph;
    const centerLoc = viewport.centerLoc();

    // sort issues by distance away from the center of the map
    let issues = _issues
      .map(function withDistance(issue) {
        const extent = issue.extent(graph);
        const dist = extent ? geoSphericalDistance(centerLoc, extent.center()) : 0;
        return Object.assign(issue, { dist: dist });
      })
      .sort((a, b) => a.dist - b.dist);   // nearest to farthest

    issues = issues.slice(0, MAX_ISSUES);

    selection
      .call(drawIssuesList, issues);
  }


  // Creates the issues list if needed and updates it with the current issues
  function drawIssuesList(selection, issues) {
    const showAutoFix = (storage.getItem('rapid-internal-feature.showAutoFix') === 'true');

    let list = selection.selectAll('.issues-list')
      .data([0]);

    list = list.enter()
      .append('ul')
      .attr('class', `layer-list issues-list ${severity}s-list`)
      .merge(list);


    let items = list.selectAll('li')
      .data(issues, d => d.key);

    // Exit
    items.exit()
      .remove();

    // Enter
    const itemsEnter = items.enter()
      .append('li')
      .attr('class', d => `issue severity-${d.severity}`);

    const labelsEnter = itemsEnter
      .append('button')
      .attr('class', 'issue-label')
      .on('click',     (d3_event, d) => validator.focusIssue(d))
      .on('mouseover', (d3_event, d) => utilHighlightEntities(d.entityIds, true, context))
      .on('mouseout',  (d3_event, d) => utilHighlightEntities(d.entityIds, false, context));

    const textEnter = labelsEnter
      .append('span')
      .attr('class', 'issue-text');

    textEnter
      .append('span')
      .attr('class', 'issue-icon')
      .each((d, i, nodes) => {
        const which = (d.severity === 'warning') ? 'alert' : 'error';
        d3_select(nodes[i])
          .call(uiIcon(`#rapid-icon-${which}`));
      });

    textEnter
      .append('span')
      .attr('class', 'issue-message');

    labelsEnter
      .append('span')
      .attr('class', 'issue-autofix')
      .append('button')
      .attr('title', l10n.t('issues.fix_one.title'))
      .attr('class', 'autofix action')
      .on('click', clickAutoFix)
      .call(uiIcon('#rapid-icon-wrench'));


    // Update
    items = items
      .merge(itemsEnter)
      .order();

    items.selectAll('.issue-message')
      .html(d => d.message(context));

    items.selectAll('.issue-autofix')
      .classed('hide', d => !(showAutoFix && d.autoArgs));


    const autofixable = issues.filter(issue => issue.autoArgs);
    let autoFixAll = selection.selectAll('.autofix-all')
      .data(showAutoFix && autofixable.length ? [0] : []);

    // exit
    autoFixAll.exit()
      .remove();

    // enter
    let autoFixAllEnter = autoFixAll.enter()
      .insert('div', '.issues-list')
      .attr('class', 'autofix-all');

    let linkEnter = autoFixAllEnter
      .append('a')
      .attr('class', 'autofix-all-link')
      .attr('href', '#');

    linkEnter
      .append('span')
      .attr('class', 'autofix-all-link-text')
      .text(l10n.t('issues.fix_all.title'));

    linkEnter
      .append('span')
      .attr('class', 'autofix-all-link-icon')
      .call(uiIcon('#rapid-icon-wrench'));

    // update
    autoFixAll = autoFixAll
      .merge(autoFixAllEnter);

    autoFixAll.selectAll('.autofix-all-link')
      .on('click', (d3_event) => clickAutoFixAll(d3_event, autofixable));
  }


  // User clicked "Autofix", fix a single issue.
  function clickAutoFix(d3_event, issue) {
    if (d3_event) {
      d3_event.preventDefault();
      d3_event.stopPropagation();
    }

    utilHighlightEntities(issue.entityIds, false, context);  // unhighlight
    editor.perform(issue.autoArgs[0]);   // autoArgs = [action, annotation]
    editor.commit({ annotation: issue.autoArgs[1], selectedIDs: issue.entityIds });
  }


  // User clicked "Autofix All", fix all the autofixable issues.
  function clickAutoFixAll(d3_event, issues) {
    if (d3_event) {
      d3_event.preventDefault();
      d3_event.stopPropagation();
    }

    editor.beginTransaction();

    for (const issue of issues) {
      const action = issue.autoArgs[0];  // autoArgs = [action, annotation]
      editor.perform(action);
    }

    editor.commit({ annotation: l10n.t('issues.fix_all.annotation') });
    editor.endTransaction();
  }


  // Get the current display options for the issues lists
  function getOptions() {
    return {
      what: storage.getItem('validate-what') || 'edited',
      where: storage.getItem('validate-where') || 'all'
    };
  }


  // Get and cache the issues to display, unordered
  function reloadIssues() {
    const options = getOptions();
    _issues = validator.getIssuesBySeverity(options)[severity];
  }


  // Only update the contents if the issues pane is actually open
  function isVisible() {
    return context.container().selectAll('.map-panes .issues-pane.shown').size();
  }


  // Rerender the issue pane contents, but wait for an idle moment
  function deferredRender() {
    window.requestIdleCallback(() => {
      if (!isVisible()) return;
      reloadIssues();
      section.reRender();
    });
  }


  // event handlers to refresh the lists
  validator.on('validated', deferredRender);

  urlhash.on('hashchange', (currParams, prevParams) => {
    if (currParams.get('poweruser') !== prevParams.get('poweruser')) {   // change in poweruser status
      deferredRender();
    }
  });

  map.on('draw',
    debounce(() => {
      deferredRender();
    }, 500, { leading: false, trailing: true })  // after map has stopped moving for 500ms
  );

  return section;
}
