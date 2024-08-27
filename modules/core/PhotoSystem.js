import { Extent } from '@rapid-sdk/math';

import { AbstractSystem } from './AbstractSystem.js';


/**
 * `PhotoSystem` maintains the state of the photo viewer.
 *
 * Properties available:
 *   `fromDate`              Current fromDate filter value
 *   `toDate`                Current toDate filter value
 *   `usernames`             Current usernames filter value
 *   `currPhotoID`           Current PhotoID
 *   `currPhotoLayerID`      Current Photo LayerID
 *   `currDetectionID`       Current DetectionID
 *   `currDetectionLayerID`  Current Detection LayerID
 *
 * Events available:
 *   `photochange`   Fires on any change in selected photo, detection, or filtering options
 */
export class PhotoSystem extends AbstractSystem {

  /**
   * @constructor
   * @param  `context`   Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'photos';
    this.dependencies = new Set(['map', 'urlhash', 'ui']);

    this._currPhotoLayerID = null;
    this._currPhotoID = null;
    this._currDetectionLayerID = null;
    this._currDetectionID = null;

    this._filterPhotoTypes = new Set(this.photoTypes);
    this._filterFromDate = null;
    this._filterToDate = null;
    this._filterUsernames = null;

    this._initPromise = null;
    this._startPromise = null;

    // Ensure methods used as callbacks always have `this` bound correctly.
    this._hashchange = this._hashchange.bind(this);
    this._layerchange = this._layerchange.bind(this);
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
        map.scene.on('layerchange', this._layerchange);
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
      for (const layerID of this.layerIDs) {
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
        this._filterToDate = this._filterFromDate = null;
      }
    }

    // photo_username
    const newPhotoUsername = currParams.get('photo_username');
    const oldPhotoUsername = prevParams.get('photo_username');
    if (newPhotoUsername !== oldPhotoUsername) {
      this.setUsernameFilter(newPhotoUsername);
    }

    // photo
    // support opening a specific photo via a URL parameter, e.g. `photo=mapillary/<photoID>`
    const newPhoto = currParams.get('photo') || '';
    const oldPhoto = prevParams.get('photo') || '';
    if (newPhoto !== oldPhoto) {
      const [layerID, photoID] = newPhoto.split('/', 2).filter(Boolean);
      if (layerID && photoID) {
        this.selectPhoto(layerID, photoID);
      } else {
        this.selectPhoto();  // deselect
      }
    }

    // detections
    // support opening a specific detection via a URL parameter, e.g. `detection=mapillary-detections/<detectionID>`
    const newDetection = currParams.get('detection') || '';
    const oldDetection = prevParams.get('detection') || '';
    if (newDetection !== oldDetection) {
      const [layerID, detectionID] = newDetection.split('/', 2).filter(Boolean);
      if (layerID && detectionID) {
        this.selectDetection(layerID, detectionID);
      } else {
        this.selectDetection();  // deselect
      }
    }
  }


  /**
   * _layerchange
   * Respond to any changes in the layers that are enabled
   */
  _layerchange() {
    const context = this.context;
    const scene = context.scene();

    // Update detections
    // If there is a currently selected detection, return to browse mode.
    for (const layerID of this.detectionLayerIDs) {
      const layer = scene.layers.get(layerID);
      if (!layer.enabled && this._currDetectionLayerID === layerID) {
        context.enter('browse');
        this.selectDetection();  // deselect
      }
    }

    // Update photos
    // If there is a current photo layer, refresh it by calling `selectPhoto` again.
    // (Maybe the detections layers changed, and we need to redraw the viewer
    // to remove the highlighting or make the segmentations appear or disappear)
    let enabledCount = 0;
    for (const layerID of this.photoLayerIDs) {
      const layer = scene.layers.get(layerID);
      if (layer.enabled) {
        enabledCount++;
      }
      if (layerID === this._currPhotoLayerID) {
        if (layer.enabled) {
          this.selectPhoto(this._currPhotoLayerID, this._currPhotoID);  // keep selection
        } else {
          this.selectPhoto();  // deselect
        }
      }
    }

    if (!enabledCount) {  // no photo layers enabled, hide the viewer
      this.hideViewer();
    }
  }


  /**
   * _photoChanged
   * Push changes in photo viewer state to the urlhash
   */
  _photoChanged() {
    const context = this.context;
    const urlhash = context.systems.urlhash;
    const scene = context.scene();

    // photo_overlay
    let enabledIDs = [];
    for (const layerID of this.layerIDs) {
      const layer = scene.layers.get(layerID);
      if (layer && layer.supported && layer.enabled) {
        enabledIDs.push(layerID);
      }
    }
    urlhash.setParam('photo_overlay', enabledIDs.length ? enabledIDs.join(',') : null);

    // photo_dates
    let rangeString;
    if (this._filterFromDate || this._filterToDate) {
      rangeString = (this._filterFromDate || '') + '_' + (this._filterToDate || '');
    }
    urlhash.setParam('photo_dates', rangeString);

    // photo_username
    urlhash.setParam('photo_username', this._filterUsernames ? this._filterUsernames.join(',') : null);

    // current photo
    let photoString;
    if (this._currPhotoLayerID && this._currPhotoID) {
      photoString = `${this._currPhotoLayerID}/${this._currPhotoID}`;
    }
    urlhash.setParam('photo', photoString);

    // current detection
    let detectionString;
    if (this._currDetectionLayerID && this._currDetectionID) {
      detectionString = `${this._currDetectionLayerID}/${this._currDetectionID}`;
    }
    urlhash.setParam('detection', detectionString);

    this.emit('photochange');
  }


  /**
   * photosUsed
   * Called by the EditSystem to gather the sources being used to make an edit.
   * We can return the English names of:
   *  - current photo layer (if showing a photo)
   *  - current detection layer (if showing a detection)
   * These strings will be included in the user's changeset as sources.
   * @return  {Array<string>}  Array of layers currently being used.
   */
  photosUsed() {
    // These are the English layer names that will appear in the changeset tag if the layer is used.
    const LAYERNAMES = {
      'streetside': 'Bing Streetside',
      'mapillary': 'Mapillary',
      'mapillary-detections': 'Mapillary Detected Objects',
      'mapillary-signs': 'Mapillary Traffic Signs',
      'kartaview': 'KartaView'
    };

    const results = [];

    if (this._currPhotoLayerID && this._currPhotoID) {
      results.push(LAYERNAMES[this._currPhotoLayerID]);
    }
    if (this._currDetectionLayerID && this._currDetectionID) {
      results.push(LAYERNAMES[this._currDetectionLayerID]);
    }

    return results;
  }


  /**
   * layerIDs
   * @return   {Array<string>} All available layerIDs
   * @readonly
   */
  get layerIDs() {
    return ['streetside', 'mapillary', 'mapillary-detections', 'mapillary-signs', 'kartaview'];
  }

  /**
   * photoLayerIDs
   * @return   {Array<string>} All available photo layerIDs
   * @readonly
   */
  get photoLayerIDs() {
    return ['streetside', 'mapillary', 'kartaview'];
  }

  /**
   * detectionLayerIDs
   * @return   {Array<string>} All available detection layerIDs
   * @readonly
   */
  get detectionLayerIDs() {
    return ['mapillary-detections', 'mapillary-signs'];
  }

  /**
   * photoTypes
   * @return   {Array<string>} All available photo types
   * @readonly
   */
  get photoTypes() {
    return ['flat', 'panoramic'];
  }

  /**
   * dateFilters
   * @return   {Array<string>} All available date filters
   * @readonly
   */
  get dateFilters() {
    return ['fromDate', 'toDate'];
  }

  /**
   * fromDate
   * @return  The from date filter value, or null if unset
   * @readonly
   */
  get fromDate() {
    return this._filterFromDate;
  }

  /**
   * toDate
   * @return  The to date filter value, or null if unset
   * @readonly
   */
  get toDate() {
    return this._filterToDate;
  }

  /**
   * usernames
   * @return  The usernames filter value, or null if unset
   * @readonly
   */
  get usernames() {
    return this._filterUsernames;
  }

  /**
   * currPhotoLayerID
   * @return  {string} The current photo layerID
   * @readonly
   */
  get currPhotoLayerID() {
    return this._currPhotoLayerID;
  }

  /**
   * currPhotoID
   * @return  {string} The current photoID
   * @readonly
   */
  get currPhotoID() {
    return this._currPhotoID;
  }

  /**
   * currDetectionLayerID
   * @return  {string} The current detection layerID
   * @readonly
   */
  get currDetectionLayerID() {
    return this._currDetectionLayerID;
  }

  /**
   * currDetectionID
   * @return  {string} The current detectionID
   * @readonly
   */
  get currDetectionID() {
    return this._currDetectionID;
  }


  /**
   * selectPhoto
   * Pass falsy values to deselect the layer and photo.
   * @param {string}  layerID? - The layerID to select
   * @param {string}  photoID? - The photoID to select
   */
  selectPhoto(layerID = null, photoID = null) {
    const context = this.context;
    const map = context.systems.map;
    const scene = map.scene;

    const didChange = (this._currPhotoLayerID !== layerID || this._currPhotoID !== photoID);

    // If we're selecting a photo then make sure its layer is enabled too.
    if (this.photoLayerIDs.includes(layerID) && !this.isLayerEnabled(layerID)) {
      scene.enableLayers(layerID);
      return;  // exit to avoid infinite loop, we will be right back in here via `_layerchange` handler.
    }

    // Clear out any existing selection..
    this._currPhotoLayerID = null;
    this._currPhotoID = null;
    scene.clearClass('selectphoto');

    // Apply the new selection..
    if (photoID && this.photoLayerIDs.includes(layerID)) {
      const service = context.services[layerID];
      if (!service) return;

      this._currPhotoLayerID = layerID;
      this._currPhotoID = photoID;
      scene.setClass('selectphoto', layerID, photoID);

      // Try to show the viewer with the image selected..
      service.selectImageAsync(photoID)
        .then(photo => {
          if (!photo) return;
          if (photo.id !== this._currPhotoID) return;  // exit if something else is now selected
          if (this._currDetectionID) return;  // don't adjust the map if a detection is already selected

          if (didChange) {
            map.centerEase(photo.loc);
          }
        })
        .then(() => this.showViewer());
    }

    this._photoChanged();
  }


  /**
   * selectDetection
   * Pass falsy values to deselect the layer and detection.
   * @param {string}  layerID?     - The layerID to select
   * @param {string}  detectionID? - The detectionID to select
   */
  selectDetection(layerID = null, detectionID = null) {
    const context = this.context;
    const map = context.systems.map;
    const scene = map.scene;

    // Clear out any existing selection..
    this._currDetectionLayerID = null;
    this._currDetectionID = null;
    scene.clearClass('selectdetection');
    scene.clearClass('highlightphoto');

    // Apply the new selection..
    if (detectionID && this.detectionLayerIDs.includes(layerID)) {
      const photoLayerID = layerID.split('-')[0];     // e.g. 'mapillary-signs' -> 'mapillary'
      const service = context.services[photoLayerID];
      if (!service) return;

      this._currDetectionLayerID = layerID;
      this._currDetectionID = detectionID;

      // If we're selecting a detection then make sure its layer is enabled too.
      scene.enableLayers(layerID);
      scene.setClass('selectdetection', layerID, detectionID);

      // Try to highlight any photos that show this detection,
      // And try to select a photo in the viewer that shows it.
      service.selectDetectionAsync(detectionID)
        .then(detection => {
          if (!detection) return;
          if (detection.id !== this._currDetectionID) return;  // exit if something else is now selected

          // Handle the situation where we want to select a detection,
          // but we haven't properly entered SelectMode yet.
          // This can happen if the detection arrived in the URL hash.
          if (!context.selectedData().has(detection.id)) {
            const selection = new Map().set(detection.id, detection);
            context.enter('select', { selection: selection });
            return;  // exit to avoid infinite loop - entering select mode will bring us right back in here.
          }

          // Highlight any images that show this detection..
          const highlightPhotoIDs = detection.imageIDs ?? [];
          for (const photoID of highlightPhotoIDs) {
            scene.setClass('highlightphoto', photoLayerID, photoID);
          }

          // Try to select a photo that shows this detection..
          // - If the current photo already shows it, keep it selected
          // - Otherwise choose the "best" photo suggested by the detection
          // - Otherwise no selected photo.
          let bestPhotoID;
          if (this._currPhotoLayerID === photoLayerID && highlightPhotoIDs.includes(this._currPhotoID)) {
            bestPhotoID = this._currPhotoID;
          } else {
            bestPhotoID = detection.bestImageID;
          }

          // If we are changing the selected photo to a new photo,
          // Try to adjust the map to show both the detection and the best photo (if any)
          if (!this._currPhotoID || this._currPhotoID !== bestPhotoID) {
            const extent = new Extent(detection.loc);
            const bestPhoto = service.getImage(bestPhotoID);
            if (bestPhoto?.loc) {
              extent.extendSelf(bestPhoto.loc);
            }

            // Need to zoom out a little to see both things?
            const needZoom = map.trimmedExtentZoom(extent) - 0.5;  // little extra so the things aren't at the map edges
            const currZoom = context.viewport.transform.zoom;
            map.centerZoomEase(extent.center(), Math.min(needZoom, currZoom));
          }

          // Select the best photo (if any)
          this.selectPhoto(photoLayerID, bestPhotoID);
        });

    // If there is now no detection selected, we should still refresh the viewer,
    // in case it needs to replace any detection highlights or segmentations..
    } else {
      this.selectPhoto(this._currPhotoLayerID, this._currPhotoID);  // keep selection
    }

    this._photoChanged();
  }


  /**
   * dateFilterValue
   * Gets a date filter value
   * @param   val  'fromDate' or 'toDate'
   * @return  The from date or to date value, or `null` if unset
   */
  dateFilterValue(val) {
    if (val === 'fromDate') return this._filterFromDate;
    if (val === 'toDate') return this._filterToDate;
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
      this._filterFromDate = val;
      didChange = true;
      if (this._filterFromDate && this._filterToDate && new Date(this._filterToDate) < new Date(this._filterFromDate)) {
        this._filterToDate = this._filterFromDate;
      }
    }
    if (type === 'toDate') {
      this._filterToDate = val;
      didChange = true;
      if (this._filterFromDate && this._filterToDate && new Date(this._filterToDate) < new Date(this._filterFromDate)) {
        this._filterFromDate = this._filterToDate;
      }
    }

    if (didChange) {
      this._photoChanged();
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
    this._filterUsernames = val;
    this._photoChanged();
  }


  /**
   * togglePhotoType
   * Toggles a photo type display on/off
   * @param   which  String phototype to toggle on/off ('flat', or 'panoramic')
   */
  togglePhotoType(which) {
    if (!this.photoTypes.includes(which)) return;

    if (this._filterPhotoTypes.has(which)) {
      this._filterPhotoTypes.delete(which);
    } else {
      this._filterPhotoTypes.add(which);
    }
    this._photoChanged();
  }


  /**
   * isLayerEnabled
   * Is the given layerID enabled?
   * @param  {string}   layerID - the layerID to check
   * @return {boolean}  `true` if enabled, `false` if not
   */
  isLayerEnabled(layerID) {
    const layer = this.context.scene().layers.get(layerID);
    return layer?.enabled;
  }


  /**
   * showViewer
   * Show the photo viewer
   */
  showViewer() {
    const context = this.context;
    const layerID = this._currPhotoLayerID;
    const photoID = this._currPhotoID;
    if (!layerID || !photoID) return;   // nothing to show

    const service = context.services[layerID];
    service?.showViewer();
  }


  /**
   * hideViewer
   * Hide the photo viewer.  If the viewer was showing a photo, deselect the photo.
   */
  hideViewer() {
    for (const layerID of this.photoLayerIDs) {
      if (layerID === this._currPhotoLayerID) {
        this.selectPhoto();  // deselect
      }
      const service = this.context.services[layerID];
      service?.hideViewer();
    }
  }


  /**
   * isViewerShowing
   * @return {boolean} `true` if showing, `false` if not
   */
  isViewerShowing() {
    // viewer exists and is not hidden
    const $viewer = this.context.container().selectAll('.photoviewer');
    return $viewer.size() && !$viewer.classed('hide');
  }


  shouldFilterByDate() {
    return this.isLayerEnabled('mapillary') || this.isLayerEnabled('kartaview') || this.isLayerEnabled('streetside');
  }
  shouldFilterByPhotoType() {
    return this.isLayerEnabled('mapillary') || (this.isLayerEnabled('streetside') && this.isLayerEnabled('kartaview'));
  }
  shouldFilterByUsername() {
    return !this.isLayerEnabled('mapillary') && this.isLayerEnabled('kartaview') && !this.isLayerEnabled('streetside');
  }
  showsPhotoType(val) {
    if (!this.shouldFilterByPhotoType()) return true;
    return this._filterPhotoTypes.has(val);
  }
  showsFlat() {
    return this.showsPhotoType('flat');
  }
  showsPanoramic() {
    return this.showsPhotoType('panoramic');
  }
}
