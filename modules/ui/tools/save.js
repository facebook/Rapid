import { interpolateRgb as d3_interpolateRgb } from 'd3-interpolate';

import { uiIcon } from '../icon';
import { uiCmd } from '../cmd';
import { uiTooltip } from '../tooltip';


export function uiToolSave(context) {
  const editor = context.systems.editor;

  let tool = {
    id: 'save',
    label: context.tHtml('save.title')
  };

  let key = uiCmd('⌘S');
  let _numChanges = 0;
  let _button = null;
  let _tooltip = null;

  function isSaving() {
    return context.mode?.id === 'save';
  }

  function isDisabled() {
    return _numChanges === 0 || context.inIntro || isSaving();
  }

  function save(d3_event) {
    d3_event.preventDefault();
    if (!context.inIntro && !isSaving() && editor.hasChanges()) {
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
    if (!_button || !_tooltip) return;

    const val = editor.difference().summary().size;
    if (val === _numChanges) return;  // no change

    _numChanges = val;

    if (_tooltip) {
      _tooltip
        .title(context.tHtml(_numChanges > 0 ? 'save.help' : 'save.no_changes'))
        .keys([key]);
    }

    _button
      .classed('disabled', isDisabled())
      .style('background', bgColor(_numChanges));

    _button.select('span.count')
      .html(_numChanges);
  }


  function updateDisabled() {
    if (!_button || !_tooltip) return;

    _button.classed('disabled', isDisabled());
    if (isSaving()) {
      _button.call(_tooltip.hide);
    }
  }


  tool.install = function(selection) {
    if (_button && _tooltip) return;  // already installed

    _tooltip = uiTooltip(context)
      .placement('bottom')
      .title(context.tHtml('save.no_changes'))
      .keys([key])
      .scrollContainer(context.container().select('.top-toolbar'));

    // var lastPointerUpType;
    _button = selection
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
        //     context.systems.ui.flash
        //         .duration(2000)
        //         .iconName('#rapid-icon-save')
        //         .iconClass('disabled')
        //         .label(context.tHtml('save.no_changes'))();
        // }
        // lastPointerUpType = null;
      })
      .call(_tooltip);

    _button
      .call(uiIcon('#rapid-icon-save'));

    _button
      .append('span')
      .attr('class', 'count')
      .attr('aria-hidden', 'true')
      .html('0');

    updateCount();

    context.keybinding().on(key, save, true /* capture */);
    editor.on('change', updateCount);
    editor.on('reset', updateCount);
    context.on('modechange', updateDisabled);
  };


  tool.uninstall = function() {
    if (!_button && !_tooltip) return;  // already uninstalled

    context.keybinding().off(key, true /* capture */);
    editor.off('change', updateCount);
    editor.off('reset', updateCount);
    context.off('modechange', updateDisabled);
    _button = null;
    _tooltip = null;
  };

  return tool;
}
