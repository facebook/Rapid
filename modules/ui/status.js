import { uiIcon } from './icon.js';


// `uiStatus` is a UI component for displaying a status message in a bar
// across the bottom of the map, for example with the OSM API is unavailable.

export function uiStatus(context) {
  const editor = context.systems.editor;
  const l10n = context.systems.l10n;
  const osm = context.services.osm;

  let _apiStatus;
  let _backupStatus;
  let _rateLimitInfo;


  return function(selection) {
    if (!osm) return;

    // Count down once per second if we're under a rate limit..
    window.setInterval(() => {
      if (_rateLimitInfo) {
        render();
      }
    }, 1000);

    // Refresh status periodically regardless of other factors..
    window.setInterval(() => {
      osm.reloadApiStatus();
    }, 90000);

    // Load the initial status in case no OSM data was loaded yet
    osm.reloadApiStatus();

    // add or replace event handlers
    osm.off('apiStatusChange', _onStatusChange);
    osm.on('apiStatusChange', _onStatusChange);
    editor.off('backup', _onBackup);
    editor.on('backup', _onBackup);

    function _onBackup(wasSuccessful) {
      _backupStatus = wasSuccessful ? 'ok' : 'error';
      render();
    }

    function _onStatusChange(err, apiStatus) {
      _apiStatus = apiStatus ?? 'error';
      if (_apiStatus === 'ratelimit') {
        _rateLimitInfo = err;
      } else {
        _rateLimitInfo = null;
      }
      render();
    }


    function render() {
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

      } else if (_apiStatus === 'ratelimit') {

        if (!osm.authenticated()) {   // Tell the user to log in
          selection
            .attr('class', 'api-status error')
            .text(l10n.t('osm_api_status.message.ratelimit_auth'))
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
              _rateLimitInfo = null;
            });

        } else {    // Tell the user to slow down
          const now = Math.floor(Date.now() / 1000);  // epoch seconds
          if (!_rateLimitInfo) {  // If missing, pick sensible defaults
            _rateLimitInfo = { start: now, retry: 30 };
          }

          let elapsed = now - _rateLimitInfo.start;
          // Check if something unexpected moved the clock more than 5 seconds backwards
          if (elapsed < -5) { // time travel? leap seconds? epoch rollover?
            _rateLimitInfo.start = now;  // restart the counter
            elapsed = 0;
          }

          const remain = _rateLimitInfo.retry - elapsed;
          if (remain > 0) {
            selection
              .attr('class', 'api-status error')
              .text(l10n.t('osm_api_status.message.ratelimit_wait', { seconds: remain }));
          } else {
            _apiStatus = 'online';  // reset
            _rateLimitInfo = null;  // reset
          }
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
