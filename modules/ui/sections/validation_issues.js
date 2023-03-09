import _debounce from 'lodash-es/debounce';
import { select as d3_select } from 'd3-selection';

import { actionNoop } from '../../actions/noop';
import { geoSphericalDistance } from '@id-sdk/geo';
import { svgIcon } from '../../svg/icon';
import { prefs } from '../../core/preferences';
import { t } from '../../core/localizer';
import { utilHighlightEntities } from '../../util';
import { uiSection } from '../section';


/**
 *  uiSectionValidateIssues
 *  @param  `context`    Global shared application context
 *  @param  `sectionID`  String 'issues-errors' or 'issues-warnings'
 *  @param  `severity`   String 'error' or 'warning'
 */
export function uiSectionValidationIssues(context, sectionID, severity) {
  const section = uiSection(sectionID, context)
    .label(sectionLabel)
    .shouldDisplay(sectionShouldDisplay)
    .disclosureContent(renderDisclosureContent);

  let _issues = [];

  function sectionLabel() {
    const countText = _issues.length > 1000 ? '1000+' : String(_issues.length);
    const titleText = t(`issues.${severity}s.list_title`);
    return t('inspector.title_count', { title: titleText, count: countText });
  }

  function sectionShouldDisplay() {
    return _issues.length;
  }

  // Accepts a d3-selection to render the content into
  function renderDisclosureContent(selection) {
    const center = context.map().center();
    const graph = context.graph();

    // sort issues by distance away from the center of the map
    let toDisplay = _issues
      .map(function withDistance(issue) {
        const extent = issue.extent(graph);
        const dist = extent ? geoSphericalDistance(center, extent.center()) : 0;
        return Object.assign(issue, { dist: dist });
      })
      .sort((a, b) => a.dist - b.dist);   // nearest to farthest

    // cut off at 1000
    toDisplay = toDisplay.slice(0, 1000);

    selection
      .call(drawIssuesList, toDisplay);
  }


  //
  // Creates the issues list if needed and updates it with the current issues
  //
  function drawIssuesList(selection, issues) {
    const showAutoFix = (prefs('rapid-internal-feature.showAutoFix') === 'true');

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
    let itemsEnter = items.enter()
      .append('li')
      .attr('class', d => `issue severity-${d.severity}`);

    let labelsEnter = itemsEnter
      .append('button')
      .attr('class', 'issue-label')
      .on('click',     (d3_event, d) => context.validator().focusIssue(d))
      .on('mouseover', (d3_event, d) => utilHighlightEntities(d.entityIds, true, context))
      .on('mouseout',  (d3_event, d) => utilHighlightEntities(d.entityIds, false, context));

    let textEnter = labelsEnter
      .append('span')
      .attr('class', 'issue-text');

    textEnter
      .append('span')
      .attr('class', 'issue-icon')
      .each((d, i, nodes) => {
        const iconName = '#rapid-icon-' + (d.severity === 'warning' ? 'alert' : 'error');
        d3_select(nodes[i])
          .call(svgIcon(iconName));
      });

    textEnter
      .append('span')
      .attr('class', 'issue-message');

    if (showAutoFix) {  // for each issue, append autofix button if issue has `autoArgs`
      labelsEnter
        .append('span')
        .attr('class', 'issue-autofix')
        .each((d, i, nodes) => {
          if (!d.autoArgs) return;

          d3_select(nodes[i])
            .append('button')
            .attr('title', t('issues.fix_one.title'))
            .datum(d)  // set button datum to the issue
            .attr('class', 'autofix action')
            .on('click', (d3_event, d) => {
              d3_event.preventDefault();
              d3_event.stopPropagation();

              utilHighlightEntities(d.entityIds, false, context);  // unhighlight
              context.perform.apply(context, d.autoArgs);
              context.validator().validate();
            })
            .call(svgIcon('#rapid-icon-wrench'));
        });
    }

    // Update
    items = items
      .merge(itemsEnter)
      .order();

    items.selectAll('.issue-message')
      .html(d => d.message(context));

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
      .html(t.html('issues.fix_all.title'));

    linkEnter
      .append('span')
      .attr('class', 'autofix-all-link-icon')
      .call(svgIcon('#rapid-icon-wrench'));

    // update
    autoFixAll = autoFixAll
      .merge(autoFixAllEnter);

    autoFixAll.selectAll('.autofix-all-link')
      .on('click', () => {
        context.pauseChangeDispatch();
        context.perform(actionNoop());   // perform a noop edit that will be replaced by the fixes

        autofixable.forEach(issue => {
          let args = issue.autoArgs.slice();  // copy
          if (typeof args[args.length - 1] !== 'function') {
            args.pop();
          }
          args.push(t('issues.fix_all.annotation'));
          context.replace.apply(context, args);  // this does the fix
        });
        context.resumeChangeDispatch();
        context.validator().validate();
      });
  }


  // get the current display options for the issues lists
  function getOptions() {
    return {
      what: prefs('validate-what') || 'edited',
      where: prefs('validate-where') || 'all'
    };
  }

  // get and cache the issues to display, unordered
  function reloadIssues() {
    const options = getOptions();
    _issues = context.validator().getIssuesBySeverity(options)[severity];
  }

  // only update the contents if the issues pane is actually open
  function isVisible() {
    return context.container().selectAll('.map-panes .issues-pane.shown').size();
  }


  // event handlers to refresh the lists

  context.validator().on(`validated.uiSectionValidationIssues-${sectionID}`, () => {
    window.requestIdleCallback(() => {
      if (!isVisible()) return;
      reloadIssues();
      section.reRender();
    });
  });

  context.map().on('draw',
    _debounce(() => {
      window.requestIdleCallback(() => {
        if (!isVisible()) return;
        if (getOptions().where === 'visible') {  // must refetch issues if they are viewport-dependent
          reloadIssues();
        }
        section.reRender();
      });
    }, 1000)  // after map has stopped moving for 1sec
  );

  return section;
}
