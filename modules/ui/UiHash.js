import { select as d3_select } from 'd3-selection';
import { geoSphericalDistance } from '@id-sdk/math';
import { utilArrayIdentical, utilObjectOmit, utilQsString, utilStringQs } from '@id-sdk/util';
import throttle from 'lodash-es/throttle';

import { t } from '../core/localizer';
import { modeSelect } from '../modes/select';
import { utilDisplayLabel } from '../util';

const MAXLAT = 90 - 1e-8;   // allowable latitude range


/**
 * `UiHash` binds to the hashchange event and
 *  updates the `window.location.hash` and document title
 *
 * Properties you can access:
 *   `doUpdateTitle`  `true` if we should update the document title, `false` if not (default `true`)
 *   `titleBase`    The document title to use (default `Rapid`)
 */
export class UiHash {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    this.context = context;
    this.id = 'hash';

    this.doUpdateTitle = true;
    this.titleBase = 'Rapid';
    this._cachedHash = null;   // cached window.location.hash

    const initialID = context.initialHashParams.id;
    const initialMap = context.initialHashParams.map;
    if (initialID) {
      context.zoomToEntity(initialID.split(',')[0], !initialMap);
    }

    // Make sure the event handlers have `this` bound correctly
    this._hashchange = this._hashchange.bind(this);
    this._updateAll = this._updateAll.bind(this);
    this._updateHash = this._updateHash.bind(this);
    this._updateTitle = this._updateTitle.bind(this);

    this._throttledUpdateAll = throttle(this._updateAll, 500);
    this._throttledUpdateHash = throttle(this._updateHash, 500);
    this._throttledUpdateTitle = throttle(this._updateTitle, 500);
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

    context.on('enter.UiHash', this._throttledUpdateAll);
    context.map().on('draw', this._throttledUpdateHash);
    context.history().on('change.UiHash', this._throttledUpdateTitle);
    d3_select(window).on('hashchange.UiHash', this._hashchange);

    this._hashchange();
    this._updateTitle();
  }


  /**
   * disable
   * Unbind event handlers
   */
  disable() {
    if (!this._enabled) return;
    this._enabled = false;

    this._cachedHash = null;
    this._throttledUpdateAll.cancel();
    this._throttledUpdateHash.cancel();
    this._throttledUpdateTitle.cancel();

    const context = this.context;

    context.on('enter.UiHash', null);
    context.map().off('draw', this._throttledUpdateHash);
    context.history().on('change.UiHash', null);
    d3_select(window).on('hashchange.UiHash', null);

    window.location.hash = '';
  }


  /**
   * _updateAll
   * Updates hash and title
   */
  _updateAll() {
    this._updateHash();
    this._updateTitle();
  }


  /**
   * _updateHash
   * Updates the hash (by calling `window.history.replaceState()`)
   * This updates the URL hash without affecting the browser navigation stack.
   */
  _updateHash() {
    if (this.context.inIntro()) return;   // no updates while doing the walkthrough

    const hash = this._computeHash();
    if (this._cachedHash !== hash) {
      window.history.replaceState(null, this.titleBase, hash);
      this._cachedHash = hash;
    }
  }


  /**
   * _updateTitle
   * Updates the title of the tab (by setting `document.title`)
   */
  _updateTitle() {
    if (this.context.inIntro()) return;   // no updates while doing the walkthrough
    if (!this.doUpdateTitle) return;

    const title = this._computeTitle();
    if (document.title !== title) {
      document.title = title;
    }
  }


  /**
   * _computeHash
   * Returns the value we think the hash should be, but doesn't change anything
   */
  _computeHash() {
    const context = this.context;
    const map = context.map();
    const [lng, lat] = map.center();
    const zoom = map.zoom();
    const precision = Math.max(0, Math.ceil(Math.log(zoom) / Math.LN2));

    let params = utilObjectOmit(
      utilStringQs(window.location.hash),
      ['id', 'map', 'comment', 'source', 'hashtags', 'walkthrough']
    );

    // Currently only support OSM ids
    const selectedIDs = context.selectedIDs().filter(id => context.hasEntity(id));
    if (selectedIDs.length) {
      params.id = selectedIDs.join(',');
    }

    params.map = zoom.toFixed(2) +
      '/' + lat.toFixed(precision) +
      '/' + lng.toFixed(precision);

    return '#' + utilQsString(params, true);
  }


  /**
   * _computeTitle
   * Returns the value we think the title should be, but doesn't change anything
   */
  _computeTitle() {
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

    if (format) {
      return t(format, { changes: changeCount, base: this.titleBase, context: selected });
    } else {
      return this.titleBase;
    }
  }


  /**
   * _hashchange
   * Called when enabling the hash behavior and whenever
   * the user tries changing the hash in the browser url manually
   */
  _hashchange() {
    const context = this.context;
    if (window.location.hash === this._cachedHash) return;   // nothing changed

    this._cachedHash = window.location.hash;

    const params = utilStringQs(this._cachedHash);
    const mapArgs = (params.map || '').split('/').map(Number);   // zoom/lat/lon

    if (mapArgs.length < 3 || mapArgs.some(isNaN)) {  // replace bogus hash
      this._updateHash();

    } else {
      const hash = this._computeHash();
      if (this._cachedHash === hash) return;  // nothing changed

      const mode = context.mode();
      context.map().centerZoom([mapArgs[2], Math.min(MAXLAT, Math.max(-MAXLAT, mapArgs[1]))], mapArgs[0]);

      if (params.id && mode) {
        // Currently only support OSM ids
        const ids = params.id.split(',').filter(id => context.hasEntity(id));
        if (ids.length && (mode.id === 'browse' || (mode.id === 'select' && !utilArrayIdentical(mode.selectedIDs(), ids)))) {
          context.enter(modeSelect(context, ids));
          return;
        }
      }

      // Don't allow the hash location to change too much while drawing
      // This can happen if the user accidentally hit the back button.  #3996
      const center = context.map().center();
      const dist = geoSphericalDistance(center, [mapArgs[2], mapArgs[1]]);
      const MAXDIST = 500;

      if (mode && mode.id.match(/^draw/) !== null && dist > MAXDIST) {
        context.enter('browse');
        return;
      }
    }
  }

}

