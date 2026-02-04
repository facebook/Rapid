import { gpx } from '@tmcw/togeojson';
import { Extent } from '@rapid-sdk/math';

import { AbstractSystem } from './AbstractSystem.js';

const RAPID_MAGENTA = '#da26d3';
const OVERTURE_CYAN = '#00ffff';
const RAPID_COLORS = [
  '#ff0000',  // red
  '#ffa500',  // orange
  '#ffd700',  // gold
  '#00ff00',  // lime
  '#00ffff',  // cyan
  '#1e90ff',  // dodgerblue
  '#da26d3',  // rapid magenta
  '#ffc0cb',  // pink
  '#d3d3d3',  // lightgray
  '#faf0e6'   // linen
];


// Convert a single value, an Array of values, or a Set of values.
function asSet(vals) {
  if (vals instanceof Set) return vals;
  return new Set(vals !== undefined && [].concat(vals));
}


/**
 * `RapidSystem` maintains all the Rapid datasets
 *
 * Events available:
 *  `datasetchange`   Fires when datasets are added/removed from the list
 *  `taskchanged`
 */
export class RapidSystem extends AbstractSystem {

  /**
   * @constructor
   * @param  `context`   Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'rapid';
    this.dependencies = new Set(['assets', 'editor', 'l10n', 'map', 'urlhash']);

    this.catalog = new Map();             // Map<datasetID, RapidDataset> - all the datasets we know about
    this.categories = new Set();          // Set<string> - all the dataset 'categories' we know about
    this._addedDatasetIDs = new Set();    // Set<datasetID> - currently "added" datasets - is it on the menu?
    this._enabledDatasetIDs = new Set();  // Set<datasetID> - currently "enabled" datasets - is it checked?

    // Watch edit history to keep track of which features have been accepted by the user.
    // These features will be filtered out when drawing
    this.acceptIDs = new Set();    // Set<dataID>
    this.ignoreIDs = new Set();    // Set<dataID>

    this._nextColorIndex = 2;  // see note in _datasetsChanged()
    this._taskExtent = null;
    this._isTaskBoundsRect = null;
    this._hadPoweruser = false;   // true if the user had poweruser mode at any point in their editing

    this._initPromise = null;
    this._startPromise = null;

    // Ensure methods used as callbacks always have `this` bound correctly.
    this._hashchange = this._hashchange.bind(this);
    this._stablechange = this._stablechange.bind(this);
  }


  /**
   * initAsync
   * Called after all core objects have been constructed.
   * @return {Promise} Promise resolved when this component has completed initialization
   */
  initAsync() {
    if (this._initPromise) return this._initPromise;

    for (const id of this.dependencies) {
      if (!this.context.systems[id]) {
        return Promise.reject(`Cannot init:  ${this.id} requires ${id}`);
      }
    }

    const context = this.context;
    const editor = context.systems.editor;
    const map = context.systems.map;
    const urlhash = context.systems.urlhash;

    const prerequisites = Promise.all([
      editor.initAsync(),
      map.initAsync(),   // RapidSystem should listen for hashchange after MapSystem
      urlhash.initAsync()
    ]);

    return this._initPromise = prerequisites
      .then(() => {
        urlhash.on('hashchange', this._hashchange);
        editor.on('stablechange', this._stablechange);
     });
  }


  /**
   * startAsync
   * Called after all core objects have been initialized.
   * @return {Promise} Promise resolved when this component has completed startup
   */
  startAsync() {
    if (this._startPromise) return this._startPromise;

    // We wait until startAsync to create the dataset catalog because the services need to be initialized.
    const context = this.context;
    const urlhash = context.systems.urlhash;

    const esri = context.services.esri;
    const mapwithai = context.services.mapwithai;
    const overture = context.services.overture;

    // This code is written in a way that we can work with whatever
    // data-providing services are installed.
    const services = [];
    if (esri)      services.push(esri);
    if (mapwithai) services.push(mapwithai);
    if (overture)  services.push(overture);

    const prerequisites = Promise.all(services.map(service => service.startAsync()));

    return this._startPromise = prerequisites
      .then(() => {
        // Gather all available datasets and categories into the dataset catalog..
        for (const service of services) {
          const datasets = service.getAvailableDatasets();
          for (const dataset of datasets) {
            this.catalog.set(dataset.id, dataset);
            for (const category of dataset.categories) {
              this.categories.add(category);
            }
          }
        }

        // Set some defaults
        if (!urlhash.initialHashParams.has('datasets')) {
          this._addedDatasetIDs = new Set(['fbRoads', 'overture-esri-buildings', 'overture-ml-buildings', 'omdFootways']);  // on menu
          this._enabledDatasetIDs = new Set(['overture-ml-buildings']);  // checked
          this._datasetsChanged();
        }

        this._started = true;
      });
  }


  /**
   * resetAsync
   * Called after completing an edit session to reset any internal state
   * @return {Promise} Promise resolved when this component has completed resetting
   */
  resetAsync() {
    this.acceptIDs.clear();
    this.ignoreIDs.clear();
    return Promise.resolve();
  }


  /**
   * addDatasets
   * Add datasets to the menu.  (Does not set their checked 'enabled' state.)
   * @param  {Set|Array|string}  datasetIDs - Set or Array of datasetIDs to add, or a single string datasetID
   */
  addDatasets(datasetIDs) {
    for (const datasetID of asSet(datasetIDs)) {   // coax ids into a Set
      this._addedDatasetIDs.add(datasetID);
    }
    this._datasetsChanged();
  }


  /**
   * removeDatasets
   * Remove datasets from the menu. (Also unchecks their 'enabled' state)
   * @param  {Set|Array|string}  datasetIDs - Set or Array of datasetIDs to remove, or a single string datasetID
   */
  removeDatasets(datasetIDs) {
    for (const datasetID of asSet(datasetIDs)) {   // coax ids into a Set
      this._addedDatasetIDs.delete(datasetID);
      this._enabledDatasetIDs.delete(datasetID);
    }
    this._datasetsChanged();
  }


  /**
   * enableDatasets
   * Checks the dataset as enabled. (Also ensures that the dataset is 'added' to the menu).
   * @param  {Set|Array|string}  datasetIDs - Set or Array of datasetIDs to enable, or a single string datasetID
   */
  enableDatasets(datasetIDs) {
    for (const datasetID of asSet(datasetIDs)) {   // coax ids into a Set
      this._addedDatasetIDs.add(datasetID);
      this._enabledDatasetIDs.add(datasetID);
    }
    this._datasetsChanged();
  }


  /**
   * disableDatasets
   * Unchecks the dataset as disabled. (Does not affect whether the dataset is 'added' to the menu)
   * @param  {Set|Array|string}  datasetIDs - Set or Array of datasetIDs to disable, or a single string datasetID
   */
  disableDatasets(datasetIDs) {
    for (const datasetID of asSet(datasetIDs)) {   // coax ids into a Set
      this._enabledDatasetIDs.delete(datasetID);
    }
    this._datasetsChanged();
  }


  /**
   * toggleDatasets
   * Toggles the given datasets enabled state, does not affect any other datasets.
   * @param  {Set|Array|string}  datasetIDs - Set or Array of datasetIDs to toggle, or a single string datasetID
   */
  toggleDatasets(datasetIDs) {
    for (const datasetID of asSet(datasetIDs)) {   // coax ids into a Set
      this._addedDatasetIDs.add(datasetID);  // it needs to be added to the menu
      if (this._enabledDatasetIDs.has(datasetID)) {
        this._enabledDatasetIDs.delete(datasetID);
      } else {
        this._enabledDatasetIDs.add(datasetID);
      }
    }
    this._datasetsChanged();
  }


  // return just the added ones
  get datasets() {
    const results = new Map();
    for (const datasetID of this._addedDatasetIDs) {
      const dataset = this.catalog.get(datasetID);
      if (dataset) {  // Only include datasets that exist in the catalog
        results.set(datasetID, dataset);
      }
    }
    return results;
  }

  get colors() {
    return RAPID_COLORS;
  }

  get taskExtent() {
    return this._taskExtent;
  }

  isTaskRectangular() {
    return (!!this._taskExtent && this._isTaskBoundsRect);
  }


  /**
   * hadPoweruser
   * true if the user had poweruser mode at any point in their editing
   * @readonly
   */
  get hadPoweruser() {
    return this._hadPoweruser;
  }


  /**
   * setTaskExtentByGpxData
   */
  setTaskExtentByGpxData(gpxDomData) {
    const gj = gpx(gpxDomData);
    const lineStringCount = gj.features.reduce((accumulator, currentValue) =>  {
      return accumulator + (currentValue.geometry.type === 'LineString' ? 1 : 0);
    }, 0);

    if (gj.type === 'FeatureCollection') {
      let minlat, minlon, maxlat, maxlon;

      gj.features.forEach(f => {
        if (f.geometry.type === 'Point') {
          const lon = f.geometry.coordinates[0];
          const lat = f.geometry.coordinates[1];
          if (minlat === undefined || lat < minlat) minlat = lat;
          if (minlon === undefined || lon < minlon) minlon = lon;
          if (maxlat === undefined || lat > maxlat) maxlat = lat;
          if (maxlon === undefined || lon > maxlon) maxlon = lon;

        } else if (f.geometry.type === 'LineString' && lineStringCount === 1) {
          const lats = f.geometry.coordinates.map(f => f[0]);
          const lngs = f.geometry.coordinates.map(f => f[1]);
          const uniqueLats = lats.filter(distinct);
          const uniqueLngs = lngs.filter(distinct);
          let eachLatHas2Lngs = true;

          uniqueLats.forEach(lat => {
            const lngsForThisLat = f.geometry.coordinates
              .filter(coord => coord[0] === lat)   // Filter the coords to the ones with this lat
              .map(coord => coord[1])              // Make an array of lngs that associate with that lat
              .filter(distinct);                   // Finally, filter for uniqueness

            if (lngsForThisLat.length !== 2) {
              eachLatHas2Lngs = false;
            }
          });
          // Check for exactly two unique latitudes, two unique longitudes,
          // and that each latitude was associated with exactly 2 longitudes,
          if (uniqueLats.length === 2 && uniqueLngs.length === 2 && eachLatHas2Lngs) {
            this._isTaskBoundsRect = true;
          } else {
            this._isTaskBoundsRect = false;
          }
        }
      });

      this._taskExtent = new Extent([minlon, minlat], [maxlon, maxlat]);
      this.emit('taskchanged');
    }

    function distinct(value, index, self) {
      return self.indexOf(value) === index;
    }
  }


  /**
   * _stablechange
   * This is called anytime the history changes, we recompute the accepted/ignored sets.
   * This can run on history change, undo, redo, or history restore.
   */
  _stablechange() {
    const context = this.context;
    const editor = context.systems.editor;

    this.acceptIDs.clear();
    this.ignoreIDs.clear();

    const history = editor.history;
    const index = editor.index;

    // Start at `1` - there won't be sources on the `base` edit..
    // End at `index` - don't continue into the redo part of the history..
    for (let i = 1; i <= index; i++) {
      const edit = history[i];
      const annotation = edit.annotation;

      if (annotation?.type === 'rapid_accept_feature') {
        if (annotation.entityID)  this.acceptIDs.add(annotation.entityID);
      } else if (annotation?.type === 'rapid_ignore_feature') {
        if (annotation.entityID)  this.ignoreIDs.add(annotation.entityID);
      }
    }
  }


  /**
   * _hashchange
   * Respond to any changes appearing in the url hash
   * @param  currParams   Map(key -> value) of the current hash parameters
   * @param  prevParams   Map(key -> value) of the previous hash parameters
   */
  _hashchange(currParams, prevParams) {
    // poweruser
    // remember if the user had poweruser on at any point in their editing
    if (currParams.get('poweruser') === 'true') {
      this._hadPoweruser = true;
    }

    // datasets
    const newDatasets = currParams.get('datasets');
    const oldDatasets = prevParams.get('datasets');
    if (newDatasets !== oldDatasets) {
      this._enabledDatasetIDs.clear();
      if (typeof newDatasets === 'string') {
        const toEnable = newDatasets.replace(/;/g, ',').split(',').map(s => s.trim()).filter(Boolean);
        this.enableDatasets(toEnable);
      } else {  // all removed
        this._datasetsChanged();
      }
    }
  }


  /**
   * _datasetsChanged
   * Handle changes in dataset state, update the urlhash, emit 'datasetchange'
   */
  _datasetsChanged() {
    const context = this.context;
    const urlhash = context.systems.urlhash;

    const enabledIDs = [];
    for (const [datasetID, dataset] of this.catalog) {
      // This code is a bit weird - I don't like it and we should change it...
      // I'm trying to match the legacy color-choosing behavior from before Rapid#1642 (which changed a bunch of things)
      // - If adding fbRoads/msBuildings, choose "Rapid magenta".
      // - If adding an Overture dataset, choose "Overture cyan".
      // - If adding an Esri dataset, choose a color based on how many datasets were added already.
      const wasAdded = dataset.added;
      const nowAdded = this._addedDatasetIDs.has(datasetID);
      if (!wasAdded && nowAdded && dataset.color === RAPID_MAGENTA) {  // being added right now with the default color
        if (dataset.categories.has('meta') || dataset.categories.has('microsoft')) {
          dataset.color = RAPID_MAGENTA;
        } else if (dataset.categories.has('overture')) {
          dataset.color = OVERTURE_CYAN;
        } else {
          dataset.color = RAPID_COLORS[this._nextColorIndex++ % RAPID_COLORS.length];
        }
      }

      dataset.added = nowAdded;
      dataset.enabled = this._enabledDatasetIDs.has(datasetID);

      if (dataset.added && dataset.enabled) {
        enabledIDs.push(datasetID);
      }
    }

    // datasets
    urlhash.setParam('datasets', enabledIDs.length ? enabledIDs.join(',') : null);

    this.emit('datasetchange');
  }

}
