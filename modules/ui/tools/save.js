import { interpolateRgb as d3_interpolateRgb } from 'd3-interpolate';
import { select as d3_select } from 'd3-selection';

import { uiIcon } from '../icon';
import { uiCmd } from '../cmd';
import { uiTooltip } from '../tooltip';


export function uiToolSave(context) {
  let tool = {
    id: 'save',
    label: context.tHtml('save.title')
  };

  let button = d3_select(null);
  let tooltip = null;
  let key = uiCmd('⌘S');
  let _numChanges = 0;

  function isSaving() {
    const mode = context.mode();
    return mode && mode.id === 'save';
  }

  function isDisabled() {
    return _numChanges === 0 || isSaving();
  }

  function save(d3_event) {
    d3_event.preventDefault();
    if (!context.inIntro() && !isSaving() && context.history().hasChanges()) {
      context.enter('save');
    }
  }

  function bgColor() {
    let step;
    if (_numChanges === 0) {
      return null;
    } else if (_numChanges <= 50) {
      step = _numChanges / 50;
      return d3_interpolateRgb('#fff', '#ff8')(step);  // white -> yellow
    } else {
      step = Math.min((_numChanges - 50) / 50, 1.0);
      return d3_interpolateRgb('#ff8', '#f88')(step);  // yellow -> red
    }
  }

  function updateCount() {
    const val = context.history().difference().summary().size;
    if (val === _numChanges) return;  // no change

    _numChanges = val;

    if (tooltip) {
      tooltip
        .title(context.tHtml(_numChanges > 0 ? 'save.help' : 'save.no_changes'))
        .keys([key]);
    }

    button
      .classed('disabled', isDisabled())
      .style('background', bgColor(_numChanges));

    button.select('span.count')
      .html(_numChanges);
  }


  tool.install = function(selection) {
    tooltip = uiTooltip(context)
      .placement('bottom')
      .title(context.tHtml('save.no_changes'))
      .keys([key])
      .scrollContainer(context.container().select('.top-toolbar'));

    // var lastPointerUpType;
    button = selection
      .append('button')
      .attr('class', 'save disabled bar-button')
      // .on('pointerup', function(d3_event) {
      //   lastPointerUpType = d3_event.pointerType;
      // })
      .on('click', d3_event => {
        save(d3_event);
        // if (_numChanges === 0 && (
        //     lastPointerUpType === 'touch' ||
        //     lastPointerUpType === 'pen')
        // ) {
        //     // there are no tooltips for touch interactions so flash feedback instead
        //     context.ui().flash
        //         .duration(2000)
        //         .iconName('#rapid-icon-save')
        //         .iconClass('disabled')
        //         .label(context.tHtml('save.no_changes'))();
        // }
        // lastPointerUpType = null;
      })
      .call(tooltip);

    button
      .call(uiIcon('#rapid-icon-save'));

    button
      .append('span')
      .attr('class', 'count')
      .attr('aria-hidden', 'true')
      .html('0');

    updateCount();


    context.keybinding()
      .on(key, save, true /* capture */);

    context.history()
      .on('change.save', updateCount);

    context
      .on('enter.save', () => {
        button.classed('disabled', isDisabled());
        if (isSaving()) {
          button.call(tooltip.hide);
        }
      });
  };


  tool.uninstall = function() {
    context.keybinding()
      .off(key, true /* capture */);

    context.history()
      .on('change.save', null);

    context
      .on('enter.save', null);

    button = d3_select(null);
    tooltip = null;
  };

  return tool;
}
