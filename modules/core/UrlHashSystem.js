import { utilObjectOmit, utilQsString, utilStringQs } from '@rapid-sdk/util';
import throttle from 'lodash-es/throttle.js';

import { AbstractSystem } from './AbstractSystem.js';


/**
 * `UrlHashSystem` is responsible for managing the url hash and query parameters.
 * It updates the `window.location.hash` and document title
 * It also binds to the hashchange event and responds to changes made by the user directly to the url
 *
 * Supports `pause()` / `resume()` - when paused, url hash will not emit events or do anything
 *
 * Properties you can access:
 *   `initialHashParams`  Map(string -> string) containing the initial query params (e.g. `background=Bing` etc)
 *   `doUpdateTitle`     `true` if we should update the document title, `false` if not (default `true`)
 *   `titleBase`         The document title to use (default `Rapid`)
 *
 * Events available:
 *   `hashchange`   Fires on hashchange and when enable is called, receives Map(currParams), Map(prevParams)
 */
export class UrlHashSystem extends AbstractSystem {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'urlhash';
    this.dependencies = new Set(['editor', 'l10n', 'map']);

    this.doUpdateTitle = true;
    this.titleBase = 'Rapid';

/**
* Initial only
* __`comment`__ - Prefills the changeset comment. Pass a url encoded string.
* __`hashtags`__ - Prefills the changeset hashtags.  Pass a url encoded list of event
* __`locale`__ - A code specifying the localization to use, affecting the language, layout, and keyboard shortcuts. Multiple codes may be specified in order of preference. The first valid code will be the locale, while the rest will be used as fallbacks if certain text hasn't been translated. The default locale preferences are set by the browser.
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
* __`data`__ - A custom data URL for loading a gpx track, vector data source, [WKT](https://en.wikipedia.org/wiki/Well-known_text_representation_of_geometry) POLYGON or MULTIPOLYGON text string to render as custom data.
* __`gpx`__ - Same as `data`, it's just the legacy name for the same thing
* __`datasets`__ - A comma-separated list of Rapid/Esri datasetIDs to enable
* __`disable_features`__ - Disables features in the list.
* __`overlays`__ - A comma-separated list of imagery sourceIDs to display as overlays
* __`photo`__ - The layerID and photoID of a photo to select, e.g `photo=mapillary/fztgSDtLpa08ohPZFZjeRQ`
* __`photo_overlay`__ - The street-level photo overlay layers to enable.
* __`photo_dates`__ - The range of capture dates by which to filter street-level photos. Dates are given in YYYY-MM-DD format and separated by `_`. One-sided ranges are supported.
* __`photo_username`__ - The Mapillary or KartaView username by which to filter street-level photos. Multiple comma-separated usernames are supported.
* __`poweruser=true`__ - True to enable poweruser features, false to hide poweruser features
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
    this._currHash = null;   // cached window.location.hash
    this._prevParams = null;
    this._startPromise = null;

    // Make sure the event handlers have `this` bound correctly
    this._hashchange = this._hashchange.bind(this);
    this._updateHash = this._updateHash.bind(this);
    this._updateTitle = this._updateTitle.bind(this);

    // `leading: false` means that we wait a bit for more updates to sneak in.
    this.deferredUpdateHash = throttle(this._updateHash, 500, { leading: false });
    this.deferredUpdateTitle = throttle(this._updateTitle, 500, { leading: false });
  }


  /**
   * initAsync
   * Called after all core objects have been constructed.
   * @return {Promise} Promise resolved when this component has completed initialization
   */
  initAsync() {
    for (const id of this.dependencies) {
      if (!this.context.systems[id]) {
        return Promise.reject(`Cannot init:  ${this.id} requires ${id}`);
      }
    }
    return Promise.resolve();
  }


  /**
   * startAsync
   * Called after all core objects have been initialized.
   * @return {Promise} Promise resolved when this component has completed startup
   */
  startAsync() {
    if (this._startPromise) return this._startPromise;

    const context = this.context;
    const editor = context.systems.editor;
    const l10n = context.systems.l10n;

    const prerequisites = Promise.all([
      l10n.startAsync(),
      editor.startAsync()
    ]);

    return this._startPromise = prerequisites
      .then(() => {
        // Register event handlers here
        editor.on('stablechange', this.deferredUpdateTitle);
        context.on('modechange', this.deferredUpdateTitle);
        window.addEventListener('hashchange', this._hashchange);

        this._started = true;
        this.resume();
      });
  }


  /**
   * resetAsync
   * Called after completing an edit session to reset any internal state
   * @return {Promise} Promise resolved when this component has completed resetting
   */
  resetAsync() {
    return Promise.resolve();
  }


  /**
   * pause
   * Pauses this system
   * When paused, the UrlHashSystem will not respond to changes or emit events.
   */
  pause() {
    this._paused = true;
    this._currHash = null;
    this.deferredUpdateHash.cancel();
    this.deferredUpdateTitle.cancel();
  }


  /**
   * resume
   * Resumes (unpauses) this system.
   * When paused, the UrlHashSystem will not respond to changes or emit events.
   * Calling `resume()` updates the hash and title, and will emit a `hashchange` event.
   */
  resume() {
    this._paused = false;
    this._currHash = null;

    this._updateHash();   // make sure hash matches the _currParams
    this._hashchange();   // emit 'hashchange' so other code knows what the hash contains
    this._updateTitle();
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
    if (typeof k !== 'string') return;

    if (v === undefined || v === null || v === 'undefined' || v === 'null') {
      this._currParams.delete(k);
    } else {
      this._currParams.set(k, v);
    }

    if (this._started && !this._paused) {
      this.deferredUpdateHash();
    }
  }


  /**
   * _updateHash
   * Updates the hash (by calling `window.history.replaceState()`) to match _currParams;
   * This updates the URL hash without affecting the browser navigation stack.
   */
  _updateHash() {
    if (!this._started || this._paused) return;

    // Remove some of the initial-only params that only clutter up the hash
    const toOmit = ['comment', 'source', 'hashtags', 'walkthrough'];
    let params = utilObjectOmit(Object.fromEntries(this._currParams), toOmit);

    const newHash = '#' + utilQsString(params, true);
    if (newHash !== this._currHash) {
      window.history.replaceState(null, this.titleBase, newHash);
      this._currHash = newHash;
    }
  }


  /**
   * _updateTitle
   * Updates the title of the tab (by setting `document.title`)
   */
  _updateTitle() {
    if (!this._started || this._paused) return;
    if (!this.doUpdateTitle) return;

    const context = this.context;
    const editor = context.systems.editor;
    const graph = editor.staging.graph;
    const l10n = context.systems.l10n;
    const changeCount = editor.difference().summary().size;

    // Currently only support OSM ids
    let selected;
    const selectedIDs = context.selectedIDs().filter(id => graph.hasEntity(id));
    if (selectedIDs.length) {
      const firstLabel = l10n.displayLabel(graph.entity(selectedIDs[0]), graph);
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
      title = l10n.t(format, { changes: changeCount, base: this.titleBase, context: selected });
    } else {
      title = this.titleBase;
    }

    if (document.title !== title) {
      document.title = title;
    }
  }


  /**
   * _hashchange
   * Called on hashchange event (user changes url manually), and when enabling the hash behavior
   * Receiving code will receive copies of both the current and previous parameters.
   */
  _hashchange() {
    if (!this._started || this._paused) return;

    this._currHash = window.location.hash;
    const q = utilStringQs(this._currHash);

    if (!this._prevParams) {         // We haven't emitted `hashchange` yet
      this._prevParams = new Map();  // set previous to empty Map, so everything looks new
    } else {
      this._prevParams = this._currParams;   // copy current -> previous
    }

    this._currParams = new Map(Object.entries(q));

    this.emit('hashchange', new Map(this._currParams), new Map(this._prevParams));  // emit copies
  }
}
