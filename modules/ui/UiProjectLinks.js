import { selection } from 'd3-selection';

import { uiIcon } from './icon.js';
import { uiTooltip } from './tooltip.js';
import { utilDetect } from '../util/detect.js';


/**
 * UiProjectLinks
 * This component adds the validator status control to the footer.
 * (was named "issues_info")
 */
export class UiProjectLinks {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    this.context = context;

    // Create child components
    this.BugTooltip = uiTooltip(context).placement('top');
    this.TranslateTooltip = uiTooltip(context).placement('top');

    // D3 selections
    this.$parent = null;

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.render = this.render.bind(this);
    this.reportIssue = this.reportIssue.bind(this);
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

    // Create/remove wrapper div if necessary
    let $wrap = $parent.selectAll('.project-links')
      .data([0]);

    const $$wrap = $wrap.enter()
      .append('div')
      .attr('class', 'project-links');

    $$wrap
      .append('button')
      .attr('class', 'bugnub')
      .attr('tabindex', -1)
      .on('click', this.reportIssue)
      .call(uiIcon('#rapid-icon-bug', 'bugnub'))
      .call(this.BugTooltip);

    $$wrap
      .append('a')
      .attr('target', '_blank')
      .attr('href', 'https://github.com/facebook/Rapid/blob/main/CONTRIBUTING.md#translations')
      .call(uiIcon('#rapid-icon-translate', 'light'))
      .call(this.TranslateTooltip);

    // update
    $wrap = $wrap.merge($$wrap);

    // localize tooltips
    this.BugTooltip.title(l10n.t('report_a_bug'));
    this.TranslateTooltip.title(l10n.t('help_translate'));
  }


  /*
   * reportIssue
   * Opens GitHub to report a bug
   * @param  {Event} e? - triggering event (if any)
   */
  reportIssue(e) {
    if (e)  e.preventDefault();

    this.BugTooltip.hide();

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
