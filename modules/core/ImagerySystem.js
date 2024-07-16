import { geoMetersToOffset, geoOffsetToMeters } from '@rapid-sdk/math';
import whichPolygon from 'which-polygon';

import { AbstractSystem } from './AbstractSystem.js';
import {
  ImagerySource, ImagerySourceBing, ImagerySourceCustom,
  ImagerySourceEsri, ImagerySourceEsriWayback, ImagerySourceNone
} from './lib/ImagerySource.js';


/**
 * `ImagerySystem` maintains the state of the tiled background and overlay imagery.
 *
 * Properties available:
 *   `offset`
 *   `brightness`
 *   `contrast`
 *   `saturation`
 *   `sharpness`
 *   `numGridSplits`
 *
 * Events available:
 *   `imagerychange`     Fires on any change in imagery or display options
 */
export class ImagerySystem extends AbstractSystem {

  /**
   * @constructor
   * @param  `context`   Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'imagery';
    this.dependencies = new Set(['assets', 'editor', 'l10n', 'map', 'urlhash']);

    this._initPromise = null;
    this._imageryIndex = null;
//    this._waybackImageryIndex = null;
    this._baseLayer = null;
    this._overlayLayers = new Map();   // Map (sourceID -> source)
    this._checkedBlocklists = [];
    this._isValid = true;    // todo, find a new way to check this, no d3 enter/update render anymore

    this._brightness = 1;
    this._contrast = 1;
    this._saturation = 1;
    this._sharpness = 1;
    this._numGridSplits = 0; // No grid by default.

    // Ensure methods used as callbacks always have `this` bound correctly.
    this._hashchange = this._hashchange.bind(this);
    this._imageryChanged = this._imageryChanged.bind(this);
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
    const assets = context.systems.assets;
    const map = context.systems.map;
    const storage = context.systems.storage;
    const urlhash = context.systems.urlhash;

    const prerequisites = Promise.all([
      map.initAsync(),   // ImagerySystem should listen for hashchange after MapSystem
      assets.initAsync(),
      storage.initAsync(),
      urlhash.initAsync()
    ]);

    return this._initPromise = prerequisites
      .then(() => urlhash.on('hashchange', this._hashchange))
      .then(() => assets.loadAssetAsync('imagery'))
      .then(data => this._initImageryIndex(data))
      .then(() => this._initWaybackAsync());
      // .catch(e => {
        // if (e instanceof Error) console.error(e);  // eslint-disable-line no-console
      // });
  }


  /**
   * _initImageryIndex
   * Set up the imagery index after it has been downloaded
   * It contains these properties:
   *   {
   *     features:  Map(id -> GeoJSON feature)
   *     sources:   Map(id -> ImagerySource)
   *     query:     A which-polygon index to perform spatial queries against
   *   }
   *  @param  data  {Object}  imagery index data
   */
  _initImageryIndex(data) {
    const context = this.context;
    const arr = data.imagery || [];

    this._imageryIndex = {
      features: new Map(),   // Map(id -> GeoJSON feature)
      sources: new Map(),    // Map(id -> ImagerySource)
      query: null            // which-polygon index
    };

    // Extract a GeoJSON feature for each imagery item.
    const features = arr.map(d => {
      if (!d.polygon) return null;

      // workaround for editor-layer-index weirdness..
      // Add an extra array nest to each element in `d.polygon`
      // so the rings are not treated as a bunch of holes:
      //   what we get:  [ [[outer],[hole],[hole]] ]
      //   what we want: [ [[outer]],[[outer]],[[outer]] ]
      const rings = d.polygon.map(ring => [ring]);

      const feature = {
        type: 'Feature',
        properties: { id: d.id },
        geometry: { type: 'MultiPolygon', coordinates: rings }
      };

      this._imageryIndex.features.set(d.id.toLowerCase(), feature);
      return feature;
    }).filter(Boolean);

    // Create a which-polygon index to support efficient spatial querying.
    this._imageryIndex.query = whichPolygon({ type: 'FeatureCollection', features: features });

    // Instantiate `ImagerySource` objects for each imagery item.
    for (const d of arr) {
      let source;
      if (d.type === 'bing') {
        source = new ImagerySourceBing(context, d);
      } else if (/^EsriWorldImagery/.test(d.id)) {
        source = new ImagerySourceEsri(context, d);
      } else {
        source = new ImagerySource(context, d);
      }
      this._imageryIndex.sources.set(d.id.toLowerCase(), source);

      // Add 'EsriWayback' as a special copy of 'EsriWorldImagery'
      if (d.id === 'EsriWorldImagery') {
        const props = Object.assign({}, d);
        props.id = 'EsriWayback';
        props.name = 'Esri Wayback';
        props.description = 'Esri Wayback contains archived snapshots of Esri World Imagery created over time.';
        props.startDate = null;  // user will choose
        props.endDate = null;    // user will choose
        const wayback = new ImagerySourceEsriWayback(context, props);
        this._imageryIndex.sources.set(props.id.toLowerCase(), wayback);
      }
    }

    // Add 'None'
    const none = new ImagerySourceNone(context);
    this._imageryIndex.sources.set(none.id.toLowerCase(), none);

    // Add 'Custom' - seed it with whatever template the user has used previously
    const custom = new ImagerySourceCustom(context);
    const storage = this.context.systems.storage;
    custom.template = storage.getItem('background-custom-template') || '';
    this._imageryIndex.sources.set(custom.id.toLowerCase(), custom);

    // Default the locator overlay to "on"..
    const locator = this._imageryIndex.sources.get('mapbox_locator_overlay');
    if (locator) {
      this.toggleOverlayLayer(locator);
    }
  }


  /**
   * _initWaybackAsync
   * Fetch all available Wayback imagery sources and load them into the special Wayback source.
   * If there is no wayback imagery source, or the wayback data is not available, just resolve anyway.
   * @return {Promise} Promise resolved when this data has been loaded
   */
  _initWaybackAsync() {
    const wayback = this.getSourceByID('EsriWayback');
    return wayback ? wayback.initWaybackAsync() : Promise.resolve();
  }


  /**
   * startAsync
   * Called after all core objects have been initialized.
   * @return {Promise} Promise resolved when this component has completed startup
   */
  startAsync() {
    if (this._startPromise) return this._startPromise;

    const map = this.context.systems.map;
    const prerequisites = map.startAsync();  // ImagerySystem should listen for layerchange after scene exists

    return this._startPromise = prerequisites
      .then(() => {
        map.scene.on('layerchange', this._imageryChanged);
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
    // background
    const newBackground = currParams.get('background');
    const oldBackground = prevParams.get('background');
    if (!newBackground || newBackground !== oldBackground) {
      let foundSource;
      if (typeof newBackground === 'string') {
        foundSource = this.getSourceByID(newBackground);
      }
      if (foundSource) {
        this.setSourceByID(newBackground);
      } else {
        this.baseLayerSource(this.chooseDefaultSource());
      }
    }

    // overlays
    const newOverlays = currParams.get('overlays');
    const oldOverlays = prevParams.get('overlays');
    if (newOverlays !== oldOverlays) {
      let toEnableIDs = new Set();
      if (typeof newOverlays === 'string') {
        const vals = newOverlays.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        toEnableIDs = new Set(vals);
      }
      this.enableOverlayLayers(toEnableIDs);
    }

    // offset
    const newOffset = currParams.get('offset');
    const oldOffset = prevParams.get('offset');
    if (newOffset !== oldOffset) {
      let x, y;
      if (typeof newOffset === 'string') {
        [x, y] = newOffset.replace(/;/g, ',').split(',').map(s => s.trim()).map(Number);
      }
      if (isNaN(x) || !isFinite(x)) x = 0;
      if (isNaN(y) || !isFinite(y)) y = 0;
      this.offset = geoMetersToOffset([x, y]);
    }
  }


  /**
   *  _imageryChanged
   *  Called whenever the imagery changes
   *  Also used to push changes in imagery state to the urlhash
   */
  _imageryChanged() {
    const baseLayer = this._baseLayer;
    if (this.context.inIntro || !baseLayer) return;

    // Gather info about enabled base imagery
    let baseLayerID = baseLayer.key;  // note: use `key` here - for Wayback it will include the date
    if (baseLayerID === 'custom') {
      baseLayerID = `custom:${baseLayer.template}`;
    }

    // Gather info about enabled overlay imagery (ignore locator)
    let overlayIDs = [];
    for (const overlay of this._overlayLayers.values()) {
      if (overlay.isLocatorOverlay()) continue;
      overlayIDs.push(overlay.id);
    }

    // Update hash params: 'background', 'overlays', 'offset'
    const urlhash = this.context.systems.urlhash;
    urlhash.setParam('background', baseLayerID);
    urlhash.setParam('overlays', overlayIDs.length ? overlayIDs.join(',') : null);

    const meters = geoOffsetToMeters(baseLayer.offset);
    const EPSILON = 0.01;
    const x = +meters[0].toFixed(2);
    const y = +meters[1].toFixed(2);
    urlhash.setParam('offset', (Math.abs(x) > EPSILON || Math.abs(y) > EPSILON) ? `${x},${y}` : null);
  }


  /**
   *  imageryUsed
   *  @return  {Array}  Array of imagery layers currently enabled
   */
  imageryUsed() {
    const result = new Set();

    // Gather info about enabled base imagery
    const baseUsed = this._baseLayer?.imageryUsed;
    if (baseUsed && this._isValid) {
      result.add(baseUsed);
    }

    // Gather info about enabled overlay imagery (ignore locator)
    for (const overlay of this._overlayLayers.values()) {
      if (overlay.isLocatorOverlay()) continue;
      if (overlay.imageryUsed) {
        result.add(overlay.imageryUsed);
      }
    }

    return Array.from(result);
  }


  /**
   *  visibleSources
   *  Returns array of known imagery sources that are valid at the given extent and zoom
   *  @return  Array
   */
  visibleSources() {
    if (!this._imageryIndex) return [];   // called before init()?

    const context = this.context;
    const viewport = context.viewport;
    const extent = viewport.visibleExtent();
    const zoom = viewport.transform.zoom;

    const visible = new Set();
    (this._imageryIndex.query.bbox(extent.rectangle(), true) || [])
      .forEach(d => visible.add(d.id));

    const currSource = this._baseLayer;
    const sources = [...this._imageryIndex.sources.values()];

    // Recheck blocked sources only if we detect new blocklists pulled from the OSM API.
    const osm = context.services.osm;
    const blocklists = osm?.imageryBlocklists ?? [];
    const blocklistChanged = (blocklists.length !== this._checkedBlocklists.length) ||
      blocklists.some((regex, index) => String(regex) !== this._checkedBlocklists[index]);

    if (blocklistChanged) {
      for (const source of sources) {
        source.isBlocked = blocklists.some(regex => regex.test(source.template));
      }
      this._checkedBlocklists = blocklists.map(regex => String(regex));
    }

    return sources.filter(source => {
      if (currSource === source) return true;  // always include the current imagery
      if (source.isBlocked) return false;      // even bundled sources may be blocked - iD#7905
      if (!source.polygon) return true;        // always include imagery with worldwide coverage
      if (zoom && zoom < 6) return false;      // optionally exclude local imagery at low zooms
      return visible.has(source.id);           // include imagery visible in given extent
    });
  }


  /**
   *
   */
  baseLayerSource(source) {
    if (!arguments.length) return this._baseLayer;

    // test source against OSM imagery blocklists..
    const osm = this.context.services.osm;
    if (!osm) return this;

    const blocklists = osm?.imageryBlocklists ?? [];
    const template = source.template;
    let fail = false;
    let tested = 0;
    let regex;

    for (regex of blocklists) {
      fail = regex.test(template);
      tested++;
      if (fail) break;
    }

    // ensure at least one test was run.
    if (!tested) {
      regex = /.*\.google(apis)?\..*\/(vt|kh)[\?\/].*([xyz]=.*){3}.*/;
      fail = regex.test(template);
    }

    this._baseLayer = (!fail ? source : this.getSourceByID('none'));

    this._imageryChanged();
    this.emit('imagerychange');
    return this;
  }


  /**
   * chooseDefaultSource
   * When we haven't been told to use a specific background imagery,
   * this tries several options to pick an appropriate imagery to use.
   */
  chooseDefaultSource() {
    const context = this.context;
    const storage = context.systems.storage;

    const available = this.visibleSources();
    const first = available[0];
    const best = available.find(s => s.best);

    // Consider previously chosen imagery unless it was 'none'
    let previousID = storage.getItem('background-last-used') || 'none';
    const previous = (previousID !== 'none') && this.getSourceByID(previousID);

    return best ||
      previous ||
      this.getSourceByID('Bing') ||
      first ||    // maybe this is a custom Rapid that doesn't include Bing?
      this.getSourceByID('none');
  }


  /**
   * getSource
   * Returns an ImagerySource for the given `sourceID`
   * @param   {string}  sourceID -  The sourceID to get
   * @return  {ImagerySource?}  The `ImagerySource` with the given ID, or `null` if not found
   */
  getSourceByID(sourceID) {
    if (!this._imageryIndex) return null;   // called before init()?

    if (/^EsriWayback/i.test(sourceID)) {   // ignore start date, if any
      sourceID = 'EsriWayback';
    }
    return this._imageryIndex.sources.get(sourceID.toLowerCase());
  }


  /**
   * setSourceByID
   * Activates the base layer with the given `sourceID`
   * This function will correctly handle IDs like `EsriWayback_<DATE>`.
   * @param   {string}  sourceID -  The sourceID to activate
   * @return  {ImagerySource?}  The `ImagerySource` with the given ID, or `null` if not found
   */
  setSourceByID(sourceID) {
    if (!this._imageryIndex) return null;   // called before init()?

    let date;
    const match = sourceID.match(/^EsriWayback\_?(.*)$/i);   // get start date, if any
    if (match) {
      sourceID = 'EsriWayback';
      date = match[1];
    }

    const source = this.getSourceByID(sourceID);
    if (source) {
      if (date) {
        source.date = date;
      }
      this.baseLayerSource(source);
    }
  }


  /**
   *
   */
  showsLayer(source) {
    const currSource = this._baseLayer;
    if (!source || !currSource) return false;
    return source.id === currSource.id || this._overlayLayers.has(source.id);
  }


  /**
   *
   */
  overlayLayerSources() {
    return [...this._overlayLayers.values()];
  }


  /**
   *
   */
  toggleOverlayLayer(source) {
    if (this._overlayLayers.has(source.id)) {
      this._overlayLayers.delete(source.id);
    } else {
      this._overlayLayers.set(source.id, source);
    }
    this._imageryChanged();
    this.emit('imagerychange');
  }


  /**
   * enableOverlayLayers
   * This makes sure that only the overlays identified by `enableIDs` are in the list
   *  ignoring the "locator overlay"
   * @param  {Set|Array}  enableIDs  Iterable Set or Array of sourceIDs to enable
   */
  enableOverlayLayers(enableIDs) {
    for (const [sourceID, source] of this._overlayLayers) {
      if (source.isLocatorOverlay()) continue;  // ignore this one
      this._overlayLayers.delete(sourceID);     // remove all others
    }

    for (const enableID of enableIDs) {             // add what belongs
      const source = this.getSourceByID(enableID);  // note that enableID is case insensitive
      if (source) {
        this._overlayLayers.set(source.id, source);
      }
    }

    this._imageryChanged();
    this.emit('imagerychange');
  }


  /**
   * nudge
   * nudge offset, in delta pixels [dx,dy]
   * @param  delta  pixels to nudge, as [dx, dy]
   * @param  zoom   the current zoom
   */
  nudge(delta, zoom) {
    if (this._baseLayer) {
      const zoom = this.context.viewport.transform.zoom;
      this._baseLayer.nudge(delta, zoom);
      this._imageryChanged();
      this.emit('imagerychange');
    }
  }


  /**
   * offset
   * set/get offset, in pixels [x,y]
   */
  get offset() {
    return this._baseLayer?.offset || [0, 0];
  }
  set offset([setX, setY] = [0, 0]) {
    const [currX, currY] = this._baseLayer?.offset || [0, 0];
    if (setX === currX && setY === currY) return;  // no change

    if (this._baseLayer) {
      this._baseLayer.offset = [setX, setY];
      this._imageryChanged();
      this.emit('imagerychange');
    }
  }

  /**
   * brightness
   * set/get brightness
   */
  get brightness() {
    return this._brightness;
  }
  set brightness(val = 1) {
    if (val === this._brightness) return;  // no change
    this._brightness = val;
    this.context.scene().layers.get('background')?.setBrightness(val);
    this.emit('imagerychange');
  }

  /**
   * contrast
   * set/get contrast
   */
  get contrast() {
    return this._contrast;
  }
  set contrast(val = 1) {
    if (val === this._contrast) return;  // no change
    this._contrast = val;
    this.context.scene().layers.get('background')?.setContrast(val);
    this.emit('imagerychange');
  }

  /**
   * saturation
   * set/get saturation
   */
  get saturation() {
    return this._saturation;
  }
  set saturation(val = 1) {
    if (val === this._saturation) return;  // no change
    this._saturation = val;
    this.context.scene().layers.get('background')?.setSaturation(val);
    this.emit('imagerychange');
  }

  /**
   * sharpness
   * set/get sharpness
   */
  get sharpness() {
    return this._sharpness;
  }
  set sharpness(val = 1) {
    if (val === this._sharpness) return;  // no change
    this._sharpness = val;
    this.context.scene().layers.get('background')?.setSharpness(val);
    this.emit('imagerychange');
  }

  /**
   * numGridSplits
   * set/get numGridSplits  (unused?)
   */
  get numGridSplits() {
    return this._numGridSplits;
  }
  set numGridSplits(val = 0) {
    if (val === this._numGridSplits) return;  // no change
    this._numGridSplits = val;
    this.emit('imagerychange');
  }

}
