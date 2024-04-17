import { uiIcon } from './icon.js';


export function uiCommitWarnings(context) {
  const l10n = context.systems.l10n;
  const validator = context.systems.validator;


  function commitWarnings(selection) {
    const issuesBySeverity = validator
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
        .html(severity === 'warning' ? l10n.tHtml('commit.warnings') : l10n.tHtml('commit.errors'));

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
//        .on('mouseover', (d3_event, d) => {
//// todo replace legacy surface css class .hover
//          if (d.entityIds) {
//            const graph = editor.staging.graph;
//            context.surface().selectAll(utilEntityOrMemberSelector(d.entityIds, graph) )
//              .classed('hover', true);
//          }
//        })
//        .on('mouseout', () => {
//// todo replace legacy surface css class .hover
//          context.surface().selectAll('.hover')
//            .classed('hover', false);
//        })
        .on('click', (d3_event, d) => {
          validator.focusIssue(d);
        });

      buttons
        .call(uiIcon('#rapid-icon-alert', 'pre-text'));

      buttons
        .append('strong')
        .attr('class', 'issue-message');

      items = itemsEnter
        .merge(items);

      items.selectAll('.issue-message')
        .html(d => d.message(context));
    }
  }


  return commitWarnings;
}
