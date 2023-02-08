import { select as d3_select } from 'd3-selection';
import { geoSphericalDistance, geoMetersToOffset, geoOffsetToMeters } from '@id-sdk/math';
import { utilArrayIdentical, utilObjectOmit, utilQsString, utilStringQs } from '@id-sdk/util';
import throttle from 'lodash-es/throttle';

import { t } from '../core/localizer';
import { modeSelect } from '../modes/select';
import { utilDisplayLabel } from '../util';

const MAXLAT = 90 - 1e-8;   // allowable latitude range


/**
 * `UrlHash` is responsible for managing the url hash and query parameters.
 * It updates the `window.location.hash` and document title
 * It also binds to the hashchange event and responds to changes made by the user directly to the url
 *
 * Properties you can access:
 *   `params`         Map(string -> string) containing the current query params (e.g. `background=Bing` etc)
 *   `doUpdateTitle`  `true` if we should update the document title, `false` if not (default `true`)
 *   `titleBase`      The document title to use (default `Rapid`)
 */
export class UrlHash {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    this.context = context;

    this.doUpdateTitle = true;
    this.titleBase = 'Rapid';

/**
Initial only
* __`comment`__ - Prefills the changeset comment. Pass a url encoded string.<br/>
* __`disable_features`__ - Disables features in the list.<br/>
* __`gpx`__ - A custom URL for loading a gpx track.  Specifying a `gpx` parameter will
* __`hashtags`__ - Prefills the changeset hashtags.  Pass a url encoded list of event
* __`locale`__ - A code specifying the localization to use, affecting the language, layout, and keyboard shortcuts. Multiple codes may be specified in order of preference. The first valid code will be the locale, while the rest will be used as fallbacks if certain text hasn't been translated. The default locale preferences are set by the browser.<br/>
* __`photo_overlay`__ - The street-level photo overlay layers to enable.<br/>
* __`photo_dates`__ - The range of capture dates by which to filter street-level photos. Dates are given in YYYY-MM-DD format and separated by `_`. One-sided ranges are supported.<br/>
* __`photo_username`__ - The Mapillary or KartaView username by which to filter street-level photos. Multiple comma-separated usernames are supported.<br/>
* __`photo`__ - The service and ID of the street-level photo to show.<br/>
* __`poweruser=true`__
* __`presets`__ - A comma-separated list of preset IDs. These will be the only presets the user may select.<br/>
* __`rtl=true`__ - Force iD into right-to-left mode (useful for testing).
* __`source`__ - Prefills the changeset source. Pass a url encoded string.<br/>
* __`validationDisable`__ - The issues identified by these types/subtypes will be disabled (i.e. Issues will not be shown at all). Each parameter value should contain a urlencoded, comma-separated list of type/subtype match rules.  An asterisk `*` may be used as a wildcard.<br/>
* __`validationWarning`__ - The issues identified by these types/subtypes will be treated as warnings (i.e. Issues will be surfaced to the user but not block changeset upload). Each parameter value should contain a urlencoded, comma-separated list of type/subtype match rules.  An asterisk `*` may be used as a wildcard.<br/>
* __`validationError`__ - The issues identified by these types/subtypes will be treated as errors (i.e. Issues will be surfaced to the user but will block changeset upload). Each parameter value should contain a urlencoded, comma-separated list of type/subtype match rules.  An asterisk `*` may be used as a wildcard.<br/>
* __`walkthrough=true`__

Responsive (user can change)
* __`background`__ - The value of the `id` property of the source in iD's
* __`datasets`__ - A comma-separated list of dataset IDs to enable<br/>
* __`id`__ - The character 'n', 'w', or 'r', followed by the OSM ID of a node, way or relation, respectively. Selects the specified entity, and, unless a `map` parameter is also provided, centers the map on it.<br/>
* __`map`__ - A slash-separated `zoom/latitude/longitude`.<br/>
* __`offset`__ - Background imagery alignment offset in meters, formatted as `east,north`.<br/>
**/

    const q = utilStringQs(window.location.hash)
    this._initParams = new Map(Object.entries(q));
    this._prevParams = new Map(this._initParams);  // make copy
    this._currParams = new Map(this._initParams);  // make copy

    this._cachedHash = null;   // cached window.location.hash

    // If the hash started out with a selected id, try to load it
    const initialID = this._initParams.get(id);
    const initialMap = this._initParams.get(map);
    if (initialID) {
      context.zoomToEntity(initialID.split(',')[0], !initialMap);
    }

    // Make sure the event handlers have `this` bound correctly
    this.setParam = this.setParam.bind(this);
    this.setMapParams = this.setMapParams.bind(this);
    this.setImageryParams = this.setImageryParams.bind(this);
    this.setPhotoParams = this.setPhotoParams.bind(this);

    this.parseHash = this.parseHash.bind(this);

    this.updateAll = this.updateAll.bind(this);
    this.updateHash = this.updateHash.bind(this);
    this.updateTitle = this.updateTitle.bind(this);

    this.deferredUpdateAll = throttle(this.updateAll, 500);
    this.deferredUpdateHash = throttle(this.updateHash, 500);
    this.deferredUpdateTitle = throttle(this.updateTitle, 500);
  }


  /**
   * enable
   * Bind event handlers
   */
  enable() {
    if (this._enabled) return;
    this._enabled = true;

    this._cachedHash = null;

    const context = this.context;
    context.map().on('draw', this.setMapParams);
    context.imagery().on('imagerychange', this.setImageryParams);
    context.photos().on('photochange', this.setPhotoParams);
    context.history().on('change.UrlHash', this.deferredUpdateTitle);
    context.on('enter.UrlHash', this.deferredUpdateAll);
    d3_select(window).on('hashchange.UrlHash', this.parseHash);

    this.parseHash();
    this.updateTitle();
  }


  /**
   * disable
   * Unbind event handlers
   */
  disable() {
    if (!this._enabled) return;
    this._enabled = false;

    this._cachedHash = null;
    this.deferredUpdateAll.cancel();
    this.deferredUpdateHash.cancel();
    this.deferredUpdateTitle.cancel();

    const context = this.context;
    context.map().off('draw', this.setMapParams);
    context.imagery().off('imagerychange', this.setImageryParams);
    context.photos().off('photochange', this.setPhotoParams);
    context.history().on('change.UrlHash', null);
    context.on('enter.UrlHash', null);
    d3_select(window).on('hashchange.UrlHash', null);
  }


  /**
   * getParam
   * @param  k  {String} The key to get
   * @return {String} The value to return, or `undefined`
   */
  getParam(k) {
    return this._currParams.get(k);
  }


  /**
   * setParam
   * Sets a `key=value` pair that will be added to the hash params.
   * Values passed as `undefined` or `null` will be deleted from the query params
   * Values passed as empty string '' will remain in the query params
   * @param  k  {String} The key to set
   * @param  v  {String} The value to set, pass `undefined` to delete the value
   */
  setParam(k, v) {
    if (!this._enabled) return;
    if (typeof k !== 'string') return;

    if (v === undefined || v === null || v === 'undefined' || v === 'null') {
      this._currParams.delete(k);
    } else {
      this._currParams.set(k, v);
    }
    this.deferredUpdateHash();
  }


  /**
   * setMapParams
   * Like setParam but specifically for the `map=zoom/lat/lon/rot` param
   */
  setMapParams() {
    if (!this._enabled) return;

    const map = this.context.map();
    const [lng, lat] = map.center();
    const zoom = map.zoom();
    const rot = 0;  // for now
    const precision = Math.max(0, Math.ceil(Math.log(zoom) / Math.LN2));
    const EPSILON = 0.01;

    if (isNaN(zoom) || !isFinite(zoom)) return;
    if (isNaN(lat) || !isFinite(lat))   return;
    if (isNaN(lon) || !isFinite(lon))   return;
    if (isNaN(rot) || !isFinite(rot))   return;

    const zoomStr = zoom.toFixed(2);
    const latStr = lat.toFixed(precision);
    const lonStr = lon.toFixed(precision);
    const rotStr = rot.toFixed(2);

    let v = `${zoomStr}/${latStr}/${lonStr}`;
    if (Math.abs(rot) > EPSILON !== 0) {
      v += `/${rotStr}`;
    }
    this.setParam('map', v);
  }


  /**
   * parseMapParams
   * @param  q   Object containing the query params
   */
  parseMapParams(q) {
    if (!this._enabled) return;
    if (typeof q.map !== 'string') return;

    let [zoom, lat, lon, rot] = q.map.split('/', 4).map(Number);

    if (isNaN(zoom) || !isFinite(zoom)) zoom = 2;
    if (isNaN(lat) || !isFinite(lat))   lat = 0;
    if (isNaN(lon) || !isFinite(lon))   lon = 0;
    if (isNaN(rot) || !isFinite(rot))   rot = 0;

    zoom = clamp(zoom, 2, 24);
    lat = clamp(lat, -90, 90);
    lon = clamp(lon, -180, 180);
    rot = clamp(rot, 0, 360);

    this.context.map().centerZoom([lon, lat], zoom);

    function clamp(num, min, max) {
      return Math.max(min, Math.min(num, max));
    }
  }


  /**
   * setImageryParams
   * Updates the parameters related to background imagery
   */
  setImageryParams() {
    if (!this._enabled) return;

    const imagery = this.context.imagery();

    // background
    const baseLayer = imagery.baseLayerSource();
    let baseID = baseLayer.id;
    if (baseID === 'custom') {
      baseID = `custom:${baseLayer.template}`;
    }
    this.setParam('background', baseID);

    // overlays
    const overlayLayers = imagery.overlayLayerSources();
    const overlayIDs = overlayLayers
      .filter(d => !d.isLocatorOverlay() && !d.isHidden())
      .map(d => d.id);
    this.setParam('overlays', overlayIDs.length ? overlayIDs.join(',') : null);

    // offset
    const meters = geoOffsetToMeters(baseLayer.offset);
    const EPSILON = 0.01;
    const x = +meters[0].toFixed(2);
    const y = +meters[1].toFixed(2);
    this.setParam('offset', (Math.abs(x) > EPSILON || Math.abs(y) > EPSILON) ? `${x},${y}` : null);
  }


  /**
   * parseImageryParams
   * @param  q   Object containing the query params
   */
  parseImageryParams(q) {
    if (!this._enabled) return;

    const imagery = this.context.imagery();

    // background
    const backgroundID = q.background;
    if (typeof backgroundID === 'string') {
      const baseLayer = imagery.findSource(backgroundID);
      if (baseLayer) {
        imagery.baseLayerSource(baseLayer);
      }
    }

    // overlays
    const overlayIDs = q.overlays;
    if (typeof overlayIDs === 'string') {
      const toEnableIDs = new Set(overlayIDs.split(','));

      for (const overlayLayer of imagery.overlayLayerSources()) {  // for each enabled overlay layer
        if (overlayLayer.isLocatorOverlay()) continue;
        if (toEnableIDs.has(overlayLayer.id)) continue;  // stay enabled
        imagery.toggleOverlayLayer(overlayLayer);        // make disabled
      }
    }

    // offset
    const offset = q.offset;
    if (typeof offset === 'string') {
      let [x, y] = offset.replace(/;/g, ',').split(',').map(Number);

      if (isNaN(x) || !isFinite(x))  x = 0;
      if (isNaN(y) || !isFinite(y))  y = 0;

      const EPSILON = 0.01;
      if (Math.abs(x) > EPSILON || Math.abs(y) > EPSILON) {
        imagery.offset = geoMetersToOffset([x, y]);
      }
    }
  }


  /**
   * setPhotoParams
   * Updates the parameters related to streetview imagery
   */
  setPhotoParams() {
    if (!this._enabled) return;

    const photos = this.context.photos();
    // todo later
  }


  /**
   * parsePhotoParams
   * @param  q   Object containing the query params
   */
  parsePhotoParams(q) {
    if (!this._enabled) return;
    // todo later
  }


  /**
   * updateAll
   * Updates hash and title
   */
  updateAll() {
    this.updateHash();
    this.updateTitle();
  }


  /**
   * updateHash
   * Updates the hash (by calling `window.history.replaceState()`)
   * This updates the URL hash without affecting the browser navigation stack.
   */
  updateHash() {
    if (!this._enabled) return;

    const toOmit = ['id', 'comment', 'source', 'hashtags', 'walkthrough'];
    let params = utilObjectOmit(Object.fromEntries(this._currParams), toOmit);

    // Currently only support OSM ids
    const selectedIDs = context.selectedIDs().filter(id => context.hasEntity(id));
    if (selectedIDs.length) {
      params.id = selectedIDs.join(',');
    }

    const hash = '#' + utilQsString(params, true);

    if (this._cachedHash !== hash) {
      window.history.replaceState(null, this.titleBase, hash);
      this._cachedHash = hash;
    }
  }


  /**
   * updateTitle
   * Updates the title of the tab (by setting `document.title`)
   */
  updateTitle() {
    if (!this._enabled) return;
    if (!this.doUpdateTitle) return;

    const context = this.context;
    const changeCount = context.history().difference().summary().size;

    // Currently only support OSM ids
    let selected;
    const selectedIDs = context.selectedIDs().filter(id => context.hasEntity(id));
    if (selectedIDs.length) {
      const firstLabel = utilDisplayLabel(context.entity(selectedIDs[0]), context.graph());
      if (selectedIDs.length > 1) {
        selected = t('title.labeled_and_more', { labeled: firstLabel, count: selectedIDs.length - 1 });
      } else {
        selected = firstLabel;
      }
    }

    let format;
    if (changeCount && selected) {
      format = 'title.format.changes_context';
    } else if (changeCount && !selected) {
      format = 'title.format.changes';
    } else if (!changeCount && selected) {
      format = 'title.format.context';
    }

    let title;
    if (format) {
      title = t(format, { changes: changeCount, base: this.titleBase, context: selected });
    } else {
      title = this.titleBase;
    }

    if (document.title !== title) {
      document.title = title;
    }
  }


  /**
   * parseHash
   * Called on hashchange event (user changes url manually), and when enabling the hash behavior
   */
  parseHash() {
   if (window.location.hash === this._cachedHash) return;   // nothing changed
   this._cachedHash = window.location.hash;

   const q = utilStringQs(this._cachedHash);
   this.parseMapParams(q);
   this.parseImageryParams(q);
   this.parsePhotoParams(q);

//    const context = this.context;
//    const mapArgs = (params.map || '').split('/').map(Number);   // zoom/lat/lon
//
//    if (mapArgs.length < 3 || mapArgs.some(isNaN)) {  // replace bogus hash
//      this.updateHash();
//
//    } else {
//      const hash = this._computeHash();
//      if (this._cachedHash === hash) return;  // nothing changed
//
//      const mode = context.mode();
//      context.map().centerZoom([mapArgs[2], Math.min(MAXLAT, Math.max(-MAXLAT, mapArgs[1]))], mapArgs[0]);
//
//      if (params.id && mode) {
//        // Currently only support OSM ids
//        const ids = params.id.split(',').filter(id => context.hasEntity(id));
//        if (ids.length && (mode.id === 'browse' || (mode.id === 'select' && !utilArrayIdentical(mode.selectedIDs(), ids)))) {
//          context.enter(modeSelect(context, ids));
//          return;
//        }
//      }
//
  }

}

