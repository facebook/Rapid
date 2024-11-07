import { selection, select } from 'd3-selection';

import {
  UiDownloadTool, UiDrawModesTool, UiRapidTool, UiSaveTool, UiUndoRedoTool
} from './tools/index.js';


/**
 * UiMapToolbar
 * This component creates the toolbar section at the top of the map.
 *
 * @example
 * <div class='map-toolbar'>
 *   <div class='toolbar-item spacer'/>           // some toolbar items are just spacers..
 *   <div class='toolbar-item draw-modes'>        // others are real sections..
 *     <div class='item-content'>…</div>             // each real section contains a `item-content`
 *     <div class='item-label'>Add Feature</div>     // and `item-label` beneath it for the section label
 *   </div>
 *   …
 * </div>
 */
export class UiMapToolbar {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    this.context = context;

    // Create child components
    this.DrawModes = new UiDrawModesTool(context);
    this.Rapid = new UiRapidTool(context);
    this.UndoRedo = new UiUndoRedoTool(context);
    this.Save = new UiSaveTool(context);
    this.Download = new UiDownloadTool(context);

    // D3 selections
    this.$parent = null;

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.render = this.render.bind(this);
    this.rerender = (() => this.render());  // call render without argument

    const urlhash = context.systems.urlhash;
    urlhash.on('hashchange', this.rerender);
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
    const l10n = context.systems.l10n;
    const urlhash = context.systems.urlhash;
    const ui = context.systems.ui;

    const tools = [
      'spacer',
      this.DrawModes,
      this.Rapid,
      'spacer',
      this.UndoRedo,
      this.Save,
      this.Download
    ];

    // Create wrapper div if necessary
    $parent.selectAll('.map-toolbar')
      .data([0])
      .enter()
      .append('div')
      .attr('class', 'map-toolbar fillD');

    // update
    const $toolbar = $parent.selectAll('.map-toolbar');

    let $items = $toolbar.selectAll('.toolbar-item')
      .data(tools, (d, i) => d.id || `spacer${i}`);

    // enter
    const $$items = $items
      .enter()
      .append('div')
      .attr('class', d => {
        let classes = 'toolbar-item ' + (d.id || d).replace('_', '-');
        if (d.klass) classes += ' ' + d.klass;
        return classes;
      });

    const $$realItems = $$items
      .filter(d => d !== 'spacer');

    $$realItems
      .append('div')
      .attr('class', 'item-content');

    $$realItems
      .append('div')
      .attr('class', 'item-label');

    // update
    $items = $items.merge($$items);

    // hidden/undocumented feature:
    // only show the "Download" button if urlhash ccontains `&download_osc=true`
    const showDownload = urlhash.getParam('download_osc') === 'true';
    $items.filter(d => d.id === 'download_osc')
      .classed('hide', !showDownload);

    $items
      .selectAll('.item-content')
      .each((d, i, nodes) => {
        select(nodes[i]).call(d.render);
      });

    $items
      .selectAll('.item-label')
      .text(d => l10n.t(d.stringID));

    // If we are adding/removing any buttons, check if toolbar has overflowed..
    ui.checkOverflow('.map-toolbar', true);
  }

}
