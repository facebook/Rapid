import { Color } from 'pixi.js';

import { uiIcon } from './icon.js';


export function uiKeepRightHeader(context) {
  const l10n = context.systems.l10n;
  let _qaItem;


  function issueTitle(d) {
    const unknown = l10n.t('inspector.unknown');
    let replacements = d.replacements || {};
    replacements.default = unknown;  // special key `default` works as a fallback string

    let title = l10n.t(`QA.keepRight.errorTypes.${d.itemType}.title`, replacements);
    if (title === unknown) {
      title = l10n.t(`QA.keepRight.errorTypes.${d.parentIssueType}.title`, replacements);
    }
    return title;
  }


  function render(selection) {
    let iconFill = 0xffffff;
    const keepright = context.services.keepRight;
    if (keepright) {
      iconFill = keepright.getColor(_qaItem?.parentIssueType);
    }

    const header = selection.selectAll('.qa-header')
      .data(_qaItem ? [_qaItem] : [], d => d.key);

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
      .text(issueTitle);

    headerEnter.selectAll('.qaItem svg.icon')
      .attr('stroke', '#333')
      .attr('stroke-width', '1.3px')
      .attr('color', new Color(iconFill).toHex());
  }


  render.issue = function(val) {
    if (!arguments.length) return _qaItem;
    _qaItem = val;
    return render;
  };

  return render;
}
