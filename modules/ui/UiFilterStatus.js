import { selection } from 'd3-selection';
import throttle from 'lodash-es/throttle.js';

import { uiIcon } from './icon.js';
import { uiTooltip } from './tooltip.js';


/**
 * UiFilterStatus
 * This component adds the filter status control to the footer.
 * (was named "feature_info")
 */
export class UiFilterStatus {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    this.context = context;

    // Create child components
    this.Tooltip = uiTooltip(context).placement('top');

    // D3 selections
    this.$parent = null;

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.render = this.render.bind(this);
    this.rerender = (() => this.render());  // call render without argument
    this.click = this.click.bind(this);
    this.deferredRender = throttle(this.rerender, 1000, { leading: true, trailing: true });

    // Event listeners
    const gfx = context.systems.gfx;
    gfx.on('draw', this.deferredRender);
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
    const filters = context.systems.filters;
    const l10n = context.systems.l10n;

    // Create/remove wrapper div if necessary
    let $wrap = $parent.selectAll('.filter-info')
      .data([0]);

    const $$wrap = $wrap.enter()
      .append('div')
      .attr('class', 'filter-info');

    const $$chip = $$wrap
      .append('a')
      .attr('class', 'chip')
      .attr('href', '#')
      .on('click', this.click)
      .call(this.Tooltip)
      .call(uiIcon('#fas-filter'));

    $$chip
      .append('span')
      .attr('class', 'count');

    // update
    $wrap = $wrap.merge($$wrap);


    // Gather stats about what features are currently filtered
    const stats = filters.getStats();
    const details = [];
    let total = 0;
    for (const [filterID, filter] of Object.entries(stats)) {
      if (filter.count > 0) {
        total += filter.count;
        details.push(
          l10n.t('inspector.title_count', { title: l10n.t(`filters.${filterID}.description`), count: filter.count })
        );
      }
    }

    if (details.length) {
      this.Tooltip.title(l10n.t('filters.active') + '<br/>' + details.join('<br/>'));
    } else {
      this.Tooltip.hide();
    }

    $wrap
      .classed('hide', !details.length);

    $wrap
      .selectAll('span.count')
      .text(total.toString());
  }


  /**
   * click
   * When clicking on a status chip, toggle the Map Data pane.
   * @param  {Event} e? - triggering event (if any)
   */
  click(e) {
    if (e)  e.preventDefault();

    const context = this.context;
    const ui = context.systems.ui;

    this.Tooltip.hide();

    ui.Overmap.MapPanes.MapData.togglePane();
  }

}

