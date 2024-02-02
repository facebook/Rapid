import _throttle from 'lodash-es/throttle.js';

import { uiIcon } from './icon.js';


export function uiStatus(context) {
  const editor = context.systems.editor;
  const l10n = context.systems.l10n;
  const osm = context.services.osm;


  return function(selection) {
    if (!osm) return;

    function update(err, apiStatus) {
      selection.html('');

      if (err) {
        if (apiStatus === 'connectionSwitched') {
          // if the connection was just switched, we can't rely on
          // the status (we're getting the status of the previous api)
          return;

        } else if (apiStatus === 'rateLimited') {
          selection
            .html(l10n.tHtml('osm_api_status.message.rateLimit'))
            .append('a')
            .attr('href', '#')
            .attr('class', 'api-status-login')
            .attr('target', '_blank')
            .call(uiIcon('#rapid-icon-out-link', 'inline'))
            .append('span')
            .html(l10n.tHtml('login'))
            .on('click.login', d3_event => {
              d3_event.preventDefault();
              osm.authenticate();
            });

        } else {
          // don't allow retrying too rapidly
          const throttledRetry = _throttle(() => {
            // try loading the visible tiles
            context.loadTiles(context.projection);
            // manually reload the status too in case all visible tiles were already loaded
            osm.reloadApiStatus();
          }, 2000);

          // eslint-disable-next-line no-warning-comments
          // TODO: nice messages for different error types
          selection
            .html(l10n.tHtml('osm_api_status.message.error') + ' ')
            .append('a')
            .attr('href', '#')
            // let the user manually retry their connection directly
            .html(l10n.tHtml('osm_api_status.retry'))
            .on('click.retry', d3_event => {
              d3_event.preventDefault();
              throttledRetry();
            });
        }

      } else if (apiStatus === 'readonly') {
        selection.html(l10n.tHtml('osm_api_status.message.readonly'));
      } else if (apiStatus === 'offline') {
        selection.html(l10n.tHtml('osm_api_status.message.offline'));
      }

      selection.attr('class', 'api-status ' + (err ? 'error' : apiStatus));
    }

    osm.on('apiStatusChange.uiStatus', update);

    editor.on('storage_error', () => {
      selection.html(l10n.tHtml('osm_api_status.message.local_storage_full'));
      selection.attr('class', 'api-status error');
    });

    // reload the status periodically regardless of other factors
    window.setInterval(() => {
      osm.reloadApiStatus();
    }, 90000);

    // load the initial status in case no OSM data was loaded yet
    osm.reloadApiStatus();
  };
}
