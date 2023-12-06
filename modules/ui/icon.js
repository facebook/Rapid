export function uiIcon(href, klass = '') {
  const iconID = href.replace('#', '');

  return function render(selection) {
    const classList = ['icon'];
    if (iconID) classList.push(`icon-${iconID}`);
    if (klass)  classList.push(klass);

    selection.selectAll(`svg.icon-${iconID}`)
      .data([iconID], d => d)
      .enter()
      .append('svg')
      .attr('class', classList.join(' '))
      .append('use')
      .attr('xlink:href', href);
  };
}
