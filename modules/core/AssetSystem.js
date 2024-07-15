import { AbstractSystem } from './AbstractSystem.js';
import { utilFetchResponse } from '../util/index.js';


/**
 * `AssetSystem` fetches data in JSON files.
 * This allows us to deploy Rapid in a way that the data it needs can be fetched at runtime.
 * It provides a method `getDataAsync` returning a Promise that resolves when the data is available.
 *
 * Properties available:
 *   `sources`   The sources contains all the detail about where to fetch assets from
 *   `origin`     'local' (all files fetched from dist) or 'latest' (newer files may be fetched from CDN)
 */
export class AssetSystem extends AbstractSystem {

  /**
   * @constructor
   * @param  `context`   Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'assets';
    this.dependencies = new Set();

    // Rapid's asset map contains all of the data files that we may need to load.
    // The data files are identified by keys, and are organized under the appropriate 'origin'
    this.sources = {
      local: {
        'address_formats': 'data/address_formats.min.json',
        'deprecated': 'https://cdn.jsdelivr.net/npm/@openstreetmap/id-tagging-schema@6.6/dist/deprecated.min.json',
        'discarded': 'https://cdn.jsdelivr.net/npm/@openstreetmap/id-tagging-schema@6.6/dist/discarded.min.json',
        'imagery': 'data/imagery.min.json',
        'intro_graph': 'data/intro_graph.min.json',
        'intro_rapid_graph': 'data/intro_rapid_graph.min.json',
        'languages': 'data/languages.min.json',
        'locales': 'data/locales.min.json',
        'nsi_data': 'https://cdn.jsdelivr.net/npm/name-suggestion-index@6.0/dist/nsi.min.json',
        'nsi_dissolved': 'https://cdn.jsdelivr.net/npm/name-suggestion-index@6.0/dist/dissolved.min.json',
        'nsi_features': 'https://cdn.jsdelivr.net/npm/name-suggestion-index@6.0/dist/featureCollection.min.json',
        'nsi_generics': 'https://cdn.jsdelivr.net/npm/name-suggestion-index@6.0/dist/genericWords.min.json',
        'nsi_presets': 'https://cdn.jsdelivr.net/npm/name-suggestion-index@6.0/dist/presets/nsi-id-presets.min.json',
        'nsi_replacements': 'https://cdn.jsdelivr.net/npm/name-suggestion-index@6.0/dist/replacements.min.json',
        'nsi_trees': 'https://cdn.jsdelivr.net/npm/name-suggestion-index@6.0/dist/trees.min.json',
        'oci_defaults': 'https://cdn.jsdelivr.net/npm/osm-community-index@5.7/dist/defaults.min.json',
        'oci_features': 'https://cdn.jsdelivr.net/npm/osm-community-index@5.7/dist/featureCollection.min.json',
        'oci_resources': 'https://cdn.jsdelivr.net/npm/osm-community-index@5.7/dist/resources.min.json',
        'phone_formats': 'data/phone_formats.min.json',
        'preset_categories': 'https://cdn.jsdelivr.net/npm/@openstreetmap/id-tagging-schema@6.6/dist/preset_categories.min.json',
        'preset_defaults': 'https://cdn.jsdelivr.net/npm/@openstreetmap/id-tagging-schema@6.6/dist/preset_defaults.min.json',
        'preset_fields': 'https://cdn.jsdelivr.net/npm/@openstreetmap/id-tagging-schema@6.6/dist/fields.min.json',
        'preset_presets': 'https://cdn.jsdelivr.net/npm/@openstreetmap/id-tagging-schema@6.6/dist/presets.min.json',
        'preset_overrides': 'data/preset_overrides.min.json',
        'qa_data': 'data/qa_data.min.json',
        'shortcuts': 'data/shortcuts.min.json',
        'territory_languages': 'data/territory_languages.min.json',
        'wayback': 'data/wayback.min.json',
        'wmf_sitematrix': 'https://cdn.jsdelivr.net/npm/wmf-sitematrix@0.1/wikipedia.min.json'
      },
      latest: {
        'address_formats': 'data/address_formats.min.json',
        'deprecated': 'https://cdn.jsdelivr.net/npm/@openstreetmap/id-tagging-schema@6.6/dist/deprecated.min.json',
        'discarded': 'https://cdn.jsdelivr.net/npm/@openstreetmap/id-tagging-schema@6.6/dist/discarded.min.json',
        'imagery': 'data/imagery.min.json',
        'intro_graph': 'data/intro_graph.min.json',
        'intro_rapid_graph': 'data/intro_rapid_graph.min.json',
        'languages': 'data/languages.min.json',
        'locales': 'data/locales.min.json',
        'nsi_data': 'https://cdn.jsdelivr.net/npm/name-suggestion-index@6.0/dist/nsi.min.json',
        'nsi_dissolved': 'https://cdn.jsdelivr.net/npm/name-suggestion-index@6.0/dist/dissolved.min.json',
        'nsi_features': 'https://cdn.jsdelivr.net/npm/name-suggestion-index@6.0/dist/featureCollection.min.json',
        'nsi_generics': 'https://cdn.jsdelivr.net/npm/name-suggestion-index@6.0/dist/genericWords.min.json',
        'nsi_presets': 'https://cdn.jsdelivr.net/npm/name-suggestion-index@6.0/dist/presets/nsi-id-presets.min.json',
        'nsi_replacements': 'https://cdn.jsdelivr.net/npm/name-suggestion-index@6.0/dist/replacements.min.json',
        'nsi_trees': 'https://cdn.jsdelivr.net/npm/name-suggestion-index@6.0/dist/trees.min.json',
        'oci_defaults': 'https://cdn.jsdelivr.net/npm/osm-community-index@5.7/dist/defaults.min.json',
        'oci_features': 'https://cdn.jsdelivr.net/npm/osm-community-index@5.7/dist/featureCollection.min.json',
        'oci_resources': 'https://cdn.jsdelivr.net/npm/osm-community-index@5.7/dist/resources.min.json',
        'phone_formats': 'data/phone_formats.min.json',
        'preset_categories': 'https://cdn.jsdelivr.net/npm/@openstreetmap/id-tagging-schema@6.6/dist/preset_categories.min.json',
        'preset_defaults': 'https://cdn.jsdelivr.net/npm/@openstreetmap/id-tagging-schema@6.6/dist/preset_defaults.min.json',
        'preset_fields': 'https://cdn.jsdelivr.net/npm/@openstreetmap/id-tagging-schema@6.6/dist/fields.min.json',
        'preset_presets': 'https://cdn.jsdelivr.net/npm/@openstreetmap/id-tagging-schema@6.6/dist/presets.min.json',
        'preset_overrides': 'data/preset_overrides.min.json',
        'qa_data': 'data/qa_data.min.json',
        'shortcuts': 'data/shortcuts.min.json',
        'territory_languages': 'data/territory_languages.min.json',
        'wayback': 'data/wayback.min.json',
        'wmf_sitematrix': 'https://cdn.jsdelivr.net/npm/wmf-sitematrix@0.1/wikipedia.min.json'
      }
    };

    // The origin can be switched between 'local' and 'latest'
    this.origin = 'latest';

    // The asset path defines the root folder that files are stored under.
    // If used, it should have a trailing slash, for example 'dist/'
    this.filePath = '';

    // A custom asset map may be provided by a separate asset management system.
    // (For example this may be provided by the Rails asset pipeline.)
    // This should be in the form of key-value filenames like:
    // {
    //   'original1.json': 'replacement1.json',
    //   'original2.json': 'replacement2.json',
    //   …
    // }
    this.fileReplacements = {};


    this._cache = {};
    this._inflight = {};

    // Mock data for testing, prevents the data from being fetched.
    // Not sure how I feel about this :-/
    if (window.mocha) {
      const c = this._cache;
      c.address_formats = { addressFormats: [{ format: [['housenumber', 'street'], ['city', 'postcode'] ] }] };
      c.deprecated = [{ old: { highway: 'no' } }, { old: { highway: 'ford' }, replace: { ford: '*' } }];
      c.discarded = {};
      c.imagery = { imagery: [] };
      c.languages = { languages: { de: { nativeName: 'Deutsch' }, en: { nativeName: 'English' } } };
      c.locales = { locales: { en: { rtl: false } } };
      c.phone_formats = { phoneFormats: {} };
      c.preset_categories = {};
      c.preset_defaults = {};
      c.preset_fields = {};
      c.preset_presets = {};
      c.preset_overrides = {};
      c.qa_data = { improveOSM: {}, keepRight: {}, osmose: {} };
      c.shortcuts = { shortcuts: [] };
      c.territory_languages = { territoryLanguages: {} };
      c.wmf_sitematrix = [ ['English', 'English', 'en'], ['German', 'Deutsch', 'de'] ];
    }
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
    this._started = true;
    return Promise.resolve();
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
   * getAssetURL
   * Returns the URL for the given filename.
   *   If the given value is already a URL, it's returned
   *   If the given value is a relative path, return the real location of that file.
   * @param  {string}  val - asset path
   * @return {string}  The real URL pointing to that filename
   */
  getAssetURL(val) {
    if (/^http(s)?:\/\//i.test(val)) return val; // already a url

    const filename = `${this.filePath}${val}`;
    return this.fileReplacements[filename] || filename;
  }


  /**
   * getDataURL
   * Returns the URL for the given asset identified by lookup key
   * @param  {string}  key - identifier for the data, should be found in the asset map.
   * @return {string}  URL of the asset
   */
  getDataURL(key) {
    if (/^http(s)?:\/\//i.test(key)) return key; // already a url

    const sources = this.sources[this.origin];
    if (!sources) {
      throw new Error(`Unknown origin "${this.origin}"`);
    }
    const val = sources[key];
    if (!val) {
      throw new Error(`Unknown asset key "${key}"`);
    }

    return this.getAssetURL(val);
  }


  /**
   * getDataAsync
   * Returns a Promise to fetch the data identified by the key.
   * @param  {string}  key - identifier for the data, should be found in the asset map.
   * @return {Promise} Promise resolved with the data
   */
  getDataAsync(key) {
    if (this._cache[key]) {
      return Promise.resolve(this._cache[key]);
    }

    let url;
    try {
      url = this.getDataURL(key);
    } catch (err) {
      return Promise.reject(err.message);
    }

    let loadPromise = this._inflight[url];
    if (!loadPromise) {
      this._inflight[url] = loadPromise = fetch(url)
        .then(utilFetchResponse)
        .then(result => {
          delete this._inflight[url];
          if (!result) {
            throw new Error(`No data loaded for "${key}"`);
          }
          this._cache[key] = result;
          return result;
        })
        .catch(err => {
          delete this._inflight[url];
          throw err;
        });
    }

    return loadPromise;
  }

}
