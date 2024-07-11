import { select as d3_select } from 'd3-selection';
import debounce from 'lodash-es/debounce.js';

import { uiCmd } from '../cmd.js';
import { uiIcon } from '../icon.js';
import { uiTooltip } from '../tooltip.js';


export function uiToolUndoRedo(context) {
  const editor = context.systems.editor;
  const l10n = context.systems.l10n;
  const map = context.systems.map;
  const isRTL = l10n.isRTL();

  let _buttons = null;
  let _tooltip = null;
  let debouncedUpdate;

  let tool = {
    id: 'undo_redo',
    label: l10n.t('toolbar.undo_redo')
  };

  const commands = [{
    id: 'undo',
    key: uiCmd('⌘Z'),
    action: () => editor.undo(),
    annotation: () => editor.getUndoAnnotation(),
    icon: (isRTL ? 'redo' : 'undo')
  }, {
    id: 'redo',
    key: uiCmd('⌘⇧Z'),
    action: () => editor.redo(),
    annotation: () => editor.getRedoAnnotation(),
    icon: (isRTL ? 'undo' : 'redo')
  }];


  function update() {
    if (!_buttons || !_tooltip) return;
    _buttons
      .classed('disabled', d => !context.editable() || !d.annotation())
      .each((d, i, nodes) => {
        const selection = d3_select(nodes[i]);
        if (!selection.select('.tooltip.in').empty()) {
          selection.call(_tooltip.updateContent);
        }
      });
  }


  tool.install = function(selection) {
    if (_buttons && _tooltip) return;  // already installed

    _tooltip = uiTooltip(context)
      .placement('bottom')
      .title(d => {
        // Handle string- or object-style annotations. Object-style
        // should include "type" and "description" keys, where
        // "description" is used in place of a string-style annotation.
        // See ui/rapid_feature_inspector.js for the motivating use case.
        let str = d.annotation();
        if (str && str.description) {
          str = str.description;
        }
        return str ? l10n.t(`${d.id}.tooltip`, { action: str }) : l10n.t(`${d.id}.nothing`);
      })
      .shortcut(d => d.key)
      .scrollContainer(context.container().select('.top-toolbar'));

    // var lastPointerUpType;

    _buttons = selection.selectAll('button')
      .data(commands)
      .enter()
      .append('button')
      .attr('class', d => `disabled ${d.id}-button bar-button`)
      // .on('pointerup', function(d3_event) {
      //     // `pointerup` is always called before `click`
      //     lastPointerUpType = d3_event.pointerType;
      // })
      .on('click', (d3_event, d) => {
        d3_event.preventDefault();

        const annotation = d.annotation();
        if (context.editable() && annotation) {
          d.action();
        }

        // if (editable() && (
        //     lastPointerUpType === 'touch' ||
        //     lastPointerUpType === 'pen')
        // ) {
        //     // there are no tooltips for touch interactions so flash feedback instead

        //     var text = annotation ?
        //         t(d.id + '.tooltip', { action: annotation }) :
        //         t(d.id + '.nothing');
        //     context.systems.ui.flash
        //         .duration(2000)
        //         .iconName('#' + d.icon)
        //         .iconClass(annotation ? '' : 'disabled')
        //         .label(text)();
        // }
        // lastPointerUpType = null;
      })
      .call(_tooltip);

    _buttons.each((d, i, nodes) => {
      d3_select(nodes[i])
        .call(uiIcon(`#rapid-icon-${d.icon}`));
    });


    debouncedUpdate = debounce(update, 500, { leading: true, trailing: true });

    for (const command of commands) {
      context.keybinding().off(command.key);
      context.keybinding().on(command.key, d3_event => {
        d3_event.preventDefault();
        if (context.editable()) command.action();
      });
    }

    map.on('draw', debouncedUpdate);
    editor.on('stablechange', update);
    context.on('modechange', update);
  };


  tool.uninstall = function() {
    if (!_buttons && !_tooltip) return;  // already uninstalled

    for (const command of commands) {
      context.keybinding().off(command.key);
    }

    debouncedUpdate.cancel();
    map.off('draw', debouncedUpdate);
    editor.off('stablechange', update);
    context.off('modechange', update);
    _tooltip = null;
    _buttons = null;
  };

  return tool;
}
