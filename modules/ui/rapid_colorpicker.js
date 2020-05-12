import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';

import { textDirection } from '../util/locale';
import { utilKeybinding, utilRebind } from '../util';


export function uiRapidColorpicker(context, parentModal) {
  const rapidContext = context.rapidContext();
  const dispatch = d3_dispatch('change', 'done');

  const COLORS = [
    '#ff0000',  // red
    '#ffa500',  // orange
    '#ffd700',  // gold
    '#00ff00',  // lime
    '#00ffff',  // cyan
    '#1e90ff',  // dodgerblue
    '#ff26d4',  // rapid magenta
    '#ffc0cb',  // pink
    '#d3d3d3',  // lightgray
    '#faf0e6'   // linen
  ];

  let _close = () => {};


  function togglePopup(d, i, nodes) {
    const shaded = context.container().selectAll('.shaded');  // container for the existing modal
    if (shaded.empty()) return;

    if (shaded.selectAll('.colorpicker-popup').size()) {
      _close();
    } else {
      renderPopup(shaded, nodes[i]);
    }
  }


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


  function renderPopup(selection, forNode) {
    const dataset = forNode.__data__;
    const rect = forNode.getBoundingClientRect();
    const popWidth = 180;
    const popTop = rect.bottom + 15;
    const popLeft = textDirection === 'rtl'
      ? rect.right - (0.3333 * popWidth)
      : rect.left - (0.6666 * popWidth);
    const arrowLeft = textDirection === 'rtl'
      ? (0.3333 * popWidth) - rect.width + 5
      : (0.6666 * popWidth) + 5;

    const origClose = parentModal.close;
    parentModal.close = () => { /* ignore */ };

    _close = () => {
      popup
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

    let popup = selection
      .append('div')
      .attr('class', 'colorpicker-popup')
      .style('opacity', 0)
      .style('width', popWidth + 'px')
      .style('top', popTop + 'px')
      .style('left', popLeft + 'px');

    popup
      .append('div')
      .attr('class', 'colorpicker-arrow')
      .style('left', arrowLeft + 'px');

    let content = popup
      .append('div')
      .attr('class', 'colorpicker-content');

    let colorlist = content.selectAll('.colorpicker-colors')
      .data([0]);

    colorlist = colorlist.enter()
      .append('div')
      .attr('class', 'colorpicker-colors')
      .merge(colorlist);

    let colorItems = colorlist.selectAll('.colorpicker-option')
      .data(COLORS);

    // enter
    let colorItemsEnter = colorItems.enter()
      .append('div')
      .attr('class', 'colorpicker-option')
      .style('color', d => d)
      .on('click', selectedColor => {
        dispatch.call('change', this, dataset.key, selectedColor);
        colorItems.classed('selected', d => d === selectedColor);
      });

    colorItemsEnter
      .append('div')
      .attr('class', 'colorpicker-option-fill');

    // update
    colorItems = colorItems
      .merge(colorItemsEnter);

    colorItems
      .classed('selected', d => d === dataset.color);

    popup
      .transition()
      .style('opacity', 1);
  }

  return utilRebind(render, dispatch, 'on');
}
