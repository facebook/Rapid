export function uiIcon(href, klass = '') {
  const iconID = href.replace('#', '');

  return function render(selection) {
    selection.selectAll(`svg.icon-${iconID}`)
      .data([iconID], d => d)
      .enter()
      .append('svg')
      .attr('class', `icon icon-${iconID}` + (klass ? ` ${klass}` : ''))
      .append('use')
      .attr('xlink:href', href);
  };
}
