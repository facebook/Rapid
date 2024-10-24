import { selection } from 'd3-selection';

import { uiIcon } from './icon.js';


/**
 * UiViewOn
 * This component adds a link like "View On OSM"
 */
export class UiViewOn {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    this.context = context;

    this.url = null;
    this.stringID = null;

    // D3 selections
    this.$parent = null;

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.render = this.render.bind(this);
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

    const url = this.url;
    const stringID = this.stringID;

    let $viewon = $parent.selectAll('.view-on')
      .data(url && stringID ? [url] : [], d => d);

    // exit
    $viewon.exit()
      .remove();

    // enter
    const $$viewon = $viewon.enter()
      .append('a')
      .attr('class', 'view-on')
      .attr('target', '_blank')
      .call(uiIcon('#rapid-icon-out-link', 'inline'));

    $$viewon
      .append('span');

    // update
    $viewon = $viewon.merge($$viewon);

    $viewon
      .attr('href', d => d);

    $viewon.selectAll('span')
      .text(stringID ? l10n.t(stringID) : '');
  }
}
