import * as PIXI from 'pixi.js';

import { uiIcon } from './icon';


export function uiKeepRightHeader(context) {
  let _qaItem;


  function issueTitle(d) {
    const unknown = context.tHtml('inspector.unknown');
    let replacements = d.replacements || {};
    replacements.default = unknown;  // special key `default` works as a fallback string

    let title = context.tHtml(`QA.keepRight.errorTypes.${d.itemType}.title`, replacements);
    if (title === unknown) {
      title = context.tHtml(`QA.keepRight.errorTypes.${d.parentIssueType}.title`, replacements);
    }
    return title;
  }


  function keepRightHeader(selection) {
    let iconFill = 0xffffff;
    const keepright = context.services.get('keepRight');
    if (keepright) {
      iconFill = keepright.getColor(_qaItem?.parentIssueType);
    }

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
      .call(uiIcon('#rapid-icon-bolt'));

    headerEnter
      .append('div')
      .attr('class', 'qa-header-label')
      .html(issueTitle);

    headerEnter.selectAll('.qaItem svg.icon')
      .attr('stroke', '#333')
      .attr('stroke-width', '1.3px')
      .attr('color', PIXI.utils.hex2string(iconFill));
  }


  keepRightHeader.issue = function(val) {
    if (!arguments.length) return _qaItem;
    _qaItem = val;
    return keepRightHeader;
  };

  return keepRightHeader;
}
