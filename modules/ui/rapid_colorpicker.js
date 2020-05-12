import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';

import { utilKeybinding, utilRebind } from '../util';


export function uiRapidColorpicker(context, parentModal) {
  const RAPID_MAGENTA = '#ff26d4';
  const dispatch = d3_dispatch('change', 'done');

  let _content = d3_select(null);
  let _close = () => {};


  function render(selection) {
    let colorpicker = selection.selectAll('.rapid-colorpicker')
      .data(d => [d], d => d.key);   // retain data from parent

    // enter
    let colorpickerEnter = colorpicker.enter()
      .append('div')
      .attr('class', 'rapid-colorpicker')
      .on('click', togglePopup);

    colorpickerEnter
      .append('div')
      .attr('class', 'rapid-colorpicker-fill');

    // update
    colorpicker
      .merge(colorpickerEnter)
      .style('color', d => d.color);
  }


  function togglePopup(d) {
    console.log('click ' + d.label);

    const shaded = context.container().selectAll('.shaded');  // container for the existing modal
    if (shaded.empty()) return;

    if (shaded.selectAll('.colorpicker-popup').size()) {
      _close();
    } else {
      renderPopup(shaded);
    }
  }


  function renderPopup(selection) {
    const origClose = parentModal.close;
    parentModal.close = () => { /* ignore */ };

    _close = () => {
      myModal
        .transition()
        .duration(200)
        .style('opacity', 0)
        .remove();

      parentModal.close = origClose;  // restore close handler

      let keybinding = utilKeybinding('modal');
      keybinding.on(['⌫', '⎋'], origClose);
      d3_select(document).call(keybinding);
      _close = () => {};
      dispatch.call('done');
    };

    let keybinding = utilKeybinding('modal');
    keybinding.on(['⌫', '⎋'], _close);
    d3_select(document).call(keybinding);

    let myModal = selection
      .append('div')
      .attr('class', 'colorpicker-popup')
      .style('opacity', 0);

    // myModal
    //   .append('button')
    //   .attr('class', 'close')
    //   .on('click', myClose);
    //   .call(svgIcon('#iD-icon-close'));

    _content = myModal
      .append('div')
      .attr('class', 'content rapid-stack fillL');

    _content
      .text('hi there');
    //   .call(renderModalContent);

    myModal
      .transition()
      .style('opacity', 1);
  }

  return utilRebind(render, dispatch, 'on');
}
