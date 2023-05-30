import _debounce from 'lodash-es/debounce';
import { select as d3_select } from 'd3-selection';

import { uiIcon } from '../icon';
import { uiCmd } from '../cmd';
import { uiTooltip } from '../tooltip';


export function uiToolUndoRedo(context) {
  const l10n = context.localizationSystem();
  const isRTL = l10n.isRTL();

  let tool = {
    id: 'undo_redo',
    label: l10n.tHtml('toolbar.undo_redo')
  };

  const commands = [{
    id: 'undo',
    key: uiCmd('⌘Z'),
    action: () => context.undo(),
    annotation: () => context.history().undoAnnotation(),
    icon: (isRTL ? 'redo' : 'undo')
  }, {
    id: 'redo',
    key: uiCmd('⌘⇧Z'),
    action: () => context.redo(),
    annotation: () => context.history().redoAnnotation(),
    icon: (isRTL ? 'undo' : 'redo')
  }];


  let debouncedUpdate;

  tool.install = function(selection) {
    let tooltipBehavior = uiTooltip(context)
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
      .keys(d => [d.key])
      .scrollContainer(context.container().select('.top-toolbar'));

    // var lastPointerUpType;

    let buttons = selection.selectAll('button')
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
        //     context.ui().flash
        //         .duration(2000)
        //         .iconName('#' + d.icon)
        //         .iconClass(annotation ? '' : 'disabled')
        //         .label(text)();
        // }
        // lastPointerUpType = null;
      })
      .call(tooltipBehavior);

    buttons.each((d, i, nodes) => {
      d3_select(nodes[i])
        .call(uiIcon(`#rapid-icon-${d.icon}`));
    });

    debouncedUpdate = _debounce(update, 500, { leading: true, trailing: true });

    commands.forEach(command => {
      context.keybinding().on(command.key, d3_event => {
        d3_event.preventDefault();
        if (context.editable()) command.action();
      });
    });

    context.mapSystem()
      .on('draw', debouncedUpdate);

    context.history()
      .on('change.undo_redo', difference => {
        if (difference) update();
      });

    context
      .on('enter.undo_redo', update);


    function update() {
      buttons
        .classed('disabled', d => !context.editable() || !d.annotation())
        .each((d, i, nodes) => {
          const selection = d3_select(nodes[i]);
          if (!selection.select('.tooltip.in').empty()) {
            selection.call(tooltipBehavior.updateContent);
          }
        });
    }
  };


  tool.uninstall = function() {
    commands.forEach(command => {
      context.keybinding().off(command.key);
    });

    context.mapSystem()
      .off('draw', debouncedUpdate);

    context.history()
      .on('change.undo_redo', null);

    context
      .on('enter.undo_redo', null);
  };

  return tool;
}
