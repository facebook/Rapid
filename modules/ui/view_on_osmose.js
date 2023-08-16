import { uiIcon } from './icon';
import { QAItem } from '../osm';


export function uiViewOnOsmose(context) {
  const osmose = context.services.osmose;
  let _qaItem;


  function viewOnOsmose(selection) {
    let url;
    if (osmose && (_qaItem instanceof QAItem)) {
      url = osmose.itemURL(_qaItem);
    }

    const link = selection.selectAll('.view-on-osmose')
      .data(url ? [url] : [], d => d);

    // exit
    link.exit()
      .remove();

    // enter
    const linkEnter = link.enter()
      .append('a')
      .attr('class', 'view-on-osmose')
      .attr('target', '_blank')
      .attr('rel', 'noopener') // security measure
      .attr('href', d => d)
      .call(uiIcon('#rapid-icon-out-link', 'inline'));

    linkEnter
      .append('span')
      .text(context.t('inspector.view_on_osmose'));
  }


  viewOnOsmose.what = function(val) {
    if (!arguments.length) return _qaItem;
    _qaItem = val;
    return viewOnOsmose;
  };

  return viewOnOsmose;
}
