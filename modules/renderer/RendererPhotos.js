import { EventEmitter } from '@pixi/utils';
import { utilQsString, utilStringQs } from '@id-sdk/util';

import { services } from '../services';


/**
 * `RendererPhotos` maintains the state of the photo viewer
 *
 * Properties available:
 *   `overlayLayerIDs`   List of the layer ids
 *   `allPhotoTypes`     List of all available photo types ('flat', 'panoramic')
 *   `fromDate`          Current fromDate filter value
 *   `toDate`            Current toDate filter value
 *   `usernames`         Current usernames filter value
 *
 * Events available:
 *   `photochange`       Fires on any change in photo display or filtering options
 */
export class RendererPhotos extends EventEmitter {

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

    // Ensure methods used as callbacks always have `this` bound correctly.
    this._updateLayers = this._updateLayers.bind(this);
  }


  /**
   * init
   * Called one time after all objects have been instantiated.
   * Handles initial parsing of the url params, and setup of event listeners
   */
  init() {
    const context = this.context;
    const scene = context.scene();
    scene.on('layerchange', this._updateLayers);

    // parse hash params
    const hash = context.urlhash().initialHashParams;

    const photo_dates = hash.get('photo_dates');
    if (typeof photo_dates === 'string') {
      // expect format like `photo_dates=2019-01-01_2020-12-31`, but allow a couple different separators
      const parts = /^(.*)[–_](.*)$/g.exec(photo_dates.trim());
      this.setDateFilter('fromDate', parts && parts.length >= 2 && parts[1], false);
      this.setDateFilter('toDate', parts && parts.length >= 3 && parts[2], false);
    }

    const photo_username = hash.get('photo_username');
    if (typeof photo_username === 'string') {
      this.setUsernameFilter(photo_username, false);
    }

    // support enabling photo layers by default via a URL parameter, e.g. `photo_overlay=kartaview;mapillary;streetside`
    const photo_overlay = hash.get('photo_overlay');
    if (typeof photo_overlay === 'string') {
      const hashOverlayIDs = photo_overlay.replace(/;/g, ',').split(',');
      scene.enableLayers(hashOverlayIDs);
    }

    // support opening a specific photo via a URL parameter, e.g. `photo=mapillary-fztgSDtLpa08ohPZFZjeRQ`
    const photo = hash.get('photo');
    if (typeof photo === 'string') {
      const photoIDs = photo.replace(/;/g, ',').split(',');
      const photoID = photoIDs.length && photoIDs[0].trim();
      const results = /(.*)\/(.*)/g.exec(photoID);

      if (results && results.length >= 3) {
        const serviceID = results[1];
        const photoKey = results[2];
        const service = services[serviceID];
        if (!service || !service.loadViewerAsync) return;

        // if we're showing a photo then make sure its layer is enabled too
        scene.enableLayers(serviceID);

        const startTime = Date.now();
        service.on('loadedImages.rendererPhotos', () => {
          // don't open the viewer if too much time has elapsed
          if (Date.now() - startTime > 45000) {
            service.on('loadedImages.rendererPhotos', null);
            return;
          }

          if (!service.cachedImage(photoKey)) return;

          service.on('loadedImages.rendererPhotos', null);
          service.loadViewerAsync(context)
            .then(() => {
              service
                .selectImage(context, photoKey)
                .showViewer(context);
            });
        });
      }
    }
  }


  /**
   * _updateLayers
   * Update the hash to include which layers are currently enabled
   */
  _updateLayers() {
    const urlhash = this.context.urlhash();

    let enabled = [];
    for (const layer of this.context.scene().layers.values()) {
      if (this._LAYERIDS.includes(layer.id) && layer.supported && layer.enabled) {
        enabled.push(layer.id);
      }
    }

    const val = enabled.length ? enabled.join(',') : null;
    urlhash.setParam('photo_overlay', val);
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
   * @param   type        'fromDate' or 'toDate'
   * @param   val         the value to set it to
   * @param   updateURL   if `true` update the url hash also
   */
  setDateFilter(type, val, updateURL) {
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
      if (updateURL) {
        let rangeString;
        if (this._fromDate || this._toDate) {
          rangeString = (this._fromDate || '') + '_' + (this._toDate || '');
        }
        const urlhash = this.context.urlhash();
        urlhash.setParam('photo_dates', rangeString);
      }
      this.emit('photochange');
    }
  }


  /**
   * setUsernameFilter
   * Sets a username filter value
   * @param   val         The value to set it to
   * @param   updateURL   If `true` update the url hash also
   */
  setUsernameFilter(val, updateURL) {
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

    if (updateURL) {
      const usernames = this._usernames ? this._usernames.join(',') : null;
      const urlhash = this.context.urlhash();
      urlhash.setParam('photo_username', usernames);
    }

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
