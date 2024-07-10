import { select as d3_select } from 'd3-selection';
import { Extent } from '@rapid-sdk/math';

import { uiIcon } from './icon.js';
import { uiLoading } from './loading.js';
import { uiTooltip } from './tooltip.js';

const GEOLOCATE_TIMEOUT = 10000;  // 10 sec
const GEOLOCATE_REPEAT = 2000;    // 2 sec
const GEOLOCATE_OPTIONS = {
  enableHighAccuracy: false,   // prioritize speed and power usage over precision
  timeout: 6000   // 6sec      // don't hang indefinitely getting the location
};


export function uiGeolocate(context) {
  const l10n = context.systems.l10n;
  const map = context.systems.map;
  const ui = context.systems.ui;

  let _uiModal = uiLoading(context).blocking(true).message(l10n.t('geolocate.locating'));
  let _layer = context.scene().layers.get('map-ui');
  let _enabled = false;
  let _timeoutID;
  let _button = d3_select(null);


  function click() {
    if (context.inIntro) return;

    if (!_enabled) {   // start geolocating
      _enabled = true;
      _button.classed('active', true);
      context.enter('browse'); //Clear any selections only ONCE on click, not subsequently!

      // Ensures that we complete even if the success/error callbacks never get called.
      // This can happen if the user declines to share their location.
      _timeoutID = window.setTimeout(error, GEOLOCATE_TIMEOUT);

      context.container().call(_uiModal);  // block UI
      navigator.geolocation.getCurrentPosition(success, error, GEOLOCATE_OPTIONS);

    } else {   // stop geolocating
      _enabled = false;
      _layer.geolocationData = null;
      map.deferredRedraw();
      finish();
    }
  }


  function success(result) {
    if (_enabled) {    // user may have disabled it before the callback fires

      const coords = result.coords;
      const extent = new Extent([coords.longitude, coords.latitude]).padByMeters(coords.accuracy);
      _layer.geolocationData = result;
      map.deferredRedraw();

      // If `_timeoutID` has a value, this is the first successful result we've received.
      // Recenter the map and clear the timeout.
      if (_timeoutID) {
        window.clearTimeout(_timeoutID);
        _timeoutID = undefined;
        map.centerZoomEase(extent.center(), Math.min(20, map.extentZoom(extent)));
      }

      // keep geolocating until user turns the feature off
      window.setTimeout(() => {
        navigator.geolocation.getCurrentPosition(success, error, GEOLOCATE_OPTIONS);
      }, GEOLOCATE_REPEAT);
    }
    finish();
  }


  function error() {
    if (_enabled) {    // user may have disabled it before the callback fires
      ui.flash
        .label(l10n.tHtml('geolocate.location_unavailable'))
        .iconName('#rapid-icon-geolocate')();
    }

    _enabled = false;
    _layer.geolocationData = null;
    map.deferredRedraw();
    finish();
  }


  function finish() {
    if (_timeoutID) {
      window.clearTimeout(_timeoutID);
      _timeoutID = undefined;
    }

    _uiModal.close();  // unblock UI
    _button.classed('active', _enabled);
  }


  return function(selection) {
    if (!navigator.geolocation || !navigator.geolocation.getCurrentPosition) return;

    const isRTL = l10n.isRTL();

    _button = selection
      .append('button')
      .attr('class', 'geolocate')
      .on('click', click)
      .call(uiIcon('#rapid-icon-geolocate', 'light'))
      .call(uiTooltip(context)
        .placement(isRTL ? 'right' : 'left')
        .title(l10n.t('geolocate.title'))
      );
  };
}
