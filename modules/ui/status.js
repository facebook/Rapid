import { uiIcon } from './icon.js';


// `uiStatus` is a UI component for displaying a status message in a bar
// across the bottom of the map, for example with the OSM API is unavailable.

export function uiStatus(context) {
  const editor = context.systems.editor;
  const l10n = context.systems.l10n;
  const osm = context.services.osm;

  let _apiStatus;
  let _backupStatus;
  let _rateLimitIntervalID;
  let _apiStatusIntervalID;


  return function(selection) {
    if (!osm) return;

    // Count down once per second if we're under a rate limit..
    if (!_rateLimitIntervalID) {
      _rateLimitIntervalID = window.setInterval(() => {
        if (_apiStatus === 'ratelimit') {
          render();
        }
      }, 1000);
    }

    // Refresh status periodically regardless of other factors..
    if (!_apiStatusIntervalID) {
      _apiStatusIntervalID = window.setInterval(() => {
        osm.reloadApiStatus();
      }, 90000);
    }

    // Load the initial status in case no OSM data was loaded yet
    osm.reloadApiStatus();

    // Add or replace event handlers
    osm.off('apistatuschange', _onApiStatusChange);
    osm.on('apistatuschange', _onApiStatusChange);
    editor.off('backupstatuschange', _onBackupStatusChange);
    editor.on('backupstatuschange', _onBackupStatusChange);

    function _onBackupStatusChange(wasSuccessful) {
      _backupStatus = wasSuccessful ? 'ok' : 'error';
      render();
    }

    function _onApiStatusChange(err, apiStatus) {
      _apiStatus = apiStatus ?? 'error';
      render();
    }


    function render() {
      // When the rate limit has expired, this will return `null`
      const rateLimit = osm.getRateLimit();

      // Empty out the DOM content and rebuild from scratch..
      selection.html('');

      if (_apiStatus === 'readonly') {
        selection
          .attr('class', 'api-status')
          .text(l10n.t('osm_api_status.message.readonly'));

      } else if (_apiStatus === 'offline') {
        selection
          .attr('class', 'api-status')
          .text(l10n.t('osm_api_status.message.offline'));

      } else if (_apiStatus === 'ratelimit' && rateLimit) {
        selection
          .attr('class', 'api-status error')
          .text(l10n.t('osm_api_status.message.ratelimit', { seconds: rateLimit.remaining }));

        if (!osm.authenticated()) {   // Tell the user to log in
          selection
            .append('a')
            .attr('href', '#')
            .attr('class', 'api-status-login')
            .attr('target', '_blank')
            .call(uiIcon('#rapid-icon-out-link', 'inline'))
            .append('span')
            .text(l10n.t('login'))
            .on('click.login', d3_event => {
              d3_event.preventDefault();
              osm.authenticate();
              _apiStatus = 'online';
            });
        }

      } else if (_apiStatus === 'error') {   // some other problem, "check your network connection"
        selection
          .attr('class', 'api-status error')
          .text(l10n.t('osm_api_status.message.error') + ' ')
          .append('a')
          .attr('href', '#')   // let the user manually retry their connection directly
          .text(l10n.t('osm_api_status.retry'))
          .on('click.retry', d3_event => {
            d3_event.preventDefault();
            osm.throttledReloadApiStatus();
          });

      } else if (_backupStatus === 'error') {
        selection
          .attr('class', 'api-status error')
          .text(l10n.t('osm_api_status.message.local_storage_full'));
      }
    }

  };
}
