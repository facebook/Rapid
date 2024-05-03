import { uiIcon } from './icon';
import { Task } from '../maproulette/Task';


export function uiViewOnMapRoulette(context) {
  const l10n = context.systems.l10n;
  const maproulette = context.services.maproulette;
  let _task;


  function viewOnMapRoulette(selection) {
    let url;
    if (maproulette && (_task instanceof Task)) {
      url = maproulette.itemURL(_task);
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


  viewOnMapRoulette.what = function(val) {
    if (!arguments.length) return _task;
    _task = val;
    return viewOnMapRoulette;
  };

  return viewOnMapRoulette;
}
