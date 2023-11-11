import { Color } from 'pixi.js';


export function uiMapRouletteHeader(context) {
  const l10n = context.systems.l10n;
  const maproulette = context.services.maproulette;
  let _qaItem;


  function issueTitle(d) {
    const unknown = l10n.t('inspector.unknown');
    if (!maproulette || !d) return unknown;

    return ('title' in d) ? d.title : unknown;
  }


  function maprouletteHeader(selection) {
    let iconFill = 0xffffff;

    const header = selection.selectAll('.qa-header')
      .data(
        (_qaItem ? [_qaItem] : []),
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
      .attr('viewbox', '0 0 20 27')
      .attr('class', d => `qaItem ${d.service}`);

    svgEnter
      .append('polygon')
      .attr('fill', new Color(iconFill).toHex())
      .attr('stroke', '#333')
      .attr('points', '16,3 4,3 1,6 1,17 4,20 7,20 10,27 13,20 16,20 19,17.033 19,6');

    svgEnter
      .append('use')
      .attr('class', 'icon-annotation')
      .attr('width', '13px')
      .attr('height', '13px')
      .attr('transform', 'translate(3.5, 5)')
      .attr('xlink:href', d => d.icon ? `#${d.icon}` : '');

    headerEnter
      .append('div')
      .attr('class', 'qa-header-label')
      .html(issueTitle);
  }

  maprouletteHeader.issue = function(val) {
    if (!arguments.length) return _qaItem;
    _qaItem = val;
    return maprouletteHeader;
  };

  return maprouletteHeader;
}
