export function uiIcon(href, klass = '', title = '') {
  const iconID = href.replace('#', '');

  return function render(selection) {
    const classList = ['icon'];
    if (iconID) classList.push(`icon-${iconID}`);
    if (klass)  classList.push(klass);

    const svgEnter = selection.selectAll(`svg.icon-${iconID}`)
      .data([iconID], d => d)
      .enter()
      .append('svg')
      .attr('class', classList.join(' '))
      .attr('role', 'img')
      .attr('aria-labelledby', title);

    if (title) {
      svgEnter
        .append('title')
        .text(title);
    }

    svgEnter
      .append('use')
      .attr('xlink:href', href);
  };
}
