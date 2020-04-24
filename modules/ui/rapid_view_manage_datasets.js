import { select as d3_select } from 'd3-selection';
import { t, textDirection } from '../util/locale';

import { svgIcon } from '../svg/icon';
import { utilKeybinding } from '../util';


export function uiRapidViewManageDatasets(context, parentModal) {

  return function render() {
    // Unfortunately `uiModal` is written in a way that there can be only one at a time.
    // So we have to roll our own modal here instead of just creating a second `uiModal`.
    let shaded = context.container().selectAll('.shaded');  // container for the existing modal
    if (shaded.empty()) return;
    if (shaded.selectAll('.modal-view-manage').size()) return;  // view/manage modal exists already

    const origClose = parentModal.close;
    parentModal.close = () => { /* ignore */ };

    let myClose = () => {
      myModal
        .transition()
        .duration(200)
        .style('top','0px')
        .remove();

      parentModal.close = origClose;  // restore close handler

      let keybinding = utilKeybinding('modal');
      keybinding.on(['⌫', '⎋'], origClose);
      d3_select(document).call(keybinding);
    };

    let keybinding = utilKeybinding('modal');
    keybinding.on(['⌫', '⎋'], myClose);
    d3_select(document).call(keybinding);



    let myModal = shaded
      .append('div')
      .attr('class', 'modal modal-splash modal-rapid modal-view-manage fillL')
      .style('opacity', 0);

    myModal
      .append('button')
      .attr('class', 'close')
      .on('click', myClose)
      .call(svgIcon('#iD-icon-close'));

    let content = myModal
      .append('div')
      .attr('class', 'content rapid-feature rapid-stack fillL');

    content
      .append('div')
      .attr('class', 'modal-section')
      .text('top');

    content
      .append('div')
      .attr('class', 'modal-section')
      .text('middle');

    content
      .append('div')
      .attr('class', 'modal-section')
      .text('bottom');

    myModal
      .transition()
      .style('opacity', 1);

  };
}
