import * as PIXI from 'pixi.js';
import { t } from '../core/localizer';

// A mapping of improveOSM rule numbers and their respective tint colors.
const TINTS = new Map();
TINTS.set('tr', 0xec1c24);         // turn restrictions
TINTS.set('ow', 0x1e90ff);         // oneway restrictions
TINTS.set('mr-road', 0xb452cd);    // missing missing road
TINTS.set('mr-path', 0xa0522d);    // missing path
TINTS.set('mr-parking', 0xeeee00); // missing parking
TINTS.set('mr-both', 0xffa500);    // missing road + parking


export function uiImproveOsmHeader() {
  let _qaItem;


  function issueTitle(d) {
    const issueKey = d.issueKey;
    d.replacements = d.replacements || {};
    d.replacements.default = t.html('inspector.unknown');  // special key `default` works as a fallback string
    return t.html(`QA.improveOSM.error_types.${issueKey}.title`, d.replacements);
  }


  function improveOsmHeader(selection) {
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
        .attr('fill', d => PIXI.utils.hex2string(TINTS.get(d.itemType) || 0xffffff))
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

  improveOsmHeader.issue = function(val) {
    if (!arguments.length) return _qaItem;
    _qaItem = val;
    return improveOsmHeader;
  };

  return improveOsmHeader;
}
