import { utilEntityOrMemberSelector } from '@rapid-sdk/util';

import { uiIcon } from './icon';
import { uiTooltip } from './tooltip';


export function uiCommitWarnings(context) {

  function commitWarnings(selection) {
    const issuesBySeverity = context.validationSystem()
      .getIssuesBySeverity({ what: 'edited', where: 'all', includeDisabledRules: true });

    for (let severity in issuesBySeverity) {
      let issues = issuesBySeverity[severity];

      if (severity !== 'error') {      // exclude 'fixme' and similar - iD#8603
        issues = issues.filter(issue => issue.type !== 'help_request');
      }

      const section = `${severity}-section`;
      const issueClass = `${severity}-item`;

      let container = selection.selectAll('.' + section)
        .data(issues.length ? [0] : []);

      container.exit()
        .remove();

      let containerEnter = container.enter()
        .append('div')
        .attr('class', 'modal-section ' + section + ' fillL2');

      containerEnter
        .append('h3')
        .html(severity === 'warning' ? context.tHtml('commit.warnings') : context.tHtml('commit.errors'));

      containerEnter
        .append('ul')
        .attr('class', 'changeset-list');

      container = containerEnter
        .merge(container);


      let items = container.select('ul').selectAll('li')
        .data(issues, d => d.key);

      items.exit()
        .remove();

      let itemsEnter = items.enter()
        .append('li')
        .attr('class', issueClass);

      let buttons = itemsEnter
        .append('button')
        .on('mouseover', (d3_event, d) => {
          if (d.entityIds) {
            context.surface().selectAll(utilEntityOrMemberSelector(d.entityIds, context.graph() ) )
              .classed('hover', true);
          }
        })
        .on('mouseout', () => {
          context.surface().selectAll('.hover')
            .classed('hover', false);
        })
        .on('click', (d3_event, d) => {
          context.validationSystem().focusIssue(d);
        });

      buttons
        .call(uiIcon('#rapid-icon-alert', 'pre-text'));

      buttons
        .append('strong')
        .attr('class', 'issue-message');

      buttons
        .filter(d => d.tooltip)
        .call(uiTooltip(context)
          .title(d => d.tooltip)
          .placement('top')
        );

      items = itemsEnter
        .merge(items);

      items.selectAll('.issue-message')
        .html(d => d.message(context));
    }
  }


  return commitWarnings;
}
