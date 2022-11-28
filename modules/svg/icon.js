export function svgIcon(name, svgklass, useklass) {
  return function drawIcon(selection) {
    selection.selectAll('svg.icon')
      .data([name])
      .enter()
      .append('svg')
      .attr('class', 'icon ' + (svgklass || ''))
      .append('use')
      .attr('xlink:href', name)
      .attr('class', useklass);
  };
}
