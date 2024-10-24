import { Extent, Tiler, geoScaleToZoom, vecEqual } from '@rapid-sdk/math';
import { utilHashcode } from '@rapid-sdk/util';
import { VectorTile } from '@mapbox/vector-tile';
import geojsonRewind from '@mapbox/geojson-rewind';
import { PMTiles } from 'pmtiles';
import stringify from 'fast-json-stable-stringify';
import * as Polyclip from 'polyclip-ts';
import Protobuf from 'pbf';
import RBush from 'rbush';

import { AbstractSystem } from '../core/AbstractSystem.js';
import { utilFetchResponse } from '../util/index.js';

const PMTILES_STAC_ROOT_URL = 'https://overturemaps-tiles-us-west-2-beta.s3.us-west-2.amazonaws.com/stac/';
const PMTILES_ROOT_URL = 'https://overturemaps-tiles-us-west-2-beta.s3.us-west-2.amazonaws.com/';
const PMTILES_STAC_CATALOG_PATH = 'catalog.json';


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

async _loadThemeItem(url, release_catalog) {
  await fetch(url)
  .then(response => response.json())
  .then(item =>  {
      const assets = item.assets;
      for (const key in assets) {
          if (assets[key].href) {
              const theme_name = key;
              let urlPath = assets[key].href;

              if (urlPath.startsWith('./')) {
                urlPath = urlPath.slice(2);
              }
              release_catalog[theme_name] = assets[key].href;
          }
      }
  })
  .catch(error => {
    console.error('\t\tError fetching or parsing PMTiles asset ', error);
  });
}


async _loadReleaseMetadata(url, catalog){
  await fetch(url)
    .then(response => response.json())
    .then(collection => {
      // Process the collection data
      console.log(collection);

      // Access specific properties
      console.log(collection.id);
      console.log(collection.description);
      const release_name = collection.id;

      catalog[release_name] = [];
      // Iterate through collection items
      collection.links.forEach(link => {
          if (link.rel === 'item') {
              console.log('\t' + link.rel, link.href);
              this._loadThemeItem(PMTILES_STAC_ROOT_URL + release_name + '/' + link.href, catalog[release_name])
          }
      });

    })
    .catch(error => {
      console.error('\tError fetching or parsing the PMTiles Collection', error);
    });
}


 async _loadStacRootMetadata(pmTilesCatalog) {
  await fetch(PMTILES_STAC_ROOT_URL + PMTILES_STAC_CATALOG_PATH)
    .then(response => response.json())
    .then(catalog => {

      // Iterate through links
      catalog.links.forEach(link => {
          if (link.rel === 'child') {
              const relPath = link.href;
              this._loadReleaseMetadata(PMTILES_STAC_ROOT_URL + relPath, pmTilesCatalog);
          }
      });
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

    this._loadStacRootMetadata(this.pmTilesCatalog);
    return Promise.resolve(vtService.initAsync()).then( () => {
    //other init here after the vector tile service is done initializing

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

      const dateStrings = Object.keys(this.pmTilesCatalog);


      dateStrings.sort( (a, b) => new Date(b) - new Date(a));

      // Grab the very latest date stamp.
      this.latestRelease = dateStrings[0];

    });
  }

  loadStacMetadata () { 
    fetch(this.PMTILES_STAC_ROOT_URL) 
      .then(response => response.json())
      .then(catalog => {
        // Process the catalog data
        console.log(catalog);

        // Access specific properties
        console.log(catalog.id);
        console.log(catalog.description);

        // Iterate through links
        catalog.links.forEach(link => {
          console.log(link.rel, link.href);
        });
      })
      .catch(error => {
        console.error('Error fetching or parsing the PMTiles STAC Catalog:', error);
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
      const url = PMTILES_ROOT_URL + this.pmTilesCatalog[this.latestRelease].places;

      vtService.loadTiles(url);
    }
  }

  getData(datasetID) {
    const vtService = this.context.services.vectortile;  // 'mapwithai' or 'esri'

    if (datasetID.includes('places')) {
       const url = PMTILES_ROOT_URL + this.pmTilesCatalog[this.latestRelease].places;
       return vtService.getData(url);
    } else {
      return [];
    }
  }

}
