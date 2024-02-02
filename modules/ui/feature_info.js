import { uiTooltip } from './tooltip.js';


export function uiFeatureInfo(context) {
  const l10n = context.systems.l10n;
  const filters = context.systems.filters;
  const ui = context.systems.ui;

  function update(selection) {
    const stats = filters.stats();
    const hidden = filters.hidden();
    let count = 0;

    const hiddenList = Array.from(hidden).map(k => {
      if (stats[k]) {
        count += stats[k];
        return l10n.t('inspector.title_count', { title: l10n.tHtml(`feature.${k}.description`), count: stats[k] });
      } else {
        return null;
      }
    }).filter(Boolean);

    selection.html('');

    if (hiddenList.length) {
      const tooltipBehavior = uiTooltip(context)
        .placement('top')
        .title(() => hiddenList.join('<br/>'));

      selection.append('a')
        .attr('class', 'chip')
        .attr('href', '#')
        .html(l10n.tHtml('feature_info.hidden_warning', { count: count }))
        .call(tooltipBehavior)
        .on('click', (d3_event) => {
          tooltipBehavior.hide();
          d3_event.preventDefault();
          // open the Map Data pane
          ui.togglePanes(context.container().select('.map-panes .map-data-pane'));
        });
    }

    selection
      .classed('hide', !hiddenList.length);
  }


  return function(selection) {
    update(selection);
    filters.on('filterchange', () => update(selection));
  };
}
