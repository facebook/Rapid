import { selection } from 'd3-selection';

import { uiIcon } from './icon.js';


/**
 * UiAccount
 * This component adds the user account info to the footer.
 */
export class UiAccount {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    this.context = context;

    this.user = undefined;  // will be replaced later with `null` or actual user details..

    // D3 selections
    this.$parent = null;

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.render = this.render.bind(this);
    this.tryLogout = this.tryLogout.bind(this);
    this.getUserDetails = this.getUserDetails.bind(this);

    // Note that it's possible to run in an environment without OSM.
    const osm = context.services.osm;
    if (!osm) return;

    // Event listeners
    osm.on('authchange', this.getUserDetails);
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
    const osm = context.services.osm;

    // If we are embedded in another site, for example openstreetmap.org,
    // we don't want to show account switcher controls.
    if (context.embed()) return;

    if (this.user === undefined) {   // First time..
      this.getUserDetails();         // Get the user first, this will call render again..
      return;
    }

    // enter .userInfo
    $parent.selectAll('.userInfo')
      .data([0])
      .enter()
      .append('div')
      .attr('class', 'userInfo');

    // enter .loginLogout
    $parent.selectAll('.loginLogout')
      .data([0])
      .enter()
      .append('div')
      .attr('class', 'loginLogout')
      .append('a')
      .attr('href', '#');

    // update
    const $userInfo = $parent.select('.userInfo');
    const $loginLogout = $parent.select('.loginLogout');


    // Update user...
    if (!this.user) {   // show nothing
      $userInfo
        .html('')  // Empty out the DOM content and rebuild from scratch..
        .classed('hide', true);

    } else {
      $userInfo
        .html('')  // Empty out the DOM content and rebuild from scratch..
        .classed('hide', false);

      const $$userLink = $userInfo
        .append('a')
        .attr('href', osm.userURL(this.user.display_name))
        .attr('target', '_blank');

      // Add user's image or placeholder
      if (this.user.image_url) {
        $$userLink
          .append('img')
          .attr('class', 'icon pre-text user-icon')
          .attr('src', this.user.image_url);
      } else {
        $$userLink
          .call(uiIcon('#rapid-icon-avatar', 'pre-text light'));
      }

      // Add user name
      $$userLink
        .append('span')
        .attr('class', 'label')
        .text(this.user.display_name);
    }


    // Update login/logout...
    if (!osm) {  // show nothing
      $loginLogout
        .classed('hide', true);

    } else if (osm.authenticated()) {    // show "Log Out"
      $loginLogout
        .classed('hide', false)
        .select('a')
        .text(l10n.t('logout'))
        .on('click', e => {
          e.preventDefault();
          osm.logout();
          this.tryLogout();
        });

    } else {   // show "Log In"
      $loginLogout
        .classed('hide', false)
        .select('a')
        .text(l10n.t('login'))
        .on('click', e => {
          e.preventDefault();
          osm.authenticate();
        });
    }

  }


  /**
   * getUserDetails
   * Gets the user details, then calls render again.
   */
  getUserDetails() {
    const context = this.context;
    const osm = context.services.osm;

    if (!osm || !osm.authenticated()) {
      this.user = null;
      this.render();

    } else {
      osm.userDetails((err, user) => {
        this.user = user || null;
        this.render();
      });
    }
  }


  /**
   * tryLogout
   * OAuth2's idea of "logout" is just to get rid of the bearer token.
   * If we try to "login" again, it will just grab the token again.
   * What a user probably _really_ expects is to logout of OSM so that they can switch users.
   */
  tryLogout()  {
    const context = this.context;
    const l10n = context.systems.l10n;
    const osm = context.services.osm;
    if (!osm) return;

    const locale = l10n.localeCode();
    const url = osm.wwwroot + `/logout?locale=${locale}&referer=` + encodeURIComponent(`/login?locale=${locale}`);

    // Create a 600x550 popup window in the center of the screen
    const w = 600;
    const h = 550;
    const settings = [
      ['width', w],
      ['height', h],
      ['left', window.screen.width / 2 - w / 2],
      ['top', window.screen.height / 2 - h / 2],
    ]
    .map(x => x.join('='))
    .join(',');

    window.open(url, '_blank', settings);
  }

}
