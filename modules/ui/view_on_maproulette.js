import { QAItem } from '../osm/qa_item.js';
import { uiIcon } from './icon.js';


export function uiViewOnMapRoulette(context) {
  const l10n = context.systems.l10n;
  const maproulette = context.services.maproulette;
  let _qaitem;


  function render(selection) {
    let url;
    if (maproulette && (_qaitem instanceof QAItem)) {
      url = maproulette.itemURL(_qaitem);
    }

    const link = selection.selectAll('.view-on-maproulette')
      .data(url ? [url] : [], d => d);

    // exit
    link.exit()
      .remove();

    // enter
    const linkEnter = link.enter()
      .append('a')
      .attr('class', 'view-on-maproulette')
      .attr('target', '_blank')
      .attr('rel', 'noopener') // security measure
      .attr('href', d => d)
      .call(uiIcon('#rapid-icon-out-link', 'inline'));

    linkEnter
      .append('span')
      .text(l10n.t('inspector.view_on_maproulette'));
  }


  render.task = function(val) {
    if (!arguments.length) return _qaitem;
    _qaitem = val;
    return render;
  };

  return render;
}
