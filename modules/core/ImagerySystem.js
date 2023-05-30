import { EventEmitter } from '@pixi/utils';
import { geoMetersToOffset, geoOffsetToMeters } from '@rapid-sdk/math';
import whichPolygon from 'which-polygon';

import {
  ImagerySource,
  ImagerySourceBing,
  ImagerySourceCustom,
  ImagerySourceEsri,
  ImagerySourceNone
} from './lib/ImagerySource';


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
export class ImagerySystem extends EventEmitter {

  /**
   * @constructor
   * @param  `context`   Global shared application context
   */
  constructor(context) {
    super();
    this.context = context;

    this._initPromise = null;
    this._imageryIndex = null;
    this._baseLayer = null;
    this._overlayLayers = [];
    this._checkedBlocklists = [];
    this._isValid = true;    // todo, find a new way to check this, no d3 enter/update render anymore

    this._brightness = 1;
    this._contrast = 1;
    this._saturation = 1;
    this._sharpness = 1;
    this._numGridSplits = 0; // No grid by default.

    // Ensure methods used as callbacks always have `this` bound correctly.
    this._hashchange = this._hashchange.bind(this);
  }


  /**
   * init
   * Called one time after all objects have been instantiated.
   */
  init() {
    this._initPromise = this._setupImageryAsync();
    this.context.urlHashSystem().on('hashchange', this._hashchange);
  }


  /**
   * _hashchange
   * Respond to any changes appearing in the url hash
   * @param  q   Object containing key/value pairs of the current query parameters
   */
  _hashchange(q) {
    if (!this._initPromise) return;  // called too early

    this._initPromise  // after imagery loaded
      .then(() => {
        // background
        let baseLayer;
        if (typeof q.background === 'string') {
          baseLayer = this.findSource(q.background);
        }
        if (!baseLayer) {
          baseLayer = this.chooseDefaultSource();
        }
        this.baseLayerSource(baseLayer);

        // overlays
        let toEnableIDs = new Set();
        if (typeof q.overlays === 'string') {
          toEnableIDs = new Set(q.overlays.split(','));
        }
        for (const overlayLayer of this.overlayLayerSources()) {  // for each enabled overlay layer
          if (overlayLayer.isLocatorOverlay()) continue;
          if (toEnableIDs.has(overlayLayer.id)) continue;  // stay enabled
          this.toggleOverlayLayer(overlayLayer);           // make disabled
        }

        // offset
        let x, y;
        if (typeof q.offset === 'string') {
          [x, y] = q.offset.replace(/;/g, ',').split(',').map(Number);
        }
        if (isNaN(x) || !isFinite(x)) x = 0;
        if (isNaN(y) || !isFinite(y)) y = 0;
        this.offset = geoMetersToOffset([x, y]);
      });
  }


  /**
   *  Called whenever the imagery changes
   *  Also used to push changes in imagery state to the urlhash
   */
  updateImagery() {
    const baseLayer = this._baseLayer;
    if (this.context.inIntro() || !baseLayer) return;

    let imageryUsed = [];
    let overlayIDs = [];

    // gather info about base imagery
    const baseUsed = baseLayer.imageryUsed;
    if (baseUsed && this._isValid) {
      imageryUsed.push(baseUsed);
    }
    let baseID = baseLayer.id;
    if (baseID === 'custom') {
      baseID = `custom:${baseLayer.template}`;
    }

    // Gather info about overlay imagery (ignore locator)
    const overlays = this._overlayLayers.filter(d => !d.isLocatorOverlay() && !d.isHidden());
    for (const overlay of overlays) {
      overlayIDs.push(overlay.id);
      imageryUsed.push(overlay.imageryUsed);
    }

    // Update history "imagery used" property
    this.context.history().imageryUsed(imageryUsed);

    // Update hash params: 'background', 'overlays', 'offset'
    const urlhash = this.context.urlHashSystem();
    urlhash.setParam('background', baseID);
    urlhash.setParam('overlays', overlayIDs.length ? overlayIDs.join(',') : null);

    const meters = geoOffsetToMeters(baseLayer.offset);
    const EPSILON = 0.01;
    const x = +meters[0].toFixed(2);
    const y = +meters[1].toFixed(2);
    urlhash.setParam('offset', (Math.abs(x) > EPSILON || Math.abs(y) > EPSILON) ? `${x},${y}` : null);
  }


  /**
   *  sources
   *  Returns array of known imagery sources that are valid at the given extent and zoom
   *  @param   extent
   *  @param   zoom
   *  @return  Array
   */
  sources(extent, zoom) {
    if (!this._imageryIndex) return [];   // called before init()?

    const visible = new Set();
    (this._imageryIndex.query.bbox(extent.rectangle(), true) || [])
      .forEach(d => visible.add(d.id));

    const currSource = this._baseLayer;
    const sources = [...this._imageryIndex.sources.values()];

    // Recheck blocked sources only if we detect new blocklists pulled from the OSM API.
    const osm = this.context.services.get('osm');
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
      if (currSource === source) return true;       // always include the current imagery
      if (source.isBlocked) return false;           // even bundled sources may be blocked - #7905
      if (!source.polygon) return true;             // always include imagery with worldwide coverage
      if (zoom && zoom < 6) return false;           // optionally exclude local imagery at low zooms
      return visible.has(source.id);                // include imagery visible in given extent
    });
  }


  /**
   *
   */
  baseLayerSource(d) {
    if (!arguments.length) return this._baseLayer;

    // test source against OSM imagery blocklists..
    const osm = this.context.services.get('osm');
    if (!osm) return this;

    const blocklists = osm?.imageryBlocklists ?? [];
    const template = d.template;
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

    this._baseLayer = (!fail ? d : this.findSource('none'));

    this.updateImagery();
    this.emit('imagerychange');
    return this;
  }


  /**
   *
   */
  chooseDefaultSource() {
    const map = this.context.mapSystem();
    const available = this.sources(map.extent(), map.zoom());
    const first = available[0];
    const best = available.find(s => s.best);
    const prefs = this.context.storageSystem();
    const lastUsed = prefs.getItem('background-last-used') || '';

    return best ||
      this.findSource(lastUsed) ||
      this.findSource('Bing') ||
      this.findSource('Maxar-Premium') ||
      first ||    // maybe this is a custom Rapid that doesn't include Bing or Maxar?
      this.findSource('none');
  }


  /**
   *
   */
  findSource(id) {
    if (!this._imageryIndex) return null;   // called before init()?
    return this._imageryIndex.sources.get(id);
  }


  /**
   *
   */
  showsLayer(d) {
    const currSource = this._baseLayer;
    if (!d || !currSource) return false;
    return d.id === currSource.id || this._overlayLayers.some(layer => d.id === layer.id);
  }


  /**
   *
   */
  overlayLayerSources() {
    return this._overlayLayers;
  }


  /**
   *
   */
  toggleOverlayLayer(d) {
    let layer;
    for (let i = 0; i < this._overlayLayers.length; i++) {
      layer = this._overlayLayers[i];
      if (layer === d) {
        this._overlayLayers.splice(i, 1);
        this.updateImagery();
        this.emit('imagerychange');
        return;
      }
    }

    layer = d;

    this._overlayLayers.push(layer);
    this.updateImagery();
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
      this._baseLayer.nudge(delta, zoom);
      this.updateImagery();
      this.emit('imagerychange');
    }
  }


  /**
   * offset
   * set/get offset, in pixels [x,y]
   */
  get offset() {
    return (this._baseLayer && this._baseLayer.offset) || [0, 0];
  }
  set offset([setX, setY] = [0, 0]) {
    const [currX, currY] = (this._baseLayer && this._baseLayer.offset) || [0, 0];
    if (setX === currX && setY === currY) return;  // no change

    if (this._baseLayer) {
      this._baseLayer.offset = [setX, setY];
      this.updateImagery();
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



  /**
   * _setupImageryAsync
   * The imagery index loads after Rapid starts.
   * It contains these properties:
   *   {
   *     features:  Map(id -> GeoJSON feature)
   *     sources:   Map(id -> ImagerySource)
   *     query:     A which-polygon index to perform spatial queries against
   *   }
   * @return  Promise that resolves with the imagery index once everything has been loaded and is ready
   */
  _setupImageryAsync() {
    if (this._initPromise) return this._initPromise;

    const context = this.context;
    const dataLoaderSystem = context.dataLoaderSystem();
    const storageSystem = this.context.storageSystem();

    return dataLoaderSystem.get('imagery')
      .then(data => {
        this._imageryIndex = {
          features: new Map(),   // Map(id -> GeoJSON feature)
          sources: new Map(),    // Map(id -> ImagerySource)
          query: null            // which-polygon index
        };

        // Extract a GeoJSON feature for each imagery item.
        const features = data.map(d => {
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

          this._imageryIndex.features.set(d.id, feature);
          return feature;
        }).filter(Boolean);

        // Create a which-polygon index to support efficient spatial querying.
        this._imageryIndex.query = whichPolygon({ type: 'FeatureCollection', features: features });

        // Instantiate `ImagerySource` objects for each imagery item.
        for (const d of data) {
          let source;
          if (d.type === 'bing') {
            source = new ImagerySourceBing(context, d);
          } else if (/^EsriWorldImagery/.test(d.id)) {
            source = new ImagerySourceEsri(context, d);
          } else {
            source = new ImagerySource(context, d);
          }
          this._imageryIndex.sources.set(d.id, source);
        }

        // Add 'None'
        const none = new ImagerySourceNone(context);
        this._imageryIndex.sources.set(none.id, none);

        // Add 'Custom' - seed it with whatever template the user has used previously
        const custom = new ImagerySourceCustom(context);
        custom.template = storageSystem.getItem('background-custom-template') || '';
        this._imageryIndex.sources.set(custom.id, custom);

        // Default the locator overlay to "on"..
        const locator = this._imageryIndex.sources.get('mapbox_locator_overlay');
        if (locator) {
          this.toggleOverlayLayer(locator);
        }

        return this._imageryIndex;
      })
      .catch(e => {
        if (e instanceof Error) console.error(e);  // eslint-disable-line no-console
      });
  }

}
