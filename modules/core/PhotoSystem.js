import { EventEmitter } from '@pixi/utils';


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
export class PhotoSystem extends EventEmitter {

  /**
   * @constructor
   * @param  `context`   Global shared application context
   */
  constructor(context) {
    super();
    this.context = context;

    this._LAYERIDS = ['streetside', 'mapillary', 'mapillary-map-features', 'mapillary-signs', 'kartaview'];
    this._PHOTOTYPES = ['flat', 'panoramic'];
    this._DATEFILTERS = ['fromDate', 'toDate'];
    this._shownPhotoTypes = new Set(this._PHOTOTYPES);
    this._fromDate = null;
    this._toDate = null;
    this._usernames = null;
    this._currLayerID = null;
    this._currPhotoID = null;

    // Ensure methods used as callbacks always have `this` bound correctly.
    this._hashchange = this._hashchange.bind(this);
    this._updateHash = this._updateHash.bind(this);
  }


  /**
   * init
   * Called one time after all objects have been instantiated.
   * Handles initial parsing of the url params, and setup of event listeners
   */
  init() {
// warning, depends on scene, which isn't ready until after first map render.
// for now this init() gets delayed until after ui/init, see context.js
    const context = this.context;
    context.scene().on('layerchange', this._updateHash);
    context.urlHashSystem().on('hashchange', this._hashchange);
  }


  /**
   * _hashchange
   * Respond to any changes appearing in the url hash
   * @param  q   Object containing key/value pairs of the current query parameters
   */
  _hashchange(q) {
    const context = this.context;
    const scene = context.scene();

    // photo_overlay
    // support enabling photo layers by default via a URL parameter, e.g. `photo_overlay=kartaview;mapillary;streetside`
    let toEnableIDs = new Set();
    if (typeof q.photo_overlay === 'string') {
      toEnableIDs = new Set(q.photo_overlay.replace(/;/g, ',').split(','));
    }
    for (const layerID of this._LAYERIDS) {
      const layer = scene.layers.get(layerID);
      if (!layer) continue;
      layer.enabled = toEnableIDs.has(layer.id);
    }

    // photo_dates
    if (typeof q.photo_dates === 'string') {
      // expect format like `photo_dates=2019-01-01_2020-12-31`, but allow a couple different separators
      const parts = /^(.*)[–_](.*)$/g.exec(q.photo_dates.trim());
      this.setDateFilter('fromDate', parts && parts.length >= 2 && parts[1]);
      this.setDateFilter('toDate', parts && parts.length >= 3 && parts[2]);
    } else {
      this._toDate = this._fromDate = null;
    }

    // photo_username
    this.setUsernameFilter(q.photo_username);

    // support opening a specific photo via a URL parameter, e.g. `photo=mapillary/fztgSDtLpa08ohPZFZjeRQ`
    if (typeof q.photo === 'string') {
      const photoIDs = q.photo.replace(/;/g, ',').split(',');
      const photoID = photoIDs.length && photoIDs[0].trim();
      const results = /(.*)\/(.*)/g.exec(photoID);

      if (results && results.length >= 3) {
        const layerID = results[1];
        const photoID = results[2];
        this.selectPhoto(layerID, photoID);
      }
    }
  }


  /**
   * _updateHash
   * Push changes in photo viewer state to the urlhash
   */
  _updateHash() {
    const urlhash = this.context.urlHashSystem();
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
    this._currLayerID = layerID;
    this._currPhotoID = photoID;

    const context = this.context;
    const scene = context.scene();

// we're not listening to photochange, so just manually tell the renderer to select-style it, for now
scene.clearClass('selected');

    if (layerID && photoID) {
      const service = context.services.get(layerID);
      if (!service) return null;

      // If we're selecting a photo then make sure its layer is enabled too.
      scene.enableLayers(layerID);

// we're not listening to photochange, so just manually tell the renderer to select-style it, for now
scene.classData(layerID, photoID, 'selected');

      // Try to show the viewer with the image selected..
      service.loadViewerAsync()
        .then(() => {
          service.selectImage(photoID);
          service.showViewer();
        });
    }

    this._updateHash();
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
      this._updateHash();
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
    this._updateHash();
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
    return layer && layer.enabled;
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
