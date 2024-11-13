import { selection } from 'd3-selection';

import {
  UiAccount, UiContributors, UiFilterStatus, UiProjectLinks,
  UiScale, UiSourceSwitch, UiValidatorStatus, UiVersionInfo
} from './index.js';


/**
 * UiMapFooter
 * This component creates the footer section at the top of the map.
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

    const $$footerWrap = $$footer
      .append('div')
      .attr('class', 'map-footer-wrap map-footer-show');

    $$footerWrap
      .call(this.Scale.render);

    const $$footerInfo = $$footerWrap
      .append('div')
      .attr('class', 'map-footer-info');

    $$footerInfo
      .call(this.Contributors.render)
      .call(this.SourceSwitch.render)
      .call(this.ValidatorStatus.render)
      .call(this.FilterStatus.render)
      .call(this.ProjectLinks.render)
      .call(this.VersionInfo.render)
      .call(this.AccountInfo.render);
  }

}
