import { selection, select } from 'd3-selection';
import debounce from 'lodash-es/debounce.js';

import { uiIcon } from '../icon.js';
import { uiTooltip } from '../tooltip.js';


/**
 * UiToolDrawModes
 * A toolbar section for the mode buttons
 */
export class UiToolDrawModes {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    this.context = context;
    this.id = 'draw_modes';
    this.stringID = 'toolbar.add_feature';

    const l10n = context.systems.l10n;
    const gfx = context.systems.gfx;
    const presets = context.systems.presets;
    const ui = context.systems.ui;

    this.commands = [{
      id: 'add-point',
      icon: 'point',
      preset: presets.item('point'),
      getTitle: () => l10n.t('modes.add_point.title'),
      getDescription: () => l10n.t('modes.add_point.description'),
      getKey: () => '1'
    }, {
      id: 'draw-line',
      icon: 'line',
      preset: presets.item('line'),
      getTitle: () => l10n.t('modes.add_line.title'),
      getDescription: () => l10n.t('modes.add_line.description'),
      getKey: () => '2'
    }, {
      id: 'draw-area',
      icon: 'area',
      preset: presets.item('area'),
      getTitle: () => l10n.t('modes.add_area.title'),
      getDescription: () => l10n.t('modes.add_area.description'),
      getKey: () => '3'
    }, {
      id: 'add-note',
      icon: 'note',
      getTitle: () => l10n.t('modes.add_note.title'),
      getDescription: () => l10n.t('modes.add_note.description'),
      getKey: () => l10n.t('modes.add_note.key')
    }];


    // Create child components
    this.Tooltip = uiTooltip(context)
      .placement('bottom')
      .title(d => d.getDescription())
      .shortcut(d => d.getKey());

    // D3 selections
    this.$parent = null;

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.choose = this.choose.bind(this);
    this.render = this.render.bind(this);
    this.rerender = (() => this.render());  // call render without argument
    this.debouncedRender = debounce(this.rerender, 500, { leading: true, trailing: true });

    // Event listeners
    for (const d of this.commands) {
      context.keybinding().on(d.getKey(), e => this.choose(e, d));
    }
    gfx.on('draw', this.debouncedRender);
    gfx.scene.on('layerchange', this.rerender);
    context.on('modechange', this.rerender);
    ui.on('uichange', this.rerender);
  }


  /**
   * render
   * Accepts a parent selection, and renders the content under it.
   * (The parent selection is required the first time, but can be inferred on subsequent renders)
   * @param {d3-selection} $parent - A d3-selection to a HTMLElement that this component should render itself into
   */
  render($parent = this.$parent) {
    if ($parent instanceof selection) {
      this.$parent = $parent;
    } else {
      return;   // no parent - called too early?
    }

    const context = this.context;
    const ui = context.systems.ui;

    this.Tooltip
      .scrollContainer(context.container().select('.map-toolbar'));

    // Button group
    let $joined = $parent.selectAll('.joined')
      .data([0]);

    const $$joined = $joined.enter()
      .append('div')
      .attr('class', 'joined')
      .style('display', 'flex');

    $joined = $joined.merge($$joined);


    // Buttons
    const showButtons = this.commands.filter(d => {
      return (d.id === 'add-note') ? this.notesEnabled() : true;
    });

    let $buttons = $joined.selectAll('button.add-button')
      .data(showButtons, d => d.id);

    // exit
    $buttons.exit()
      .remove();

    // enter
    const $$buttons = $buttons.enter()
      .append('button')
      .attr('class', d => `${d.id} add-button bar-button`)
      .on('click', this.choose);

    $$buttons
      .each((d, i, nodes) => {
        select(nodes[i])
          .call(uiIcon(`#rapid-icon-${d.icon}`))
          .call(this.Tooltip);
      });

    $$buttons
      .append('span')
      .attr('class', 'label');

    // If we are adding/removing any buttons, check if toolbar has overflowed..
    if ($buttons.enter().size() || $buttons.exit().size()) {
      ui.checkOverflow('.map-toolbar', true);
    }

    // update
    $buttons = $buttons.merge($$buttons);

    $buttons
      .classed('disabled', d => !this.buttonEnabled(d))
      .classed('active', d => context.mode?.id === d.id);

    $buttons.selectAll('.label')
      .text(d => d.getTitle());
  }


  osmEnabled() {
    return this.context.scene().layers.get('osm')?.enabled;
  }

  osmEditable() {
    return this.context.mode?.id !== 'save';
  }

  notesEnabled() {
    return this.context.scene().layers.get('notes')?.enabled;
  }

  notesEditable() {
    return this.context.mode?.id !== 'save';
  }

  buttonEnabled(d) {
    if (d.id === 'add-note') return this.notesEnabled() && this.notesEditable();
    if (d.id !== 'add-note') return this.osmEnabled() && this.osmEditable();
  }


  /**
   * choose
   * @param  {Event}  e? - the triggering event, if any (keypress or click)
   * @param  {Object} d? - object bound to the selection (i.e. the command)
   */
  choose(e, d) {
    if (e)  e.preventDefault();
    if (!d || !this.buttonEnabled(d)) return;

    const context = this.context;
    const currMode = context.mode?.id;

    // When drawing, ignore accidental clicks on mode buttons - iD#4042
    if (e && /^draw/.test(currMode)) return;   // d3_event will be defined if user clicked

    if (d.id === currMode) {
      context.enter('browse');
    } else {
      context.enter(d.id);
    }
  }

}
