import _debounce from 'lodash-es/debounce';
import { select as d3_select } from 'd3-selection';

import { t } from '../../core/localizer';
import { svgIcon } from '../../svg/icon';
import { uiTooltip } from '../tooltip';


export function uiToolNotes(context) {
  let tool = {
    id: 'notes',
    label: t.html('modes.add_note.label')
  };

  const mode = {
    id: 'add-note',
    title: t.html('modes.add_note.title'),
    button: 'note',
    description: t.html('modes.add_note.description'),
    key: t('modes.add_note.key')
  };


  function notesEnabled() {
    return context.scene().layers.get('notes')?.enabled;
  }

  function notesEditable() {
    return context.mode()?.id !== 'save';
  }

  let debouncedUpdate;


  tool.install = function(selection) {
    debouncedUpdate = _debounce(update, 500, { leading: true, trailing: true });

    context.keybinding().on(mode.key, () => {
      if (!notesEditable()) return;

      if (mode.id === context.mode().id) {
        context.enter('browse');
      } else {
        context.enter(mode.id);
      }
    });

    context.map()
      .on('draw', debouncedUpdate);

    context
      .on('enter.notes', update);

    update();


    function update() {
      const data = notesEnabled() ? [mode] : [];
      let buttons = selection.selectAll('button.add-button')
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
        .call(uiTooltip()
          .placement('bottom')
          .title(d => d.description)
          .keys(d => [d.key])
          .scrollContainer(context.container().select('.top-toolbar'))
        );

      buttonsEnter
        .each((d, i, nodes) => {
          d3_select(nodes[i])
            .call(svgIcon(d.icon || `#rapid-icon-${d.button}`));
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
  };


  tool.uninstall = function() {
    context.keybinding().off(mode.key);

    context
      .on('enter.notes', null);

    context.map()
      .off('draw', debouncedUpdate);
  };

  return tool;
}
