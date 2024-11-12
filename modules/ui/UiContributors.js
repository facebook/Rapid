import { selection, select } from 'd3-selection';
import debounce from 'lodash-es/throttle.js';

import { uiIcon } from './icon.js';

const MAXUSERS = 4;


/**
 * UiContributors
 * This component adds the nearby contributors list to the footer.
 */
export class UiContributors {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    this.context = context;

    this._lastv = null;  // used to avoid updating if nothing has changed

    // D3 selections
    this.$parent = null;

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.render = this.render.bind(this);
    this.rerender = (() => this.render());  // call render without argument
    this.deferredRender = debounce(this.rerender, 1000, { leading: true, trailing: true });

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
    const editor = context.systems.editor;
    const l10n = context.systems.l10n;
    const osm = context.services.osm;
    const viewport = context.viewport;

    // Note that it's possible to run in an environment without OSM.
    if (!osm) return;
    if (this._lastv === viewport.v) return;  // exit early if the view is unchanged

    // Create wrapper div if necessary
    let $wrap = $parent.selectAll('.contributors')
      .data([0]);

    const $$wrap = $wrap.enter()
      .append('div')
      .attr('class', 'contributors');

    $$wrap
      .call(uiIcon('#rapid-icon-nearby', 'pre-text light'));

    $$wrap
      .append('span')
      .attr('class', 'user-list');

    // update
    $wrap = $wrap.merge($$wrap);


    // Gather nearby usernames
    const seen = new Set();
    const entities = editor.intersects(viewport.visibleExtent());
    for (const entity of entities) {
      if (entity?.user) {
        seen.add(entity.user);
      }
    }

    if (seen.size === 0) {  // nothing to show
      $wrap.classed('hide', true);
      return;
    } else {
      $wrap.classed('hide', false);
      this._lastv = viewport.v;
    }

    const usernames = Array.from(seen).slice(0, MAXUSERS);
    const $$links = select(document.createElement('span'));
    $$links.selectAll('a')
      .data(usernames)
      .enter()
      .append('a')
      .attr('class', 'user-link')
      .attr('href', d => osm.userURL(d))
      .attr('target', '_blank')
      .text(d => d);

    const linksHTML = $$links.node().outerHTML;

    if (seen.size > MAXUSERS) {
      const othersNum = seen.size - MAXUSERS;
      const $$count = select(document.createElement('a'));

      $$count
        .attr('target', '_blank')
        .attr('href', osm.changesetsURL(viewport.centerLoc(), viewport.transform.zoom))
        .text(othersNum);

      const countHTML = $$count.node().outerHTML;

      $wrap.selectAll('.user-list')   // "Edits by {users} and {n} others"
        .html(l10n.t('contributors.truncated_list', { n: othersNum, users: linksHTML, count: countHTML }));

    } else {
      $wrap.selectAll('.user-list')   // "Edits by {users}"
        .html(l10n.t('contributors.list', { users: linksHTML }));
    }
  }

}
