import debounce from 'lodash-es/debounce';
import { select as d3_select } from 'd3-selection';

import { uiIcon } from '../icon';
import { uiTooltip } from '../tooltip';


export function uiToolNotes(context) {
  let tool = {
    id: 'notes',
    label: context.tHtml('modes.add_note.label')
  };

  const mode = {
    id: 'add-note',
    title: context.tHtml('modes.add_note.title'),
    button: 'note',
    description: context.tHtml('modes.add_note.description'),
    key: context.t('modes.add_note.key')
  };


  function notesEnabled() {
    return context.scene().layers.get('notes')?.enabled;
  }

  function notesEditable() {
    return context.mode()?.id !== 'save';
  }

  let debouncedUpdate;
  let _selection;


  function update() {
    if (!_selection) return;

    const data = notesEnabled() ? [mode] : [];
    let buttons = _selection.selectAll('button.add-button')
      .data(data, d => d.id);

    // exit
    buttons.exit()
      .remove();

    // enter
    let buttonsEnter = buttons.enter()
      .append('button')
      .attr('class', d => `${d.id} add-button bar-button`)
      .on('click.notes', (d3_event, d) => {
        if (!notesEditable()) return;

        // When drawing, ignore accidental clicks on mode buttons - #4042
        var currMode = context.mode().id;
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
          .call(uiIcon(d.icon || `#rapid-icon-${d.button}`));
      });

    // if we are adding/removing the buttons, check if toolbar has overflowed
    if (buttons.enter().size() || buttons.exit().size()) {
      context.ui().checkOverflow('.top-toolbar', true);
    }

    // update
    buttons = buttons
      .merge(buttonsEnter)
      .classed('disabled', () => !notesEnabled())
      .classed('active', d => context.mode() && context.mode().id === d.id);
  }


  tool.install = function(selection) {
    _selection = selection;
    debouncedUpdate = debounce(update, 500, { leading: true, trailing: true });

    context.keybinding().on(mode.key, () => {
      if (!notesEditable()) return;

      if (mode.id === context.mode().id) {
        context.enter('browse');
      } else {
        context.enter(mode.id);
      }
    });

    context.mapSystem().on('draw', debouncedUpdate);
    context.on('modechange', update);

    update();
  };


  tool.uninstall = function() {
    debouncedUpdate.cancel();
    context.keybinding().off(mode.key);
    context.off('modechange', update);
    context.mapSystem().off('draw', debouncedUpdate);
    _selection = null;
  };

  return tool;
}
