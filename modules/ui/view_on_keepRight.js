import { t } from '../core/localizer';
import { uiIcon } from './icon';
import { QAItem } from '../osm';


export function uiViewOnKeepRight(context) {
  let _qaItem;

  function viewOnKeepRight(selection) {
    let url;

    const keepright = context.services.get('keepright');
    if (keepright && (_qaItem instanceof QAItem)) {
      url = keepright.issueURL(_qaItem);
    }

    const link = selection.selectAll('.view-on-keepRight')
      .data(url ? [url] : []);

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
        .html(t.html('inspector.view_on_keepRight'));
  }


  viewOnKeepRight.what = function(val) {
    if (!arguments.length) return _qaItem;
    _qaItem = val;
    return viewOnKeepRight;
  };

  return viewOnKeepRight;
}
