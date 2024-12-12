import { AbstractSystem } from '../core/AbstractSystem.js';
import { RapidDataset } from '../core/lib/index.js';
import { utilFetchResponse } from '../util/index.js';

const PMTILES_ROOT_URL = 'https://overturemaps-tiles-us-west-2-beta.s3.us-west-2.amazonaws.com/';
const PMTILES_CATALOG_PATH = 'pmtiles_catalog.json';


/**
 * `OvertureService`
 * This service connects to the 'official' sources of Overture PMTiles
 * by acting as a wrapper around the vector tile service
 *
 * - Protomaps .pmtiles single-file archive containing MVT
 *    https://protomaps.com/docs/pmtiles
 *    https://github.com/protomaps/PMTiles
 */
export class OvertureService extends AbstractSystem {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'overture';
    this.pmTilesCatalog = {};

    this.latestRelease = '';
    this._initPromise = null;
  }


  /**
   * _loadS3CatalogAsync
   * Load and parse the overture catalog data
   * @return {Promise} Promise resolved when the data has been loaded
   */
  _loadS3CatalogAsync() {
    return fetch(PMTILES_ROOT_URL + PMTILES_CATALOG_PATH)
      .then(utilFetchResponse)
      .then(json => {
        this.pmTilesCatalog = json;

        // Grab the very latest date stamp and keep track of the release associated with it.
        const dateStrings = this.pmTilesCatalog.releases.map(release => release.release_id);
        dateStrings.sort((a, b) => new Date(b) - new Date(a));
        this.latestRelease = this.pmTilesCatalog.releases.find(release => release.release_id === dateStrings[0]);
      })
      .catch(error => {
        console.error('Error fetching or parsing the PMTiles Catalog: ', error);   // eslint-disable-line no-console
      });
  }


  /**
   * initAsync
   * Called after all core objects have been constructed.
   * @return {Promise} Promise resolved when this component has completed initialization
   */
  initAsync() {
    if (this._initPromise) return this._initPromise;

    const vtService = this.context.services.vectortile;
    return this._initPromise = vtService.initAsync()
      .then(() => this._loadS3CatalogAsync());
  }


  /**
   * startAsync
   * Called after all core objects have been initialized.
   * @return {Promise} Promise resolved when this component has completed startup
   */
  startAsync() {
    this._started = true;

    const vtService = this.context.services.vectortile;
    return vtService.startAsync();
  }


  /**
   * getAvailableDatasets
   * Called by `RapidSystem` to get the datasets that this service provides.
   * @return {Array<RapidDataset>}  The datasets this service provides
   */
  getAvailableDatasets() {
    // just this one for now
    const places = new RapidDataset(this.context, {
      id: 'overture-places',
      conflated: false,
      service: 'overture',
      categories: new Set(['overture', 'places', 'featured']),
      color: '#00ffff',
      dataUsed: ['overture', 'Overture Places'],
      itemUrl: 'https://docs.overturemaps.org/guides/places/',
      licenseUrl: 'https://docs.overturemaps.org/attribution/#places',
      labelStringID: 'rapid_menu.overture.places.label',
      descriptionStringID: 'rapid_menu.overture.places.description'
    });

    return [places];
  }


  /**
   * loadTiles
   * Use the vector tile service to schedule any data requests needed to cover the current map view
   * @param   {string}  template - template to load tiles for
   */
  loadTiles(datasetID) {
    const vtService = this.context.services.vectortile;

    //TODO: Revisit the id-to-url mapping once we're done.
    if (datasetID.includes('places')) {
      const file = this.latestRelease.files.find(file => file.theme === 'places');
      const url = PMTILES_ROOT_URL + file.href;

      vtService.loadTiles(url);
    }
  }


  getData(datasetID) {
    const vtService = this.context.services.vectortile;

    if (datasetID.includes('places')) {
      const file = this.latestRelease.files.find(file => file.theme === 'places');
      const url = PMTILES_ROOT_URL + file.href;
      return vtService.getData(url);
    } else {
      return [];
    }
  }

}
