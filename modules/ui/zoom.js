import { select as d3_select } from 'd3-selection';

import { t, localizer } from '../core/localizer';
import { uiIcon } from './icon';
import { uiCmd } from './cmd';
import { uiTooltip } from './tooltip';
import { utilKeybinding } from '../util/keybinding';


export function uiZoom(context) {
  let zooms = [{
    id: 'zoom-in',
    icon: 'rapid-icon-plus',
    title: t('zoom.in'),
    action: zoomIn,
    isDisabled: () => !context.map().canZoomIn(),
    disabledTitle: t('zoom.disabled.in'),
    key: '+'
  }, {
    id: 'zoom-out',
    icon: 'rapid-icon-minus',
    title: t('zoom.out'),
    action: zoomOut,
    isDisabled: () => !context.map().canZoomOut(),
    disabledTitle: t('zoom.disabled.out'),
    key: '-'
  }];

  function zoomIn(d3_event) {
    if (d3_event.shiftKey) return;
    d3_event.preventDefault();
    context.map().zoomIn();
  }

  function zoomOut(d3_event) {
    if (d3_event.shiftKey) return;
    d3_event.preventDefault();
    context.map().zoomOut();
  }

  function zoomInFurther(d3_event) {
    if (d3_event.shiftKey) return;
    d3_event.preventDefault();
    context.map().zoomInFurther();
  }

  function zoomOutFurther(d3_event) {
    if (d3_event.shiftKey) return;
    d3_event.preventDefault();
    context.map().zoomOutFurther();
  }

  return function(selection) {
    let tooltipBehavior = uiTooltip()
      .placement((localizer.textDirection() === 'rtl') ? 'right' : 'left')
      .title(d => d.isDisabled() ? d.disabledTitle : d.title)
      .keys(d => [d.key]);

    let _lastPointerUpType;

    let buttons = selection.selectAll('button')
      .data(zooms)
      .enter()
      .append('button')
      .attr('class', d => d.id)
      .on('pointerup', d3_event => _lastPointerUpType = d3_event.pointerType)
      .on('click', (d3_event, d) => {
        if (!d.isDisabled()) {
          d.action(d3_event);
        } else if (_lastPointerUpType === 'touch' || _lastPointerUpType === 'pen') {
          context.ui().flash
            .duration(2000)
            .iconName(`#${d.icon}`)
            .iconClass('disabled')
            .label(d.disabledTitle)();
        }
        _lastPointerUpType = null;
      })
      .call(tooltipBehavior);

    buttons.each((d, i, nodes) => {
      d3_select(nodes[i])
        .call(uiIcon(`#${d.icon}`, 'light'));
    });

    utilKeybinding.plusKeys.forEach(key => {
      context.keybinding().on([key], zoomIn);
      context.keybinding().on([uiCmd('⌥' + key)], zoomInFurther);
    });

    utilKeybinding.minusKeys.forEach(key => {
      context.keybinding().on([key], zoomOut);
      context.keybinding().on([uiCmd('⌥' + key)], zoomOutFurther);
    });

    function updateButtonStates() {
      buttons
        .classed('disabled', d => d.isDisabled())
        .each((d, i, nodes) => {
          const selection = d3_select(nodes[i]);
          if (!selection.select('.tooltip.in').empty()) {
            selection.call(tooltipBehavior.updateContent);
          }
        });
    }

    updateButtonStates();

    context.map().on('draw', updateButtonStates);
  };
}
