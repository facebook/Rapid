import { Tiler} from '@rapid-sdk/math';

import { AbstractSystem } from '../core/AbstractSystem.js';

const PMTILES_ROOT_URL = 'https://overturemaps-tiles-us-west-2-beta.s3.us-west-2.amazonaws.com/';
const PMTILES_CATALOG_PATH = 'pmtiles_catalog.json';


/**
 * `OvertureService`
 * This service connects to the 'official' sources of Overture PMTiles by acting as a wrapper around the 
 * vector tile service
 *
 * - Protomaps .pmtiles single-file archive containing MVT
 *    https://protomaps.com/docs/pmtiles
 *    https://github.com/protomaps/PMTiles
 *
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

    // Sources are identified by their URL template..
    this._sources = new Map();   // Map(template -> source)
    this._tiler = new Tiler().tileSize(512).margin(1);
    this._nextID = 0;
  }


 async _loadS3Catalog() {
  await fetch(PMTILES_ROOT_URL + PMTILES_CATALOG_PATH)
    .then(response => response.json())
    .then(catalog => {
      this.pmTilesCatalog = catalog;
    })
    .catch(error => {
      console.error('Error fetching or parsing the PMTiles STAC Catalog:', error);
    });
}

  /**
   * initAsync
   * Called after all core objects have been constructed.
   * @return {Promise} Promise resolved when this component has completed initialization
   */
  initAsync() {
    const context = this.context;
    const vtService = context.services.vectortile;

    return Promise.resolve(vtService.initAsync()).then( () => {
    //other init here after the vector tile service is done initializing
    this._loadS3Catalog();

    });
  }


  /**
   * startAsync
   * Called after all core objects have been initialized.
   * @return {Promise} Promise resolved when this component has completed startup
   */
  startAsync() {
    this._started = true;
    const context = this.context;
    const vtService = context.services.vectortile;

    return Promise.resolve(vtService.startAsync()).then( () => {
      //other init here after the vector tile service is done starting

      const dateStrings = this.pmTilesCatalog.releases.map(release => release.release_id);


      dateStrings.sort( (a, b) => new Date(b) - new Date(a));

      // Grab the very latest date stamp and keep track of the release associated with it.
      this.latestRelease = this.pmTilesCatalog.releases.find(release => release.release_id === dateStrings[0]);

    });
  }


  /**
   * loadTiles
   * Use the vector tile service to schedule any data requests needed to cover the current map view
   * @param   {string}  template - template to load tiles for
   */
  loadTiles(datasetID) {

    const vtService = this.context.services.vectortile;  // 'mapwithai' or 'esri'

    //TODO: Revisit the id-to-url mapping once we're done. 
    if (datasetID.includes('places')) {

      const file = this.latestRelease.files.find(file => file.theme === 'places');
      const url = PMTILES_ROOT_URL + file.href;

      vtService.loadTiles(url);
    }
  }

  
  getData(datasetID) {
    const vtService = this.context.services.vectortile;  // 'mapwithai' or 'esri'

    if (datasetID.includes('places')) {
      const file = this.latestRelease.files.find(file => file.theme === 'places');
      const url = PMTILES_ROOT_URL + file.href;
       return vtService.getData(url);
    } else {
      return [];
    }
  }

}
