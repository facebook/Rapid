import { AbstractSystem } from './AbstractSystem.js';


/**
 * `PhotoSystem` maintains the state of the photo viewer
 *
 * Properties available:
 *   `allPhotoTypes`     List of all available photo types ('flat', 'panoramic')
 *   `fromDate`          Current fromDate filter value
 *   `toDate`            Current toDate filter value
 *   `usernames`         Current usernames filter value
 *
 * Events available:
 *   `photochange`       Fires on any change in photo display or filtering options
 */
export class PhotoSystem extends AbstractSystem {

  /**
   * @constructor
   * @param  `context`   Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'photos';
    this.dependencies = new Set(['map', 'urlhash']);

    this._LAYERIDS = ['streetside', 'mapillary', 'mapillary-map-features', 'mapillary-signs', 'kartaview'];
    this._LAYERNAMES = {
      'streetside': 'Bing Streetside',
      'mapillary': 'Mapillary',
      'mapillary-map-features': 'Mapillary Map Features',
      'mapillary-signs': 'Mapillary Street Signs',
      'kartaview': 'KartaView'
    };
    this._PHOTOTYPES = ['flat', 'panoramic'];
    this._DATEFILTERS = ['fromDate', 'toDate'];
    this._shownPhotoTypes = new Set(this._PHOTOTYPES);
    this._fromDate = null;
    this._toDate = null;
    this._usernames = null;
    this._currLayerID = null;
    this._currPhotoID = null;
    this._initPromise = null;
    this._startPromise = null;

    // Ensure methods used as callbacks always have `this` bound correctly.
    this._hashchange = this._hashchange.bind(this);
    this._photoChanged = this._photoChanged.bind(this);
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
    const map = context.systems.map;
    const urlhash = context.systems.urlhash;

    const prerequisites = Promise.all([
      map.initAsync(),   // PhotoSystem should listen for hashchange after MapSystem
      urlhash.initAsync()
    ]);

    return this._initPromise = prerequisites
      .then(() => urlhash.on('hashchange', this._hashchange));
  }


  /**
   * startAsync
   * Called after all core objects have been initialized.
   * @return {Promise} Promise resolved when this component has completed startup
   */
  startAsync() {
    if (this._startPromise) return this._startPromise;

    const map = this.context.systems.map;
    const prerequisites = map.startAsync();  // PhotoSystem should listen for layerchange after scene exists

    return this._startPromise = prerequisites
      .then(() => {
        map.scene.on('layerchange', this._photoChanged);
        this._started = true;
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
   * _hashchange
   * Respond to any changes appearing in the url hash
   * @param  currParams   Map(key -> value) of the current hash parameters
   * @param  prevParams   Map(key -> value) of the previous hash parameters
   */
  _hashchange(currParams, prevParams) {
    const context = this.context;
    const scene = context.scene();

    // photo_overlay
    // support enabling photo layers by default via a URL parameter, e.g. `photo_overlay=kartaview;mapillary;streetside`
    const newPhotoOverlay = currParams.get('photo_overlay');
    const oldPhotoOverlay = prevParams.get('photo_overlay');
    if (newPhotoOverlay !== oldPhotoOverlay) {
      let toEnableIDs = new Set();
      if (typeof newPhotoOverlay === 'string') {
        toEnableIDs = new Set(newPhotoOverlay.replace(/;/g, ',').split(','));
      }
      for (const layerID of this._LAYERIDS) {
        const layer = scene.layers.get(layerID);
        if (!layer) continue;
        layer.enabled = toEnableIDs.has(layer.id);
      }
    }

    // photo_dates
    const newPhotoDates = currParams.get('photo_dates');
    const oldPhotoDates = prevParams.get('photo_dates');
    if (newPhotoDates !== oldPhotoDates) {
      if (typeof newPhotoDates === 'string') {
        // expect format like `photo_dates=2019-01-01_2020-12-31`, but allow a couple different separators
        const parts = /^(.*)[–_](.*)$/g.exec(newPhotoDates.trim());
        this.setDateFilter('fromDate', parts && parts.length >= 2 && parts[1]);
        this.setDateFilter('toDate', parts && parts.length >= 3 && parts[2]);
      } else {
        this._toDate = this._fromDate = null;
      }
    }

    // photo_username
    const newPhotoUsername = currParams.get('photo_username');
    const oldPhotoUsername = prevParams.get('photo_username');
    if (newPhotoUsername !== oldPhotoUsername) {
      this.setUsernameFilter(newPhotoUsername);
    }

    // photo
    // support opening a specific photo via a URL parameter, e.g. `photo=mapillary/fztgSDtLpa08ohPZFZjeRQ`
    const newPhoto = currParams.get('photo');
    const oldPhoto = prevParams.get('photo');
    if (newPhoto !== oldPhoto) {
      if (typeof newPhoto === 'string') {
        const [layerID, photoID] = newPhoto.split('/', 2).filter(Boolean);
        if (layerID && photoID) {
          this.selectPhoto(layerID, photoID);
        } else {
          this.selectPhoto();  // deselect it
        }
      }
    }
  }


  /**
   * _photoChanged
   * Push changes in photo viewer state to the urlhash
   */
  _photoChanged() {
    const urlhash = this.context.systems.urlhash;
    const scene = this.context.scene();

    // photo_overlay
    let enabledIDs = [];
    for (const layerID of this._LAYERIDS) {
      const layer = scene.layers.get(layerID);
      if (layer && layer.supported && layer.enabled) {
        enabledIDs.push(layerID);
      }
    }
    urlhash.setParam('photo_overlay', enabledIDs.length ? enabledIDs.join(',') : null);

    // photo
    let photoString;
    if (this._currLayerID && this._currPhotoID) {
      photoString = `${this._currLayerID}/${this._currPhotoID}`;
    }
    urlhash.setParam('photo', photoString);

    // photo_dates
    let rangeString;
    if (this._fromDate || this._toDate) {
      rangeString = (this._fromDate || '') + '_' + (this._toDate || '');
    }
    urlhash.setParam('photo_dates', rangeString);

    // photo_username
    urlhash.setParam('photo_username', this._usernames ? this._usernames.join(',') : null);
  }


  /**
   * photosUsed
   * @return  {Array}  Array of single element for the photo layer currently enabled
   */
  photosUsed() {
    const layerID = this._currLayerID;
    return layerID ? [ this._LAYERNAMES[layerID] ] : [];
  }


  /**
   * overlayLayerIDs
   * @return   Array of available layer ids
   * @readonly
   */
  get overlayLayerIDs() {
    return this._LAYERIDS;
  }

  /**
   * allPhotoTypes
   * @return  Array of available photo types
   * @readonly
   */
  get allPhotoTypes() {
    return this._PHOTOTYPES;
  }

  /**
   * dateFilters
   * @return  Array of available date filter types
   * @readonly
   */
  get dateFilters() {
    return this._DATEFILTERS;
  }

  /**
   * fromDate
   * @return  The from date filter value, or null if unset
   * @readonly
   */
  get fromDate() {
    return this._fromDate;
  }

  /**
   * toDate
   * @return  The to date filter value, or null if unset
   * @readonly
   */
  get toDate() {
    return this._toDate;
  }

  /**
   * usernames
   * @return  The usernames filter value, or null if unset
   * @readonly
   */
  get usernames() {
    return this._usernames;
  }


  /**
   * selectPhoto
   * Pass `null` or `undefined` to de-select the layer and photo
   * @param   layerID  The layerID to select
   * @param   photoID  The photoID to select
   */
  selectPhoto(layerID = null, photoID = null) {
    if (layerID === this._currLayerID && photoID === this._currPhotoID) return;  // nothing to do

    if (layerID !== null) {
      this._currLayerID = layerID;
    }
    const oldPhotoID = this._currPhotoID;
    this._currPhotoID = photoID;

    const context = this.context;
    const scene = context.scene();

    // renderer is not yet listening to photochange, so just manually tell the renderer to select-style it, for now
    // 'Active' may stay resident if the user clicks off the image onto an OSM entity
    // in which case we still may want to draw the image point differently.
//    scene.clearClass('selected');
    scene.unclassData(layerID, oldPhotoID, 'selected');
    scene.unclassData(layerID, oldPhotoID, 'active');

    // Leave the 'active' class on the photo in the case where we clicked on something besides a photo.
    if (layerID !== null && photoID !== null) {
      scene.clearClass('active');
    }

    if (layerID && photoID) {
      const service = context.services[layerID];
      if (!service) return null;

      // If we're selecting a photo then make sure its layer is enabled too.
      scene.enableLayers(layerID);

      // renderer is not yet listening to photochange, so just manually tell the renderer to select-style it, for now
      scene.classData(layerID, photoID, 'selected');
      scene.classData(layerID, photoID, 'active');

      // Try to show the viewer with the image selected..
      service.startAsync()
        .then(() => service.selectImageAsync(photoID))
        .then(() => service.showViewer());
    }

    this._photoChanged();
    this.emit('photochange');
  }


  /**
   * dateFilterValue
   * Gets a date filter value
   * @param   val  'fromDate' or 'toDate'
   * @return  The from date or to date value, or `null` if unset
   */
  dateFilterValue(val) {
    if (val === 'fromDate') return this._fromDate;
    if (val === 'toDate') return this._toDate;
    return null;
  }


  /**
   * setDateFilter
   * Sets a date filter value
   * @param   type   'fromDate' or 'toDate'
   * @param   val    the value to set it to
   */
  setDateFilter(type, val) {
    // validate the date
    let date = val && new Date(val);
    if (date && !isNaN(date)) {
      val = date.toISOString().slice(0, 10);
    } else {
      val = null;
    }

    let didChange = false;
    if (type === 'fromDate') {
      this._fromDate = val;
      didChange = true;
      if (this._fromDate && this._toDate && new Date(this._toDate) < new Date(this._fromDate)) {
        this._toDate = this._fromDate;
      }
    }
    if (type === 'toDate') {
      this._toDate = val;
      didChange = true;
      if (this._fromDate && this._toDate && new Date(this._toDate) < new Date(this._fromDate)) {
        this._fromDate = this._toDate;
      }
    }

    if (didChange) {
      this._photoChanged();
      this.emit('photochange');
    }
  }


  /**
   * setUsernameFilter
   * Sets a username filter value
   * @param   val    The value to set it to
   */
  setUsernameFilter(val) {
    if (val && typeof val === 'string') {
      val = val.replace(/;/g, ',').split(',');
    }
    if (val) {
      val = val.map(d => d.trim()).filter(Boolean);
      if (!val.length) {
        val = null;
      }
    }
    this._usernames = val;
    this._photoChanged();
    this.emit('photochange');
  }


  /**
   * togglePhotoType
   * Toggles a photo type display on/off
   * @param   which  String phototype to toggle on/off ('flat', or 'panoramic')
   */
  togglePhotoType(which) {
    if (!this._PHOTOTYPES.includes(which)) return;

    if (this._shownPhotoTypes.has(which)) {
      this._shownPhotoTypes.delete(which);
    } else {
      this._shownPhotoTypes.add(which);
    }
    this.emit('photochange');
  }


  _showsLayer(layerID) {
    const layer = this.context.scene().layers.get(layerID);
    return layer?.enabled;
  }

  shouldFilterByDate() {
    return this._showsLayer('mapillary') || this._showsLayer('kartaview') || this._showsLayer('streetside');
  }
  shouldFilterByPhotoType() {
    return this._showsLayer('mapillary') || (this._showsLayer('streetside') && this._showsLayer('kartaview'));
  }
  shouldFilterByUsername() {
    return !this._showsLayer('mapillary') && this._showsLayer('kartaview') && !this._showsLayer('streetside');
  }
  showsPhotoType(val) {
    if (!this.shouldFilterByPhotoType()) return true;
    return this._shownPhotoTypes.has(val);
  }
  showsFlat() {
    return this.showsPhotoType('flat');
  }
  showsPanoramic() {
    return this.showsPhotoType('panoramic');
  }
}
