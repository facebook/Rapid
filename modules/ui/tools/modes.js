import _debounce from 'lodash-es/debounce';
import { select as d3_select } from 'd3-selection';

import { uiIcon } from '../icon';
import { uiTooltip } from '../tooltip';


export function uiToolDrawModes(context) {
  const presetSystem = context.presetSystem();

  let tool = {
    id: 'draw_modes',
    label: context.tHtml('toolbar.add_feature')
  };

  const modes = [
    {
      id: 'add-point',
      title: context.tHtml('modes.add_point.title'),
      button: 'point',
      description: context.tHtml('modes.add_point.description'),
      preset: presetSystem.item('point'),
      key: '1'
    },
    {
      id: 'draw-line',
      title: context.tHtml('modes.add_line.title'),
      button: 'line',
      description: context.tHtml('modes.add_line.description'),
      preset: presetSystem.item('line'),
      key: '2'
    },
    {
      id: 'draw-area',
      title: context.tHtml('modes.add_area.title'),
      button: 'area',
      description: context.tHtml('modes.add_area.description'),
      preset: presetSystem.item('area'),
      key: '3'
    }
  ];

  let debouncedUpdate;


  tool.install = function(selection) {
    let wrap = selection
      .append('div')
      .attr('class', 'joined')
      .style('display', 'flex');

    debouncedUpdate = _debounce(update, 500, { leading: true, trailing: true });

    modes.forEach(d => {
      context.keybinding().on(d.key, () => {
        if (!context.editable()) return;

        if (d.id === context.mode().id) {
          context.enter('browse');
        } else {
          context.enter(d.id);
        }
      });
    });

    context.mapSystem()
      .on('draw', debouncedUpdate);

    context
      .on('enter.modes', update);

    update();


    function update() {
      let buttons = wrap.selectAll('button.add-button')
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
          const currMode = context.mode().id;
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
        context.ui().checkOverflow('.top-toolbar', true);
      }

      // update
      buttons = buttons
        .merge(buttonsEnter)
        .classed('disabled', () => !context.editable())
        .classed('active', d => (context.mode() && context.mode().id === d.id));
    }
  };


  tool.uninstall = function () {
    modes.forEach(d => {
      context.keybinding().off(d.key);
    });

    context.mapSystem()
      .off('draw', debouncedUpdate);

    context
      .on('enter.modes', null);
  };

  return tool;
}
