import { selection } from 'd3-selection';
import { Extent } from '@rapid-sdk/math';

import { uiIcon } from '../icon.js';
import { uiLoading } from '../loading.js';
import { uiTooltip } from '../tooltip.js';

const GEOLOCATE_TIMEOUT = 10000;  // 10 sec
const GEOLOCATE_REPEAT = 2000;    // 2 sec
const GEOLOCATE_OPTIONS = {
  enableHighAccuracy: false,   // prioritize speed and power usage over precision
  timeout: 6000   // 6sec      // don't hang indefinitely getting the location
};


/**
 * UiGeolocateControl
 */
export class UiGeolocateControl {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    this.context = context;

    this._isSupported = (typeof navigator?.geolocation?.getCurrentPosition === 'function');
    this._isActive = false;
    this._timeoutID = null;

    // Create child components
    this.Tooltip = uiTooltip(context);
    this.Loading = uiLoading(context).blocking(true);

    // D3 selections
    this.$parent = null;
    this.$button = null;

    // Ensure methods used as callbacks always have `this` bound correctly.
    // (This is also necessary when using `d3-selection.call`)
    this.block = this.block.bind(this);
    this.error = this.error.bind(this);
    this.render = this.render.bind(this);
    this.start = this.start.bind(this);
    this.stop = this.stop.bind(this);
    this.success = this.success.bind(this);
    this.toggle = this.toggle.bind(this);
    this.unblock = this.unblock.bind(this);
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

    if (!this._isSupported) return;   // no button

    const context = this.context;
    const l10n = context.systems.l10n;

    let $button = $parent.selectAll('button.bearing')
      .data([0]);

    // enter
    const $$button = $button.enter()
      .append('button')
      .attr('class', 'geolocate')
      .on('click', this.toggle)
      .call(this.Tooltip)
      .call(uiIcon('#rapid-icon-geolocate', 'light'));

    // update
    this.$button = $button = $button.merge($$button);

    this.$button
      .classed('active', this._isActive);

    // Update localization
    this.Tooltip
      .placement(l10n.isRTL() ? 'right' : 'left')
      .title(l10n.t('geolocate.title'));

    this.Loading
      .message(l10n.t('geolocate.locating'));
  }


  /**
   * toggle
   * @param  {Event}  e? - the triggering event, if any (keypress or click)
   */
  toggle(e) {
    if (e)  e.preventDefault();
    if (!this._isSupported) return;
    if (this.context.inIntro) return;

    if (!this._isActive) {
      this.start(e);
    } else {
      this.stop(e);
    }
  }


  /**
   * start
   * Start geolocating - enable the button, block the UI, and initiate a geolocate request.
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/getCurrentPosition
   * @param  {Event}  e? - the triggering event, if any (keypress or click)
   */
  start(e) {
    if (e)  e.preventDefault();
    if (!this._isSupported) return;
    if (this.context.inIntro) return;
    if (this._isActive) return;    // already started

    this._isActive = true;

    if (this.$button) {
      this.$button.classed('active', true);
    }

    this.context.enter('browse');
    this.block();
    navigator.geolocation.getCurrentPosition(this.success, this.error, GEOLOCATE_OPTIONS);
  }


  /**
   * stop
   * Stop geolocating - disable the button and remove any saved data
   * @param  {Event}  e? - the triggering event, if any (keypress or click)
   */
  stop(e) {
    if (e)  e.preventDefault();
    if (!this._isActive) return;    // already stopped

    const context = this.context;
    const gfx = context.systems.gfx;
    const layer = gfx.scene.layers.get('map-ui');

    this._isActive = false;

    if (this.$button) {
      this.$button.classed('active', false);
    }

    this.unblock();
    layer.geolocationData = null;
    gfx.deferredRedraw();
  }


  /**
   * success
   * Callback called with a successful geolocation result.
   * This will continue the requests every few seconds until the user stops it.
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/getCurrentPosition
   * @see https://developer.mozilla.org/en-US/docs/Web/API/GeolocationPosition
   * @param  {GeolocationPosition}  result
   */
  success(result) {
    const context = this.context;
    const gfx = context.systems.gfx;
    const map = context.systems.map;
    const layer = gfx.scene.layers.get('map-ui');

    if (this._isActive) {   // User may have disabled it before the callback fires..
      const coords = result.coords;
      const extent = new Extent([coords.longitude, coords.latitude]).padByMeters(coords.accuracy);
      layer.geolocationData = result;
      gfx.deferredRedraw();

      // If `_timeoutID` has a value, this is the first successful result we've received.
      // Recenter the map and clear the timeout.
      if (this._timeoutID) {
        window.clearTimeout(this._timeoutID);
        this._timeoutID = null;
        map.centerZoomEase(extent.center(), Math.min(20, map.extentZoom(extent)));
      }

      // Keep geolocating until user turns the feature off..
      window.setTimeout(() => {
        navigator.geolocation.getCurrentPosition(this.success, this.error, GEOLOCATE_OPTIONS);
      }, GEOLOCATE_REPEAT);
    }

    this.unblock();
  }


  /**
   * error
   * Callback called when geolocation request either fails or times out.
   */
  error() {
    const context = this.context;
    const l10n = context.systems.l10n;
    const ui = context.systems.ui;

    if (this._isActive) {    // user may have disabled it before the callback fires
      ui.Flash
        .label(l10n.t('geolocate.location_unavailable'))
        .iconName('#rapid-icon-geolocate')();
    }

    this.stop();
  }


  /**
   * block
   * This blocks the UI, only initially when the user first requests geolocation.
   */
  block() {
    // The timeout ensures that we complete even if the success/error callbacks never get called.
    // This can happen if the user declines to share their location.
    this._timeoutID = window.setTimeout(this.error, GEOLOCATE_TIMEOUT);

    this.context.container().call(this.Loading);  // Block UI
  }


  /**
   * unblock
   * This unblocks the UI, after the initial request either completed or timed out.
   */
  unblock() {
    if (this._timeoutID) {
      window.clearTimeout(this._timeoutID);
      this._timeoutID = null;
    }

    this.Loading.close();  // Unblock UI
  }

}
