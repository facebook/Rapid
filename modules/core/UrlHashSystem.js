import { utilArrayIdentical, utilObjectOmit, utilQsString, utilStringQs } from '@rapid-sdk/util';
import throttle from 'lodash-es/throttle';

import { AbstractSystem } from './AbstractSystem';
import { modeSelect } from '../modes/select';


/**
 * `UrlHashSystem` is responsible for managing the url hash and query parameters.
 * It updates the `window.location.hash` and document title
 * It also binds to the hashchange event and responds to changes made by the user directly to the url
 *
 * Properties you can access:
 *   `initialHashParams`  Map(string -> string) containing the initial query params (e.g. `background=Bing` etc)
 *   `doUpdateTitle`     `true` if we should update the document title, `false` if not (default `true`)
 *   `titleBase`         The document title to use (default `Rapid`)
 *
 * Events available:
 *   `hashchange`     Fires on hashchange and when enable is called, receives an Object with the current hash params
 */
export class UrlHashSystem extends AbstractSystem {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'urlhash';

    this.doUpdateTitle = true;
    this.titleBase = 'Rapid';

/**
* Initial only
* __`comment`__ - Prefills the changeset comment. Pass a url encoded string.
* __`gpx`__ - A custom URL for loading a gpx track.  Specifying a `gpx` parameter will
* __`hashtags`__ - Prefills the changeset hashtags.  Pass a url encoded list of event
* __`locale`__ - A code specifying the localization to use, affecting the language, layout, and keyboard shortcuts. Multiple codes may be specified in order of preference. The first valid code will be the locale, while the rest will be used as fallbacks if certain text hasn't been translated. The default locale preferences are set by the browser.
* __`poweruser=true`__
* __`presets`__ - A comma-separated list of preset IDs. These will be the only presets the user may select.
* __`rtl=true`__ - Force Rapid into right-to-left mode (useful for testing).
* __`source`__ - Prefills the changeset source. Pass a url encoded string.
* __`validationDisable`__ - The issues identified by these types/subtypes will be disabled (i.e. Issues will not be shown at all). Each parameter value should contain a urlencoded, comma-separated list of type/subtype match rules.  An asterisk `*` may be used as a wildcard.
* __`validationWarning`__ - The issues identified by these types/subtypes will be treated as warnings (i.e. Issues will be surfaced to the user but not block changeset upload). Each parameter value should contain a urlencoded, comma-separated list of type/subtype match rules.  An asterisk `*` may be used as a wildcard.
* __`validationError`__ - The issues identified by these types/subtypes will be treated as errors (i.e. Issues will be surfaced to the user but will block changeset upload). Each parameter value should contain a urlencoded, comma-separated list of type/subtype match rules.  An asterisk `*` may be used as a wildcard.
* __`walkthrough=true`__
*
* Responsive (user can change)
* __`background`__ - Imagery sourceID for the background imagery layer
* __`datasets`__ - A comma-separated list of datasetIDs to enable
* __`disable_features`__ - Disables features in the list.
* __`overlays`__ - A comma-separated list of imagery sourceIDs to display as overlays
* __`photo`__ - The layerID and photoID of a photo to select, e.g `photo=mapillary/fztgSDtLpa08ohPZFZjeRQ`
* __`photo_overlay`__ - The street-level photo overlay layers to enable.
* __`photo_dates`__ - The range of capture dates by which to filter street-level photos. Dates are given in YYYY-MM-DD format and separated by `_`. One-sided ranges are supported.
* __`photo_username`__ - The Mapillary or KartaView username by which to filter street-level photos. Multiple comma-separated usernames are supported.
* __`id`__ - An OSM ID to select.
* __`map`__ - A slash-separated `zoom/lat/lon/rot`.
* __`offset`__ - Background imagery alignment offset in meters, formatted as `east,north`.
**/

    const q = utilStringQs(window.location.hash);
    this._initParams = new Map(Object.entries(q));

    // Set some defaults (maybe come up with a less hacky way of doing this)
    if (!this._initParams.has('datasets')) {
      this._initParams.set('datasets', 'fbRoads,msBuildings');
    }
    if (!this._initParams.has('disable_features')) {
      this._initParams.set('disable_features', 'boundaries');
    }

    this._currParams = new Map(this._initParams);  // make copy

    this._prevHash = null;   // cached window.location.hash

    // Make sure the event handlers have `this` bound correctly
    this.setParam = this.setParam.bind(this);
    this.parseHash = this.parseHash.bind(this);
    this.updateAll = this.updateAll.bind(this);
    this.updateHash = this.updateHash.bind(this);
    this.updateTitle = this.updateTitle.bind(this);

    // `leading: false` means that we wait a bit for more updates to sneak in.
    this.deferredUpdateAll = throttle(this.updateAll, 500, { leading: false });
    this.deferredUpdateHash = throttle(this.updateHash, 500, { leading: false });
    this.deferredUpdateTitle = throttle(this.updateTitle, 500, { leading: false });
  }


  /**
   * init
   * Called one time after all core objects have been instantiated.
   */
  init() {
    // If the hash started out with a selected id, try to load it
    const initialID = this._initParams.get('id');
    const hasMapParam = this._initParams.has('map');
    if (initialID) {
      this.context.zoomToEntity(initialID.split(',')[0], !hasMapParam);
    }

// warning, parsing hash and dispatching a hashchange will trigger things that need to
// happen after the first render
// for now this init() gets delayed until after ui/init, see context.js
    this.enable();
  }


  /**
   * enable
   * Bind event handlers
   */
  enable() {
    if (this._enabled) return;
    this._enabled = true;

    this._prevHash = null;

    this.context.editSystem().on('change', this.deferredUpdateTitle);
    this.context.on('modechange', this.deferredUpdateAll);
    window.addEventListener('hashchange', this.parseHash);

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

    this._prevHash = null;
    this.deferredUpdateAll.cancel();
    this.deferredUpdateHash.cancel();
    this.deferredUpdateTitle.cancel();

    this.context.editSystem().off('change', this.deferredUpdateTitle);
    this.context.off('modechange', this.deferredUpdateAll);
    window.removeEventListener('hashchange', this.parseHash);
  }


  /**
   * initialHashParams
   * Get the initial hash parameters  (was: `context.initialHashParams`)
   * @readonly
   */
  get initialHashParams() {
    return this._initParams;
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

    const context = this.context;
    const toOmit = ['id', 'comment', 'source', 'hashtags', 'walkthrough'];
    let params = utilObjectOmit(Object.fromEntries(this._currParams), toOmit);

    // update id  (this shouldn't be here, move to modeSelect?)
    const selectedIDs = context.selectedIDs().filter(id => context.hasEntity(id));
    if (selectedIDs.length) {
      params.id = selectedIDs.join(',');
    }

    const currHash = '#' + utilQsString(params, true);
    if (currHash !== this._prevHash) {
      window.history.replaceState(null, this.titleBase, currHash);
      this._prevHash = currHash;
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
    const l10n = context.localizationSystem();
    const editSystem = context.editSystem();
    const changeCount = editSystem.difference().summary().size;

    // Currently only support OSM ids
    let selected;
    const selectedIDs = context.selectedIDs().filter(id => context.hasEntity(id));
    if (selectedIDs.length) {
      const firstLabel = l10n.displayLabel(context.entity(selectedIDs[0]), context.graph());
      if (selectedIDs.length > 1) {
        selected = l10n.t('title.labeled_and_more', { labeled: firstLabel, count: selectedIDs.length - 1 });
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
      title = context.t(format, { changes: changeCount, base: this.titleBase, context: selected });
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
    if (!this._enabled) return;

    if (window.location.hash === this._prevHash) return;   // nothing changed
    this._prevHash = window.location.hash;

    const q = utilStringQs(this._prevHash);

    // id (currently only support OSM ids)
    const context = this.context;
    if (typeof q.id === 'string') {
      const ids = q.id.split(',').filter(id => context.hasEntity(id));
      const mode = context.mode();
      if (ids.length && (mode?.id === 'browse' || (mode?.id === 'select' && !utilArrayIdentical(mode.selectedIDs(), ids)))) {
        context.enter(modeSelect(context, ids));
      }
    }

    this.emit('hashchange', q);
  }
}
