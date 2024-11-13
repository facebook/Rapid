import { selection } from 'd3-selection';

import { utilDetect } from '../util/detect.js';
import {
  UiAccount, UiContributors, UiFilterStatus, uiIcon,
  UiScale, UiSourceSwitch, uiTooltip, UiValidatorStatus, UiVersionInfo
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
    this.Contributors = new UiContributors(context);
    this.FilterStatus = new UiFilterStatus(context);
    this.Scale = new UiScale(context);
    this.SourceSwitch = new UiSourceSwitch(context);
    this.ValidatorStatus = new UiValidatorStatus(context);
    this.VersionInfo = new UiVersionInfo(context);

    if (!context.embed()) {
      this.AccountInfo = new UiAccount(context);
    } else {
      this.AccountInfo = null;
    }

    // D3 selections
    this.$parent = null;

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.render = this.render.bind(this);
    this.rerender = (() => this.render());  // call render without argument
    this._clickBugLink = this._clickBugLink.bind(this);
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
      .call(this.FilterStatus.render);

    const $$issueLinks = $$footerInfo
      .append('div');

    $$issueLinks
      .append('button')
      .attr('class', 'bugnub')
      .attr('tabindex', -1)
      .on('click', this._clickBugLink)
      .call(uiIcon('#rapid-icon-bug', 'bugnub'))
      .call(uiTooltip(context).title(l10n.t('report_a_bug')).placement('top'));

    $$issueLinks
      .append('a')
      .attr('target', '_blank')
      .attr('href', 'https://github.com/facebook/Rapid/blob/main/CONTRIBUTING.md#translations')
      .call(uiIcon('#rapid-icon-translate', 'light'))
      .call(uiTooltip(context).title(l10n.t('help_translate')).placement('top'));

    $$footerInfo
      .call(this.VersionInfo.render);

    if (this.AccountInfo) {
      $$footerInfo
        .call(this.AccountInfo.render);
    }
  }


  /*
   * _clickBugLink
   * Opens GitHub to report a bug
   */
  _clickBugLink() {
    const link = new URL('https://github.com/facebook/Rapid/issues/new');

    // From the template we set up at https://github.com/facebook/Rapid/blob/main/.github/ISSUE_TEMPLATE/bug_report.yml
    link.searchParams.append('template', 'bug_report.yml');
    const detected = utilDetect();
    const browser = `${detected.browser} v${detected.version}`;
    const os = `${detected.os}`;
    const userAgent = navigator.userAgent;

    link.searchParams.append('browser', browser);
    link.searchParams.append('os', os);
    link.searchParams.append('useragent', userAgent);
    link.searchParams.append('URL', window.location.href);
    link.searchParams.append('version', this.context.version);

    window.open(link.toString(), '_blank');
  }

}
