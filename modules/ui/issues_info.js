import { select as d3_select } from 'd3-selection';

import { uiIcon } from './icon.js';
import { uiTooltip } from './tooltip.js';


export function uiIssuesInfo(context) {
  const l10n = context.systems.l10n;
  const storage = context.systems.storage;
  const ui = context.systems.ui;
  const validator = context.systems.validator;

  let warningsItem = {
    id: 'warnings',
    count: 0,
    iconID: 'rapid-icon-alert',
    stringID: 'issues.warnings_and_errors'
  };

  let resolvedItem = {
    id: 'resolved',
    count: 0,
    iconID: 'rapid-icon-apply',
    stringID: 'issues.user_resolved_issues'
  };


  function update(selection) {
    let shownItems = [];
    let liveIssues = validator.getIssues({
      what: storage.getItem('validate-what') ?? 'edited',
      where: storage.getItem('validate-where') ?? 'all'
    });
    if (liveIssues.length) {
      warningsItem.count = liveIssues.length;
      shownItems.push(warningsItem);
    }

    if (storage.getItem('validate-what') === 'all') {
      let resolvedIssues = validator.getResolvedIssues();
      if (resolvedIssues.length) {
        resolvedItem.count = resolvedIssues.length;
        shownItems.push(resolvedItem);
      }
    }

    let chips = selection.selectAll('.chip')
      .data(shownItems, d => d.id);

    chips.exit().remove();

    let enter = chips.enter()
      .append('a')
      .attr('class', d => `chip ${d.id}-count`)
      .attr('href', '#')
      .each((d, i, nodes) => {
        let chipSelection = d3_select(nodes[i]);

        let tooltip = uiTooltip(context)
          .placement('top')
          .title(l10n.t(d.stringID));

        chipSelection
          .call(tooltip)
          .on('click', d3_event => {
            d3_event.preventDefault();
            tooltip.hide();
            // open the Issues pane
            ui.togglePanes(context.container().select('.map-panes .issues-pane'));
          });

        chipSelection.call(uiIcon(`#${d.iconID}`));
      });

    enter.append('span')
      .attr('class', 'count');

    enter.merge(chips)
      .selectAll('span.count')
      .text(d => d.count.toString());
  }


  return function render(selection) {
    update(selection);
    validator.on('validated', () => update(selection));
  };
}
