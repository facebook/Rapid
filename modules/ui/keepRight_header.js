import * as PIXI from 'pixi.js';

import { svgIcon } from '../svg/icon';
import { t } from '../core/localizer';

// A mapping of KeepRight rule numbers to their respective tint colors.
const TINTS = new Map();
['20', '40', '210', '270', '310', '320', '350'].forEach(key => TINTS.set(key, 0xffff99));
['60', '70', '90', '100', '110', '150', '220', '380'].forEach(key => TINTS.set(key, 0x55dd00));
['360', '370', '410'].forEach(key => TINTS.set(key, 0xff99bb));
TINTS.set('50',  0xffff99);
TINTS.set('120', 0xcc3355);
TINTS.set('130', 0xffaa33);
TINTS.set('160', 0xbb6600);
TINTS.set('170', 0xffff00);
TINTS.set('180', 0xaaccee);
TINTS.set('190', 0xff3333);
TINTS.set('200', 0xfdbf6f);
TINTS.set('230', 0xbb6600);
TINTS.set('280', 0x5f47a0);
TINTS.set('290', 0xaaccee);
TINTS.set('300', 0x009900);
TINTS.set('390', 0x009900);
TINTS.set('400', 0xcc3355);


export function uiKeepRightHeader() {
  let _qaItem;


  function issueTitle(d) {
    const { itemType, parentIssueType } = d;
    const unknown = t.html('inspector.unknown');
    let replacements = d.replacements || {};
    replacements.default = unknown;  // special key `default` works as a fallback string

    let title = t.html(`QA.keepRight.errorTypes.${itemType}.title`, replacements);
    if (title === unknown) {
      title = t.html(`QA.keepRight.errorTypes.${parentIssueType}.title`, replacements);
    }
    return title;
  }


  function keepRightHeader(selection) {
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

    headerEnter
      .append('div')
        .attr('class', 'qa-header-icon')
      .append('div')
        .attr('class', d => `qaItem ${d.service}`)
        .call(svgIcon('#rapid-icon-bolt'));

    headerEnter
      .append('div')
        .attr('class', 'qa-header-label')
        .html(issueTitle);

    const color = TINTS.get(_qaItem?.parentIssueType) ?? 0x333333;
    headerEnter.selectAll('.qaItem svg.icon')
      .attr('color', PIXI.utils.hex2string(color));
  }


  keepRightHeader.issue = function(val) {
    if (!arguments.length) return _qaItem;
    _qaItem = val;
    return keepRightHeader;
  };

  return keepRightHeader;
}
