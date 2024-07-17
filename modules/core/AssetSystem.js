import { AbstractSystem } from './AbstractSystem.js';
import { utilFetchResponse } from '../util/index.js';


/**
 * `AssetSystem` keeps track of files and data that Rapid needs to load.
 *
 * Properties available:
 *   `sources`   The sources Object contains all the details about where to fetch assets from
 *   `origin`    'local' (all files fetched from dist) or 'latest' (newer files may be fetched from CDN)
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
    // The data files are identified by keys, and are organized by origin.
    //  'local' - will only load assets from the local folder.
    //  'latest' - may load latest assets from a CDN which match the expected semantic version
    //
    this.sources = {
      local: {
        'address_formats':           'data/address_formats.min.json',
        'imagery':                   'data/imagery.min.json',
        'intro_graph':               'data/intro_graph.min.json',
        'intro_rapid_graph':         'data/intro_rapid_graph.min.json',
        'languages':                 'data/languages.min.json',
        'locales':                   'data/locales.min.json',
        'phone_formats':             'data/phone_formats.min.json',
        'qa_data':                   'data/qa_data.min.json',
        'shortcuts':                 'data/shortcuts.min.json',
        'tagging_preset_overrides':  'data/preset_overrides.min.json',
        'territory_languages':       'data/territory_languages.min.json',
        'wayback':                   'data/wayback.min.json',

        'mapillary_js':   'data/modules/mapillary-js/mapillary.js',   // note no .min
        'mapillary_css':  'data/modules/mapillary-js/mapillary.css',  // note no .min

        'maplibre_js':   'data/modules/maplibre-gl/maplibre-gl.js',   // note no .min
        'maplibre_css':  'data/modules/maplibre-gl/maplibre-gl.css',  // note no .min

        'nsi_data':          'data/modules/name-suggestion-index/nsi.min.json',
        'nsi_dissolved':     'data/modules/name-suggestion-index/dissolved.min.json',
        'nsi_features':      'data/modules/name-suggestion-index/featureCollection.min.json',
        'nsi_generics':      'data/modules/name-suggestion-index/genericWords.min.json',
        'nsi_presets':       'data/modules/name-suggestion-index/presets/nsi-id-presets.min.json',
        'nsi_replacements':  'data/modules/name-suggestion-index/replacements.min.json',
        'nsi_trees':         'data/modules/name-suggestion-index/trees.min.json',

        'oci_defaults':   'data/modules/osm-community-index/defaults.min.json',
        'oci_features':   'data/modules/osm-community-index/featureCollection.min.json',
        'oci_resources':  'data/modules/osm-community-index/resources.min.json',

        'pannellum_js':   'data/modules/pannellum/pannellum.js',   // note no .min
        'pannellum_css':  'data/modules/pannellum/pannellum.css',  // note no .min

        'tagging_deprecated':         'data/modules/id-tagging-schema/deprecated.min.json',
        'tagging_discarded':          'data/modules/id-tagging-schema/discarded.min.json',
        'tagging_preset_categories':  'data/modules/id-tagging-schema/preset_categories.min.json',
        'tagging_preset_defaults':    'data/modules/id-tagging-schema/preset_defaults.min.json',
        'tagging_preset_fields':      'data/modules/id-tagging-schema/fields.min.json',
        'tagging_preset_presets':     'data/modules/id-tagging-schema/presets.min.json',

        'wmf_sitematrix':  'data/modules/wmf-sitematrix/wikipedia.min.json'
      },

      latest: {
        'address_formats':           'data/address_formats.min.json',
        'imagery':                   'data/imagery.min.json',
        'intro_graph':               'data/intro_graph.min.json',
        'intro_rapid_graph':         'data/intro_rapid_graph.min.json',
        'languages':                 'data/languages.min.json',
        'locales':                   'data/locales.min.json',
        'phone_formats':             'data/phone_formats.min.json',
        'qa_data':                   'data/qa_data.min.json',
        'shortcuts':                 'data/shortcuts.min.json',
        'tagging_preset_overrides':  'data/preset_overrides.min.json',
        'territory_languages':       'data/territory_languages.min.json',
        'wayback':                   'data/wayback.min.json',

        'mapillary_js':   'https://cdn.jsdelivr.net/npm/mapillary-js@4/dist/mapillary.min.js',   // CDN supports .min
        'mapillary_css':  'https://cdn.jsdelivr.net/npm/mapillary-js@4/dist/mapillary.min.css',  // CDN supports .min

        'maplibre_js':   'https://cdn.jsdelivr.net/npm/maplibre-gl@3/dist/maplibre-gl.min.js',   // CDN supports .min
        'maplibre_css':  'https://cdn.jsdelivr.net/npm/maplibre-gl@3/dist/maplibre-gl.min.css',  // CDN supports .min

        'nsi_data':          'https://cdn.jsdelivr.net/npm/name-suggestion-index@6.0/dist/nsi.min.json',
        'nsi_dissolved':     'https://cdn.jsdelivr.net/npm/name-suggestion-index@6.0/dist/dissolved.min.json',
        'nsi_features':      'https://cdn.jsdelivr.net/npm/name-suggestion-index@6.0/dist/featureCollection.min.json',
        'nsi_generics':      'https://cdn.jsdelivr.net/npm/name-suggestion-index@6.0/dist/genericWords.min.json',
        'nsi_presets':       'https://cdn.jsdelivr.net/npm/name-suggestion-index@6.0/dist/presets/nsi-id-presets.min.json',
        'nsi_replacements':  'https://cdn.jsdelivr.net/npm/name-suggestion-index@6.0/dist/replacements.min.json',
        'nsi_trees':         'https://cdn.jsdelivr.net/npm/name-suggestion-index@6.0/dist/trees.min.json',

        'oci_defaults':   'https://cdn.jsdelivr.net/npm/osm-community-index@5.8/dist/defaults.min.json',
        'oci_features':   'https://cdn.jsdelivr.net/npm/osm-community-index@5.8/dist/featureCollection.min.json',
        'oci_resources':  'https://cdn.jsdelivr.net/npm/osm-community-index@5.8/dist/resources.min.json',

        'pannellum_js':   'https://cdn.jsdelivr.net/npm/pannellum@2/build/pannellum.min.js',   // CDN supports .min
        'pannellum_css':  'https://cdn.jsdelivr.net/npm/pannellum@2/build/pannellum.min.css',  // CDN supports .min

        'tagging_deprecated':         'https://cdn.jsdelivr.net/npm/@openstreetmap/id-tagging-schema@6.6/dist/deprecated.min.json',
        'tagging_discarded':          'https://cdn.jsdelivr.net/npm/@openstreetmap/id-tagging-schema@6.6/dist/discarded.min.json',
        'tagging_preset_categories':  'https://cdn.jsdelivr.net/npm/@openstreetmap/id-tagging-schema@6.6/dist/preset_categories.min.json',
        'tagging_preset_defaults':    'https://cdn.jsdelivr.net/npm/@openstreetmap/id-tagging-schema@6.6/dist/preset_defaults.min.json',
        'tagging_preset_fields':      'https://cdn.jsdelivr.net/npm/@openstreetmap/id-tagging-schema@6.6/dist/fields.min.json',
        'tagging_preset_presets':     'https://cdn.jsdelivr.net/npm/@openstreetmap/id-tagging-schema@6.6/dist/presets.min.json',

        'wmf_sitematrix':  'https://cdn.jsdelivr.net/npm/wmf-sitematrix@0.1/wikipedia.min.json'
      }
    };

    // The origin can be set to 'local' or 'latest'
    // (This must set before init, and should not be changed later)
    this.origin = 'latest';

    // The file path defines the root folder that files are stored under.
    // If used, it should have a trailing slash, for example 'dist/'
    // (This must set before init, and should not be changed later)
    this.filePath = '';

    // A custom asset map may be provided by a separate asset management system.
    // (For example this may be provided by the Rails asset pipeline.)
    // This should be in the form of key-value replacement filenames like:
    // {
    //   'original1.json': 'replacement1.json',
    //   'original2.json': 'replacement2.json',
    //   …
    // }
    // (This must set before init, and should not be changed later)
    this.fileReplacements = {};


    this._cache = {};
    this._inflight = {};

    // Mock data for testing, prevents the data from being fetched.
    // Not sure how I feel about this :-/
    if (window.mocha) {
      const c = this._cache;
      c.address_formats = { addressFormats: [{ format: [['housenumber', 'street'], ['city', 'postcode'] ] }] };
      c.imagery = { imagery: [] };
      c.languages = { languages: { de: { nativeName: 'Deutsch' }, en: { nativeName: 'English' } } };
      c.locales = { locales: { en: { rtl: false } } };
      c.phone_formats = { phoneFormats: {} };
      c.qa_data = { keepRight: {}, osmose: {} };
      c.shortcuts = { shortcuts: [] };
      c.territory_languages = { territoryLanguages: {} };
      c.tagging_deprecated = [{ old: { highway: 'no' } }, { old: { highway: 'ford' }, replace: { ford: '*' } }];
      c.tagging_discarded = {};
      c.tagging_preset_categories = {};
      c.tagging_preset_defaults = {};
      c.tagging_preset_fields = {};
      c.tagging_preset_presets = {};
      c.tagging_preset_overrides = {};
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
   * getFileURL
   * Returns the URL for the given filename.
   *   If the given value is already a URL, it's returned
   *   If the given value is a relative path, return the real location of that file.
   * @param  {string}  val - asset path
   * @return {string}  The real URL pointing to that filename
   */
  getFileURL(val) {
    if (/^http(s)?:\/\//i.test(val)) return val; // already a url

    const filename = `${this.filePath}${val}`;
    return this.fileReplacements[filename] || filename;
  }


  /**
   * getAssetURL
   * Returns the URL for the given asset key.
   * @param   {string}  key - identifier for the asset, should be found in the asset map.
   * @return  {string}  URL of the asset
   * @throws  Will throw if the asset key is not found, or the current origin is invalid
   */
  getAssetURL(key) {
    if (/^http(s)?:\/\//i.test(key)) return key; // already a url

    const sources = this.sources[this.origin];
    if (!sources) {
      throw new Error(`Unknown origin "${this.origin}"`);
    }
    const val = sources[key];
    if (!val) {
      throw new Error(`Unknown asset key "${key}"`);
    }

    return this.getFileURL(val);
  }


  /**
   * loadAssetAsync
   * Returns a Promise to fetch the data identified by the key.
   * @param  {string}  key - identifier for the data, should be found in the asset map.
   * @return {Promise} Promise resolved with the data
   */
  loadAssetAsync(key) {
    if (this._cache[key]) {
      return Promise.resolve(this._cache[key]);
    }

    let url;
    try {
      url = this.getAssetURL(key);
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
