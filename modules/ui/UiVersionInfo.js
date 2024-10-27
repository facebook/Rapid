import { selection } from 'd3-selection';

import { uiIcon } from './icon.js';
import { uiTooltip } from './tooltip.js';


/**
 * UiVersionInfo
 * This component adds a link that shows the current version of Rapid
 *  and links to the Rapid changelog.
 * It will also display a "new version" badge (gift icon) when the user has
 *  previously used a different version of Rapid.
 */
export class UiVersionInfo {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    this.context = context;

    const currVersion = context.version;
    const isPrerelease = currVersion.includes('-');
    const isValidVersion = /\d+\.\d+\.\d+.*/.test(currVersion);

    const storage = context.systems.storage;
    const sawVersion = storage.getItem('sawVersion');

    this.isNewUser = (sawVersion === null);
    this.isNewVersion = false;

    // This is considered a "new" version (for the purpose of showing the badge) if it is:
    // - a valid version string, and
    // - different from one the user has seen, and
    // - not a prerelease version
    if (isValidVersion) {
      this.isNewVersion = (sawVersion !== currVersion) && !isPrerelease;
      storage.setItem('sawVersion', currVersion);
    }

    // Create child components
    this.Tooltip = uiTooltip(context);

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
    const currVersion = context.version;

    // Create wrapper div if necessary
    let $wrap = $parent.selectAll('.version-wrap')
      .data([0]);

    const $$wrap = $wrap.enter()
      .append('div')
      .attr('class', 'version-wrap');

    $$wrap
      .append('a')
      .attr('target', '_blank')
      .attr('tabindex', -1)
      .attr('href', 'https://github.com/facebook/Rapid/blob/main/CHANGELOG.md')
      .text(currVersion);

    // Only show badge to users that have used Rapid before
    if (this.isNewVersion && !this.isNewUser) {
      $$wrap
        .append('a')
        .attr('class', 'badge')
        .attr('target', '_blank')
        .attr('tabindex', -1)
        .attr('href', 'https://github.com/facebook/Rapid/blob/main/CHANGELOG.md')
        .call(uiIcon('#maki-gift'))
        .call(this.Tooltip);
    }

    // update
    $wrap = $wrap.merge($$wrap);

    this.Tooltip
      .title(l10n.t('version.whats_new', { version: currVersion }))
      .placement('top')
      .scrollContainer(context.container().select('.map-footer-wrap'));
  }
}
