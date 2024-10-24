import { selection } from 'd3-selection';

import { uiIcon } from './icon.js';


/**
 * UiApiStatus
 * This component displays a status message in a bar across the bottom of the map,
 * for example with the OSM API is unavailable.
 */
export class UiApiStatus {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    this.context = context;

    this._apiStatus = null;
    this._backupStatus = null;

    // D3 selections
    this.$parent = null;

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.render = this.render.bind(this);
    this._onApiStatusChange = this._onApiStatusChange.bind(this);
    this._onBackupStatusChange = this._onBackupStatusChange.bind(this);

    // Setup event listeners
    const editor = context.systems.editor;
    editor.on('backupstatuschange', this._onBackupStatusChange);

    // Note that it's possible to run in an environment without OSM.
    const osm = context.services.osm;
    if (osm) {
      // Count down once per second if we're under a rate limit..
      window.setInterval(() => {
        if (this._apiStatus === 'ratelimit') {
          this.render();
        }
      }, 1000);

      // Refresh status periodically regardless of other factors..
      window.setInterval(() => {
        osm.reloadApiStatus();
      }, 90000);

      // Load the initial status in case no OSM data was loaded yet
      osm.reloadApiStatus();

      osm.on('apistatuschange', this._onApiStatusChange);
    }
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

    // When the rate limit has expired, this will return `null`
    const rateLimit = osm?.getRateLimit();

    // Create .api-status wrapper, if necessary
    let $apiStatus = $parent.selectAll('.api-status')
      .data([0]);

    // enter
    const $$apiStatus = $apiStatus.enter()
      .append('div')
      .attr('class', 'api-status');

    // update
    $apiStatus = $apiStatus.merge($$apiStatus);

    // Empty out the DOM content and rebuild from scratch..
    $apiStatus.html('');

    if (this._apiStatus === 'readonly') {
      $apiStatus.text(l10n.t('osm_api_status.message.readonly'));

    } else if (this._apiStatus === 'offline') {
      $apiStatus.text(l10n.t('osm_api_status.message.offline'));

    } else if (this._apiStatus === 'ratelimit' && rateLimit) {
      $apiStatus.text(l10n.t('osm_api_status.message.ratelimit', { seconds: rateLimit.remaining }));

      if (osm && !osm.authenticated()) {   // Tell the user to log in..
        $apiStatus
          .append('a')
          .attr('href', '#')
          .attr('target', '_blank')
          .call(uiIcon('#rapid-icon-out-link', 'inline'))
          .append('span')
          .text(l10n.t('login'))
          .on('click.login', e => {
            e.preventDefault();
            osm.authenticate();
            this._apiStatus = 'online';
          });
      }

    } else if (this._apiStatus === 'error') {   // Some other problem, "check your network connection"..
      $apiStatus.text(l10n.t('osm_api_status.message.error') + ' ');

      if (osm) {   // Let the user manually retry their connection
        $apiStatus
          .append('a')
          .attr('href', '#')
          .text(l10n.t('osm_api_status.retry'))
          .on('click.retry', e => {
            e.preventDefault();
            osm.throttledReloadApiStatus();
          });
      }

    } else if (this._backupStatus === 'error') {  // API is fine, but backups are not..
      $apiStatus.text(l10n.t('osm_api_status.message.local_storage_full'));
    }
  }


  /**
   * _onApiStatusChange
   * Callback function called on any API status change by the OSM service.
   * @param  {Error}   err? - optional Error object
   * @param  {string}  apiStatus - probably 'online', 'readonly', or 'offline'
   */
  _onApiStatusChange(err, apiStatus) {
    this._apiStatus = apiStatus ?? 'error';
    this.render();
  }


  /**
   * _onBackupStatusChange
   * Callback function called on any backup status change by the EditSystem
   * @param  {boolean}  wasSuccessful - `true` if backups are successful, `false` if not
   */
  _onBackupStatusChange(wasSuccessful) {
    this._backupStatus = wasSuccessful ? 'ok' : 'error';
    this.render();
  }
}
