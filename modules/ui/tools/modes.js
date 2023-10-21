import { select as d3_select } from 'd3-selection';
import debounce from 'lodash-es/debounce';

import { uiIcon } from '../icon';
import { uiTooltip } from '../tooltip';


export function uiToolDrawModes(context) {
  const l10n = context.systems.l10n;
  const map = context.systems.map;
  const presets = context.systems.presets;
  const ui = context.systems.ui;

  let debouncedUpdate;
  let _wrap;

  let tool = {
    id: 'draw_modes',
    label: l10n.tHtml('toolbar.add_feature')
  };

  const modes = [
    {
      id: 'add-point',
      title: l10n.tHtml('modes.add_point.title'),
      button: 'point',
      description: l10n.tHtml('modes.add_point.description'),
      preset: presets.item('point'),
      key: '1'
    },
    {
      id: 'draw-line',
      title: l10n.tHtml('modes.add_line.title'),
      button: 'line',
      description: l10n.tHtml('modes.add_line.description'),
      preset: presets.item('line'),
      key: '2'
    },
    {
      id: 'draw-area',
      title: l10n.tHtml('modes.add_area.title'),
      button: 'area',
      description: l10n.tHtml('modes.add_area.description'),
      preset: presets.item('area'),
      key: '3'
    }
  ];


  function update() {
    if (!_wrap) return;
    let buttons = _wrap.selectAll('button.add-button')
      .data(modes, d => d.id);

    // exit
    buttons.exit()
      .remove();

    // enter
    let buttonsEnter = buttons.enter()
      .append('button')
      .attr('class', d => `${d.id} add-button bar-button`)
      .on('click.mode-buttons', (d3_event, d) => {
        if (!context.editable()) return;

        if (d.id === 'add-area') return; //Short-circuit area drawing temporarily.
        // When drawing, ignore accidental clicks on mode buttons - #4042
        const currMode = context.mode?.id;
        if (/^draw/.test(currMode)) return;

        if (d.id === currMode) {
          context.enter('browse');
        } else {
          context.enter(d.id);
        }
      })
      .call(uiTooltip(context)
        .placement('bottom')
        .title(d => d.description)
        .keys(d => [d.key])
        .scrollContainer(context.container().select('.top-toolbar'))
      );

    buttonsEnter
      .each((d, i, nodes) => {
        d3_select(nodes[i])
          .call(uiIcon(`#rapid-icon-${d.button}`));
      });

    buttonsEnter
      .append('span')
      .attr('class', 'label')
      .html(d => d.title);

    // if we are adding/removing the buttons, check if toolbar has overflowed
    if (buttons.enter().size() || buttons.exit().size()) {
      ui.checkOverflow('.top-toolbar', true);
    }

    // update
    buttons = buttons
      .merge(buttonsEnter)
      .classed('disabled', () => !context.editable())
      .classed('active', d => context.mode?.id === d.id);
  }


  tool.install = function(selection) {
    _wrap = selection
      .append('div')
      .attr('class', 'joined')
      .style('display', 'flex');

    debouncedUpdate = debounce(update, 500, { leading: true, trailing: true });

    modes.forEach(d => {
      context.keybinding().on(d.key, () => {
        if (!context.editable()) return;

        if (d.id === context.mode?.id) {
          context.enter('browse');
        } else {
          context.enter(d.id);
        }
      });
    });

    map.on('draw', debouncedUpdate);
    context.on('modechange', update);
    update();
  };


  tool.uninstall = function () {
    modes.forEach(d => {
      context.keybinding().off(d.key);
    });

    debouncedUpdate.cancel();
    map.off('draw', debouncedUpdate);
    context.off('modechange', update);
    _wrap = null;
  };

  return tool;
}
