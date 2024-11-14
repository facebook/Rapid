import { selection } from 'd3-selection';

import {
  UiAccount, UiContributors, UiFilterStatus, UiProjectLinks,
  UiScale, UiSourceSwitch, UiValidatorStatus, UiVersionInfo
} from './index.js';


/**
 * UiMapFooter
 * This component creates the footer section at the bottom of the map.
 *
 * @example
 * <div class='map-footer'>        // '.map-footer' contains 2 divs:
 *   <div class='flash-wrap'/>       // '.flash-wrap' will slide in to show messages sometimes.
 *   <div class='map-footer-wrap'>   // '.map-footer-wrap' contains the stuff you usually see:
 *     <div class='scale-wrap'/>        // '.scale-wrap' takes 250px on the left
 *     <div class='map-footer-info'>    // all other info takes the remaining space
 *        …    // lots of components live here: contributors, status chips, links, version, account…
 *     </div>
 *   </div>
 * </div>
 */
export class UiMapFooter {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    this.context = context;

    // Create child components
    this.AccountInfo = new UiAccount(context);
    this.Contributors = new UiContributors(context);
    this.FilterStatus = new UiFilterStatus(context);
    this.ProjectLinks = new UiProjectLinks(context);
    this.Scale = new UiScale(context);
    this.SourceSwitch = new UiSourceSwitch(context);
    this.ValidatorStatus = new UiValidatorStatus(context);
    this.VersionInfo = new UiVersionInfo(context);

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

    let $footer = $parent.selectAll('.map-footer')
      .data([0]);

    // enter
    const $$footer = $footer.enter()
      .append('div')
      .attr('class', 'map-footer fillD');

    $$footer
      .append('div')
      .attr('class', 'flash-wrap map-footer-hide');

    $$footer
      .append('div')
      .attr('class', 'map-footer-wrap map-footer-show');

    // update
    $footer = $footer.merge($$footer);

    const $wrap = $footer.selectAll('.map-footer-wrap');

    $wrap
      .call(this.Scale.render);

    // '.map-footer-info' section
    let $info = $wrap.selectAll('.map-footer-info')
      .data([0]);

    // enter
    const $$info = $info.enter()
      .append('div')
      .attr('class', 'map-footer-info');

    // update
    $info = $info.merge($$info);

    $info
      .call(this.Contributors.render)
      .call(this.SourceSwitch.render)
      .call(this.ValidatorStatus.render)
      .call(this.FilterStatus.render)
      .call(this.ProjectLinks.render)
      .call(this.VersionInfo.render)
      .call(this.AccountInfo.render);
  }

}
