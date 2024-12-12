import { selection, select } from 'd3-selection';
import debounce from 'lodash-es/debounce.js';

import { uiIcon } from '../icon.js';
import { uiTooltip } from '../tooltip.js';
import { utilCmd } from '../../util/cmd.js';


/**
 * UiUndoRedoTool
 * A toolbar section for the undo/redo buttons
 */
export class UiUndoRedoTool {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    this.context = context;
    this.id = 'undo_redo';
    this.stringID = 'toolbar.undo_redo';

    const editor = context.systems.editor;
    const l10n = context.systems.l10n;
    const map = context.systems.map;

    // Create child components
    this.Tooltip = uiTooltip(context)
      .title(d => {
        // Handle string- or object-style annotations. Object-style
        // should include "type" and "description" keys, where
        // "description" is used in place of a string-style annotation.
        // See ui/UiRapidInspector.js for the motivating use case.
        let str = d.annotation();
        if (str?.description) {
          str = str.description;
        }
        return str ? l10n.t(`${d.id}.tooltip`, { action: str }) : l10n.t(`${d.id}.nothing`);
      })
      .shortcut(d => d.key);


    this.commands = [{
      id: 'undo',
      key: utilCmd('⌘Z'),
      action: () => editor.undo(),
      annotation: () => editor.getUndoAnnotation(),
      getIcon: () => (l10n.isRTL() ? 'redo' : 'undo')
    }, {
      id: 'redo',
      key: utilCmd('⌘⇧Z'),
      action: () => editor.redo(),
      annotation: () => editor.getRedoAnnotation(),
      getIcon: () => (l10n.isRTL() ? 'undo' : 'redo')
    }];


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
      context.keybinding().on(d.key, e => this.choose(e, d));
    }
    map.on('draw', this.debouncedRender);
    editor.on('stablechange', this.rerender);
    context.on('modechange', this.rerender);
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

    this.Tooltip
      .placement('bottom')
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
    let $buttons = $joined.selectAll('button')
      .data(this.commands, d => d.id);

    // enter
    const $$buttons = $buttons.enter()
      .append('button')
      .attr('class', d => `disabled ${d.id}-button bar-button`)
      .on('click', this.choose)
      .call(this.Tooltip)
      .call(uiIcon(''));

    // update
    $buttons = $buttons.merge($$buttons);

    $buttons
      .each((d, i, nodes) => {
        const $selection = select(nodes[i]);

        // set class
        $selection
          .classed('disabled', !context.editable() || !d.annotation());

        // set icon
        const icon = '#rapid-icon-' + d.getIcon();
        $selection.selectAll('.icon use')
          .attr('href', icon);

        // set tooltip
        if (!$selection.select('.tooltip.in').empty()) {
          $selection.call(this.Tooltip.updateContent);
        }
      });
  }


  /**
   * choose
   * @param  {Event}  e? - triggering event (if any)
   * @param  {Object} d? - object bound to the selection (i.e. the command)
   */
  choose(e, d) {
    if (e)  e.preventDefault();
    if (!d) return;

    const context = this.context;
    const annotation = d.annotation();
    if (context.editable() && annotation) {
      d.action();
    }
  }

}
