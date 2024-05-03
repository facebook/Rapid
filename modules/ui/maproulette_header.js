

export function uiMapRouletteHeader(context) {
  const l10n = context.systems.l10n;
  const maproulette = context.services.maproulette;
  let _maprouletteTask;


  function taskTitle(d) {
    const unknown = l10n.t('inspector.unknown');
    if (!maproulette || !d) return unknown;

    return d.task.parentName !== undefined ? d.task.parentName : unknown;
  }


  function maprouletteHeader(selection) {

    const header = selection.selectAll('.qa-header')
      .data(
        (_maprouletteTask ? [_maprouletteTask] : []),
        d => `${d.id}-${d.status || 0}`
      );

    header.exit()
      .remove();

    const headerEnter = header.enter()
      .append('div')
      .attr('class', 'qa-header');

    const svgEnter = headerEnter
      .append('div')
      .attr('class', 'qa-header-icon')
      .append('svg')
      .attr('width', '20px')
      .attr('height', '27px')
      .attr('viewbox', '0 0 20 27');

    svgEnter
      .append('polygon')
      .attr('fill', '#01ff00')
      .attr('stroke', '#333')
      .attr('points', '16,3 4,3 1,6 1,17 4,20 7,20 10,27 13,20 16,20 19,17.033 19,6');

    svgEnter
      .append('use')
      .attr('class', 'icon-annotation')
      .attr('width', '13px')
      .attr('height', '13px')
      .attr('transform', 'translate(3.5, 5)')
      .attr('fill', '#01ff00');

    headerEnter
      .append('div')
      .attr('class', 'qa-header-label')
      .html(taskTitle);
  }

  maprouletteHeader.task = function(val) {
    if (!arguments.length) return _maprouletteTask;
    _maprouletteTask = val;
    return maprouletteHeader;
  };

  return maprouletteHeader;
}
