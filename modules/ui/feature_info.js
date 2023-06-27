import { uiTooltip } from './tooltip';


export function uiFeatureInfo(context) {
  const filterSystem = context.systems.filters;

  function update(selection) {
    const stats = filterSystem.stats();
    const hidden = filterSystem.hidden();
    let count = 0;

    const hiddenList = Array.from(hidden).map(k => {
      if (stats[k]) {
        count += stats[k];
        return context.t('inspector.title_count', { title: context.tHtml(`feature.${k}.description`), count: stats[k] });
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
        .html(context.tHtml('feature_info.hidden_warning', { count: count }))
        .call(tooltipBehavior)
        .on('click', (d3_event) => {
          tooltipBehavior.hide();
          d3_event.preventDefault();
          // open the Map Data pane
          context.systems.ui.togglePanes(context.container().select('.map-panes .map-data-pane'));
        });
    }

    selection
      .classed('hide', !hiddenList.length);
  }


  return function(selection) {
    update(selection);
    filterSystem.on('filterchange', () => update(selection));
  };
}
