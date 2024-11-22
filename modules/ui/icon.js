export function uiIcon(href, klass = '', title = '') {
  const iconID = href.replace('#', '');
  const prefix = iconID.split('-')[0];

  return function render(selection) {
    const classList = ['icon'];
    if (prefix) classList.push(`icon-${prefix}`);    // 'icon-fas', 'icon-rapid'
    if (iconID) classList.push(`icon-${iconID}`);    // 'icon-fas-triangle-exclamation', 'icon-rapid-icon-error'
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
