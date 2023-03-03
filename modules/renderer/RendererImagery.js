import { EventEmitter } from '@pixi/utils';
import whichPolygon from 'which-polygon';

import { prefs } from '../core/preferences';
import { fileFetcher } from '../core/file_fetcher';

import {
  RendererImagerySource,
  RendererImagerySourceBing,
  RendererImagerySourceCustom,
  RendererImagerySourceEsri,
  RendererImagerySourceNone
} from './RendererImagerySource';


/**
 * `RendererImagery` maintains the state of the tiled background and overlay imagery.
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
export class RendererImagery extends EventEmitter {

  /**
   * @constructor
   * @param  `context`   Global shared application context
   */
  constructor(context) {
    super();
    this.context = context;

    this._setupPromise = null;
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
  }


  /**
   * init
   * Called one time after all objects have been instantiated.
   */
  init() {
    this._setupImageryAsync();
  }


  /**
   *
   */
  updateImagery() {
    const currSource = this._baseLayer;
    if (this.context.inIntro() || !currSource) return;

    let imageryUsed = [];
    // let photoOverlaysUsed = [];

    const currUsed = currSource.imageryUsed;
    if (currUsed && this._isValid) {
      imageryUsed.push(currUsed);
    }

    this._overlayLayers
      .filter(d => !d.isLocatorOverlay() && !d.isHidden())
      .forEach(d => imageryUsed.push(d.imageryUsed));

    this.context.history().imageryUsed(imageryUsed);
    // this.context.history().photoOverlaysUsed(photoOverlaysUsed);
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
    const osm = this.context.connection();
    const blocklists = (osm && osm.imageryBlocklists()) || [];
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
    const osm = this.context.connection();
    if (!osm) return this;

    const blocklists = osm.imageryBlocklists();
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
    const map = this.context.map();
    const available = this.sources(map.extent(), map.zoom());
    const first = available[0];
    const best = available.find(s => s.best);

    return best ||
      this.findSource(prefs('background-last-used')) ||
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
    if (this._setupPromise) return this._setupPromise;

    return this._setupPromise = fileFetcher.get('imagery')
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

        // Instantiate `RendererImagerySource` objects for each imagery item.
        for (const d of data) {
          let source;
          if (d.type === 'bing') {
            source = new RendererImagerySourceBing(d);
          } else if (/^EsriWorldImagery/.test(d.id)) {
            source = new RendererImagerySourceEsri(d);
          } else {
            source = new RendererImagerySource(d);
          }
          this._imageryIndex.sources.set(d.id, source);
        }

        // Add 'None'
        const none = new RendererImagerySourceNone();
        this._imageryIndex.sources.set(none.id, none);

        // Add 'Custom' - seed it with whatever template the user has used previously
        const custom = new RendererImagerySourceCustom();
        custom.template = prefs('background-custom-template') || '';
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
