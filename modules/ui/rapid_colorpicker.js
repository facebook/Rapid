import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';

import { uiIcon } from './icon.js';
import { utilKeybinding, utilRebind } from '../util/index.js';


export function uiRapidColorpicker(context, parentModal) {
  const dispatch = d3_dispatch('change', 'done');

  let _close = () => {};


  function togglePopup(event) {
    const shaded = context.container().selectAll('.shaded');  // container for the existing modal
    if (shaded.empty()) return;

    if (shaded.selectAll('.colorpicker-popup').size()) {
      _close();
    } else {
      renderPopup(shaded, event.currentTarget);
    }
  }


  // if user clicks outside the colorpicker, dismiss
  function handleClick(d3_event) {
    const target = d3_event.target;
    const className = (target && target.className) || '';
    if (!/colorpicker/i.test(className)) {
      d3_event.stopPropagation();
      d3_event.preventDefault();
      _close();
    }
  }

  // https://www.w3.org/TR/AERT#color-contrast
  // https://trendct.org/2016/01/22/how-to-choose-a-label-color-to-contrast-with-background/
  // pass color as a hexstring like '#rgb', '#rgba', '#rrggbb', '#rrggbbaa'  (alpha values are ignored)
  function getBrightness(color) {
    const short = (color.length < 6);
    const r = parseInt(short ? color[1] + color[1] : color[1] + color[2], 16);
    const g = parseInt(short ? color[2] + color[2] : color[3] + color[4], 16);
    const b = parseInt(short ? color[3] + color[3] : color[5] + color[6], 16);
    return ((r * 299) + (g * 587) + (b * 114)) / 1000;
  }


  function render(selection) {
    let colorpicker = selection.selectAll('.rapid-colorpicker')
      .data(d => [d], d => d.id);   // retain data from parent

    // enter
    let colorpickerEnter = colorpicker.enter()
      .append('div')
      .attr('class', 'rapid-colorpicker')
      .on('click', togglePopup);

    colorpickerEnter
      .append('div')
      .attr('class', 'rapid-colorpicker-fill')
      .call(uiIcon('#fas-palette'));

    // update
    colorpicker
      .merge(colorpickerEnter)
      .selectAll('.rapid-colorpicker-fill')
      .style('background', d => d.color)
      .select('.icon')  // propagate bound data
      .style('color', d => getBrightness(d.color) > 140.5 ? '#333' : '#fff');
  }


  function renderPopup(selection, forNode) {
    const isRTL = context.systems.l10n.isRTL();
    const dataset = forNode.__data__;
    const rect = forNode.getBoundingClientRect();
    const popWidth = 180;
    const popTop = rect.bottom + 15;
    const popLeft = isRTL ? rect.right - (0.3333 * popWidth)
      : rect.left - (0.6666 * popWidth);
    const arrowLeft = isRTL ? (0.3333 * popWidth) - rect.width + 10
      : (0.6666 * popWidth) + 10;

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
      d3_select(document).on('click.colorpicker', null);
      _close = () => {};
      dispatch.call('done');
    };

    let keybinding = utilKeybinding('modal');
    keybinding.on(['⌫', '⎋'], _close);
    d3_select(document).call(keybinding);
    d3_select(document).on('click.colorpicker', handleClick);

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
      .data(context.systems.rapid.colors);

    // enter
    let colorItemsEnter = colorItems.enter()
      .append('div')
      .attr('class', 'colorpicker-option')
      .style('color', d => d)
      .on('click', (_, selectedColor) => {
        dispatch.call('change', this, dataset.id, selectedColor);
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
