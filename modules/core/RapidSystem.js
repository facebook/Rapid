import { gpx } from '@tmcw/togeojson';
import { Extent } from '@rapid-sdk/math';

import { AbstractSystem } from './AbstractSystem.js';

const RAPID_MAGENTA = '#da26d3';
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


/**
 * `RapidSystem` maintains all the Rapid datasets
 *
 * Events available:
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
    this.dependencies = new Set(['editor', 'l10n', 'urlhash']);

    // Watch edit history to keep track of which features have been accepted by the user.
    // These features will be filtered out when drawing
    this.acceptIDs = new Set();
    this.ignoreIDs = new Set();

    this._datasets = new Map();   // Map(datasetID -> dataset)
    this._taskExtent = null;
    this._isTaskBoundsRect = null;
    this._hadPoweruser = false;   // true if the user had poweruser mode at any point in their editing

    this._initPromise = null;

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
    const l10n = context.systems.l10n;
    const map = context.systems.map;
    const urlhash = context.systems.urlhash;

    const prerequisites = Promise.all([
      editor.initAsync(),
      map.initAsync(),   // RapidSystem should listen for hashchange after MapSystem
      l10n.initAsync(),
      urlhash.initAsync()
    ]);

    return this._initPromise = prerequisites
      .then(() => {
        urlhash.on('hashchange', this._hashchange);
        editor.on('stablechange', this._stablechange);

        this._datasets.set('fbRoads', {
          id: 'fbRoads',
          beta: false,
          added: true,         // whether it should appear in the list
          enabled: false,      // whether the user has checked it on
          conflated: true,
          service: 'mapwithai',
          color: RAPID_MAGENTA,
          dataUsed: ['mapwithai', 'Facebook Roads'],
          label: l10n.t('rapid_feature_toggle.fbRoads.label'),
          license_markdown: l10n.t('rapid_feature_toggle.fbRoads.license_markdown')
        });

        this._datasets.set('msBuildings', {
          id: 'msBuildings',
          beta: false,
          added: true,         // whether it should appear in the list
          enabled: false,      // whether the user has checked it on
          conflated: true,
          service: 'mapwithai',
          color: RAPID_MAGENTA,
          dataUsed: ['mapwithai', 'Microsoft Buildings'],
          label: l10n.t('rapid_feature_toggle.msBuildings.label'),
          license_markdown: l10n.t('rapid_feature_toggle.msBuildings.license_markdown')
        });

        this._datasets.set('metaFootways', {
          id: 'metaFootways',
          beta: true,
          added: true,         // whether it should appear in the list
          enabled: false,      // whether the user has checked it on
          conflated: true,
          service: 'mapwithai',
          overlay: {
            url: 'https://external.xx.fbcdn.net/maps/vtp/rapid_overlay_footways/1/{z}/{x}/{y}/',
            minZoom: 1,
            maxZoom: 15,
          },
          color: RAPID_MAGENTA,
          dataUsed: ['mapwithai', 'Meta Footways'],
          label: l10n.t('rapid_feature_toggle.metaFootways.label'),
          license_markdown: l10n.t('rapid_feature_toggle.metaFootways.license_markdown')
        });
      });
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
    this.acceptIDs.clear();
    this.ignoreIDs.clear();
    return Promise.resolve();
  }


  get colors() {
    return RAPID_COLORS;
  }

  get datasets() {
    return this._datasets;
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
   * _openBuildingsTitle
   * For #1309 we need to change the dataset titles from
   * 'Google Buildings for <Country>' to 'Google Open Buildings'.
   *
   * All other titles are returned unmodified.
   *
   * @param {*} title string for the dataset
   * @return the same title in most cases, or the proper google buildings title if applicable.
   */
  _openBuildingsTitle(title) {

    if (title.startsWith('Google Buildings for')) {
      return 'Google Open Buildings';
    } else {
      return title;
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
    let toEnable = new Set();
    const newDatasets = currParams.get('datasets');
    const oldDatasets = prevParams.get('datasets');
    if (newDatasets !== oldDatasets) {
      if (typeof newDatasets === 'string') {
        toEnable = new Set(newDatasets.split(','));
      }

      // Update all known datasets
      for (const [datasetID, dataset] of this._datasets) {
        if (toEnable.has(datasetID)) {
          dataset.enabled = true;
          toEnable.delete(datasetID);  // delete marks it as done
        } else {
          dataset.enabled = false;
        }
      }
    }


    // If there are remaining datasets to enable, try to load them from Esri.
    const esri = this.context.services.esri;
    if (!esri || !toEnable.size) return;

    esri.startAsync()
      .then(() => esri.loadDatasetsAsync())
      .then(results => {
        const l10n = this.context.systems.l10n;

        for (const datasetID of toEnable) {
          const d = results[datasetID];
          if (!d) continue;  // dataset with requested id not found, fail silently

          // *** Code here is copied from `rapid_view_manage_datasets.js` `toggleDataset()` ***
          esri.loadLayerAsync(d.id);   // start fetching layer info (the mapping between attributes and tags)

          const isBeta = d.groupCategories.some(cat => cat.toLowerCase() === '/categories/preview');
          const isBuildings = d.groupCategories.some(cat => cat.toLowerCase() === '/categories/buildings');
          const nextColor = this._datasets.size % RAPID_COLORS.length;

          const dataset = {
            id: d.id,
            beta: isBeta,
            added: true,       // whether it should appear in the list
            enabled: true,     // whether the user has checked it on
            conflated: false,
            service: 'esri',
            color: RAPID_COLORS[nextColor],
            dataUsed: ['esri', this._openBuildingsTitle(d.title)],
            label: d.title,
            license_markdown: l10n.t('rapid_feature_toggle.esri.license_markdown')
          };

          if (d.extent) {
            dataset.extent = new Extent(d.extent[0], d.extent[1]);
          }

          // Test running building layers through MapWithAI conflation service
          if (isBuildings) {
            dataset.conflated = true;
            dataset.service = 'mapwithai';
          }

          this._datasets.set(d.id, dataset);  // add it
        }
      });
  }
}
