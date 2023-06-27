import { uiIcon } from './icon';
import { QAItem } from '../osm';


export function uiViewOnKeepRight(context) {
  const keepright = context.services.keepRight;
  let _qaItem;


  function viewOnKeepRight(selection) {
    let url;
    if (keepright && (_qaItem instanceof QAItem)) {
      url = keepright.issueURL(_qaItem);
    }

    const link = selection.selectAll('.view-on-keepRight')
      .data(url ? [url] : [], d => d);

    // exit
    link.exit()
      .remove();

    // enter
    const linkEnter = link.enter()
      .append('a')
      .attr('class', 'view-on-keepRight')
      .attr('target', '_blank')
      .attr('rel', 'noopener') // security measure
      .attr('href', d => d)
      .call(uiIcon('#rapid-icon-out-link', 'inline'));

    linkEnter
      .append('span')
      .text(context.t('inspector.view_on_keepRight'));
  }


  viewOnKeepRight.what = function(val) {
    if (!arguments.length) return _qaItem;
    _qaItem = val;
    return viewOnKeepRight;
  };

  return viewOnKeepRight;
}
