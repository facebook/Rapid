import { select as d3_select } from 'd3-selection';
import debounce from 'lodash-es/debounce.js';

import { uiIcon } from '../icon.js';
import { uiTooltip } from '../tooltip.js';


export function uiToolDrawModes(context) {
  const l10n = context.systems.l10n;
  const map = context.systems.map;
  const presets = context.systems.presets;
  const ui = context.systems.ui;

  let debouncedRender;
  let $toolbar;

  let tool = {
    id: 'draw_modes',
    label: l10n.t('toolbar.add_feature')
  };

  const modes = [
    {
      id: 'add-point',
      title: l10n.t('modes.add_point.title'),
      button: 'point',
      description: l10n.t('modes.add_point.description'),
      preset: presets.item('point'),
      key: '1'
    },
    {
      id: 'draw-line',
      title: l10n.t('modes.add_line.title'),
      button: 'line',
      description: l10n.t('modes.add_line.description'),
      preset: presets.item('line'),
      key: '2'
    },
    {
      id: 'draw-area',
      title: l10n.t('modes.add_area.title'),
      button: 'area',
      description: l10n.t('modes.add_area.description'),
      preset: presets.item('area'),
      key: '3'
    },
    {
      id: 'add-note',
      title: l10n.t('modes.add_note.title'),
      button: 'note',
      description: l10n.t('modes.add_note.description'),
      key: l10n.t('modes.add_note.key')
    }
  ];


  function osmEnabled() {
    return context.scene().layers.get('osm')?.enabled;
  }

  function osmEditable() {
    return context.mode?.id !== 'save';
  }

  function notesEnabled() {
    return context.scene().layers.get('notes')?.enabled;
  }

  function notesEditable() {
    return context.mode?.id !== 'save';
  }


  function clickButton(d3_event, d) {
    if (!buttonEnabled(d)) return;

    const currMode = context.mode?.id;

    // When drawing, ignore accidental clicks on mode buttons - iD#4042
    if (d3_event && /^draw/.test(currMode)) return;   // d3_event will be defined if user clicked

    if (d.id === currMode) {
      context.enter('browse');
    } else {
      context.enter(d.id);
    }
  }


  function buttonEnabled(d) {
    if (d.id === 'add-note') return notesEnabled() && notesEditable();
    if (d.id !== 'add-note') return osmEnabled() && osmEditable();
  }


  /**
   * render
   */
  function render() {
    if (!$toolbar) return;  // called too early?

    const showModes = modes.filter(d => {
      return (d.id === 'add-note') ? notesEnabled() : true;
    });

    let $buttons = $toolbar.selectAll('button.add-button')
      .data(showModes, d => d.id);

    // exit
    $buttons.exit()
      .remove();

    // enter
    const $$buttons = $buttons.enter()
      .append('button')
      .attr('class', d => `${d.id} add-button bar-button`)
      .on('click.mode-buttons', clickButton);

    $$buttons
      .each((d, i, nodes) => {
        d3_select(nodes[i])
          .call(uiIcon(`#rapid-icon-${d.button}`))
          .call(uiTooltip(context)
            .placement('bottom')
            .title(d.description)
            .shortcut(d.key)
            .scrollContainer(context.container().select('.top-toolbar'))
          );
      });

    $$buttons
      .append('span')
      .attr('class', 'label')
      .text(d => d.title);

    // if we are adding/removing the buttons, check if toolbar has overflowed
    if ($buttons.enter().size() || $buttons.exit().size()) {
      ui.checkOverflow('.top-toolbar', true);
    }

    // update
    $buttons = $buttons
      .merge($$buttons)
      .classed('disabled', !buttonEnabled)
      .classed('active', d => context.mode?.id === d.id);
  }


  tool.install = function($parent) {
    $toolbar = $parent
      .append('div')
      .attr('class', 'joined')
      .style('display', 'flex');

    debouncedRender = debounce(render, 500, { leading: true, trailing: true });

    modes.forEach(d => {
      context.keybinding().off(d.key);
      context.keybinding().on(d.key, () => clickButton(null, d));
    });

    ui.on('uichange', render);
    map.on('draw', debouncedRender);
    map.scene.on('layerchange', render);
    context.on('modechange', render);
    render();
  };


  tool.uninstall = function () {
    modes.forEach(d => {
      context.keybinding().off(d.key);
    });

    debouncedRender.cancel();
    ui.off('uichange', render);
    map.off('draw', debouncedRender);
    map.scene.off('layerchange', render);
    context.off('modechange', render);
    $toolbar = null;
  };

  return tool;
}
