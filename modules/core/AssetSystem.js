import { AbstractSystem } from './AbstractSystem.js';
import { utilFetchResponse } from '../util/index.js';


/**
 * `AssetSystem` fetches data in JSON files.
 * This allows us to deploy Rapid in a way that the data it needs can be fetched at runtime.
 * It provides a method `getDataAsync` returning a Promise that resolves when the data is available.
 *
 * Properties available:
 *   `fileMap`   `Map` of resourceID to url
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

    const fileMap  = new Map();
    fileMap.set('address_formats', 'data/address_formats.min.json');
    fileMap.set('deprecated', 'https://cdn.jsdelivr.net/npm/@openstreetmap/id-tagging-schema@6.6/dist/deprecated.min.json');
    fileMap.set('discarded', 'https://cdn.jsdelivr.net/npm/@openstreetmap/id-tagging-schema@6.6/dist/discarded.min.json');
    fileMap.set('imagery', 'data/imagery.min.json');
    fileMap.set('intro_graph', 'data/intro_graph.min.json');
    fileMap.set('intro_rapid_graph', 'data/intro_rapid_graph.min.json');
    fileMap.set('languages', 'data/languages.min.json');
    fileMap.set('locales', 'data/locales.min.json');
    fileMap.set('oci_defaults', 'https://cdn.jsdelivr.net/npm/osm-community-index@5.7/dist/defaults.min.json');
    fileMap.set('oci_features', 'https://cdn.jsdelivr.net/npm/osm-community-index@5.7/dist/featureCollection.min.json');
    fileMap.set('oci_resources', 'https://cdn.jsdelivr.net/npm/osm-community-index@5.7/dist/resources.min.json');
    fileMap.set('phone_formats', 'data/phone_formats.min.json');
    fileMap.set('preset_categories', 'https://cdn.jsdelivr.net/npm/@openstreetmap/id-tagging-schema@6.6/dist/preset_categories.min.json');
    fileMap.set('preset_defaults', 'https://cdn.jsdelivr.net/npm/@openstreetmap/id-tagging-schema@6.6/dist/preset_defaults.min.json');
    fileMap.set('preset_fields', 'https://cdn.jsdelivr.net/npm/@openstreetmap/id-tagging-schema@6.6/dist/fields.min.json');
    fileMap.set('preset_presets', 'https://cdn.jsdelivr.net/npm/@openstreetmap/id-tagging-schema@6.6/dist/presets.min.json');
    fileMap.set('preset_overrides', 'data/preset_overrides.min.json');
    fileMap.set('qa_data', 'data/qa_data.min.json');
    fileMap.set('shortcuts', 'data/shortcuts.min.json');
    fileMap.set('territory_languages', 'data/territory_languages.min.json');
    fileMap.set('wayback', 'data/wayback.min.json');
    fileMap.set('wmf_sitematrix', 'https://cdn.jsdelivr.net/npm/wmf-sitematrix@0.1/wikipedia.min.json');

    this.fileMap = fileMap;
    this._cache = {};
    this._inflight = {};

    // Mock data for testing, prevents the data from being fetched.
    // Not sure how I feel about this :-/
    if (window.mocha) {
      const c = this._cache;
      c.address_formats = { addressFormats: [{ format: [['housenumber', 'street'], ['city', 'postcode']] }]};
      c.deprecated = [{ old: { highway: 'no' } }, { old: { highway: 'ford' }, replace: { ford: '*' } } ];
      c.discarded = {};
      c.imagery = { imagery: [] };
      c.languages = { languages: { de: { nativeName: 'Deutsch' }, en: { nativeName: 'English' } } };
      c.locales = { en: { rtl: false } };
      c.phone_formats = { phoneFormats: {}};
      c.preset_categories = {};
      c.preset_defaults = {};
      c.preset_fields = {};
      c.preset_presets = {};
      c.preset_overrides = {};
      c.qa_data = { improveOSM: {}, keepRight: {}, osmose: {} };
      c.shortcuts = { shortcuts: [] };
      c.territory_languages = { territoryLanguages: {} };
      c.wmf_sitematrix = [ ['English','English','en'], ['German', 'Deutsch', 'de'] ];
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
   * getDataAsync
   * Returns a Promise to fetch the data identified by the key.
   * @param  {string}  key - identifier for the data, should be found in the fileMap.
   * @return {Promise} Promise resolved with the data
   */
  getDataAsync(key) {
    if (this._cache[key]) {
      return Promise.resolve(this._cache[key]);
    }

    const file = this.fileMap.get(key);
    const url = file && this.context.asset(file);
    if (!url) {
      return Promise.reject(`Unknown data file for "${key}"`);
    }

    let prom = this._inflight[url];
    if (!prom) {
      this._inflight[url] = prom = fetch(url)
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

    return prom;
  }

}
