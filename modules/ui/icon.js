export function uiIcon(href, klass = '') {
  return function render(selection) {
    selection.selectAll('svg.icon')
      .data([href])
      .enter()
      .append('svg')
      .attr('class', 'icon' + (klass ? ` ${klass}` : ''))
      .append('use')
      .attr('xlink:href', href);
  };
}
