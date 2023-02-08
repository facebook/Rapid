import { EventEmitter } from '@pixi/utils';
import { Extent, geoMetersToOffset, geoOffsetToMeters } from '@id-sdk/math';
import { utilQsString, utilStringQs } from '@id-sdk/util';
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

    this._loadPromise = null;
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
    this._loadDataAsync();
  }


  /**
   *
   */
  updateImagery() {
    const currSource = this._baseLayer;
    if (this.context.inIntro() || !currSource) return;

//    const meters = geoOffsetToMeters(currSource.offset);
//    const EPSILON = 0.01;
//    const x = +meters[0].toFixed(2);
//    const y = +meters[1].toFixed(2);
//    let hash = utilStringQs(window.location.hash);
//
//    let id = currSource.id;
//    if (id === 'custom') {
//      id = `custom:${currSource.template}`;
//    }
//    if (id) {
//      hash.background = id;
//    } else {
//      delete hash.background;
//    }
//
//    const o = this._overlayLayers
//      .filter(d => !d.isLocatorOverlay() && !d.isHidden())
//      .map(d => d.id)
//      .join(',');
//
//    if (o) {
//      hash.overlays = o;
//    } else {
//      delete hash.overlays;
//    }
//
//    if (Math.abs(x) > EPSILON || Math.abs(y) > EPSILON) {
//      hash.offset = `${x},${y}`;
//    } else {
//      delete hash.offset;
//    }
//
//    if (!window.mocha) {
//      window.location.replace('#' + utilQsString(hash, true));
//    }

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

    let visible = {};
    (this._imageryIndex.query.bbox(extent.rectangle(), true) || [])
      .forEach(d => visible[d.id] = true);

    const currSource = this._baseLayer;

    // Recheck blocked sources only if we detect new blocklists pulled from the OSM API.
    const osm = this.context.connection();
    const blocklists = (osm && osm.imageryBlocklists()) || [];
    const blocklistChanged = (blocklists.length !== this._checkedBlocklists.length) ||
      blocklists.some((regex, index) => String(regex) !== this._checkedBlocklists[index]);

    if (blocklistChanged) {
      this._imageryIndex.sources.forEach(source => {
        source.isBlocked = blocklists.some(regex => regex.test(source.template));
      });
      this._checkedBlocklists = blocklists.map(regex => String(regex));
    }

    return this._imageryIndex.sources.filter(source => {
      if (currSource === source) return true;       // always include the current imagery
      if (source.isBlocked) return false;           // even bundled sources may be blocked - #7905
      if (!source.polygon) return true;             // always include imagery with worldwide coverage
      if (zoom && zoom < 6) return false;           // optionally exclude local imagery at low zooms
      return visible[source.id];                    // include imagery visible in given extent
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

    for (let i = 0; i < blocklists.length; i++) {
      regex = blocklists[i];
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
  findSource(id) {
    if (!id || !this._imageryIndex) return null;   // called before init()?
    return this._imageryIndex.sources.find(d => d.id && d.id === id);
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
   * _loadDataAsync
   * @return  Promise that resolves once everything has been loaded and is ready
   */
  _loadDataAsync() {
    if (this._loadPromise) return this._loadPromise;

//    function _parseMapParams(qmap) {
//      if (!qmap) return false;
//      const params = qmap.split('/').map(Number);
//      if (params.length < 3 || params.some(isNaN)) return false;
//      return new Extent([params[2], params[1]]);  // lon,lat
//    }
//
//    const hash = utilStringQs(window.location.hash);
//    const requested = hash.background || hash.layer;
//    let extent = _parseMapParams(hash.map);

    return this._loadPromise = this._loadImageryIndexAsync()
      .then(imageryIndex => {
        const first = imageryIndex.sources.length && imageryIndex.sources[0];

        let best;
        if (!requested && extent) {
          best = this.sources(extent).find(s => s.best);
        }

        // Decide which base layer to start with..
        if (requested && requested.indexOf('custom:') === 0) {
          const template = requested.replace(/^custom:/, '');
          const custom = this.findSource('custom');
          custom.template = template;
          this.baseLayerSource(custom);
          prefs('background-custom-template', template);

        } else {
          this.baseLayerSource(
            this.findSource(requested) ||
            best ||
            this.findSource(prefs('background-last-used')) ||
            this.findSource('Maxar-Premium') ||
            this.findSource('Bing') ||
            first ||
            this.findSource('none')
          );
        }

        // Default the locator overlay to "on"..
        const locator = this.findSource('mapbox_locator_overlay');
        if (locator) {
          this.toggleOverlayLayer(locator);
        }

        // Enable other overlays in url hash..
        const overlayIDs = (hash.overlays || '').split(',');
        overlayIDs.forEach(overlayID => {
          if (overlayID === 'mapbox_locator_overlay') return;
          const overlay = this.findSource(overlayID);
          if (overlay) {
            this.toggleOverlayLayer(overlay);
          }
        });

// does not belong here
//        if (hash.gpx) {
//          const gpxLayer = this.context.scene().layers.get('custom-data');
//          if (gpxLayer) {
//            gpxLayer.url(hash.gpx, '.gpx');
//          }
//        }

        if (hash.offset) {   // offset in hash is represented in meters east,north
          const offset = hash.offset
            .replace(/;/g, ',')
            .split(',')
            .map(n => !isNaN(n) && n);

          if (offset.length === 2) {
            this.offset = geoMetersToOffset(offset);  // convert to pixels east,north
          }
        }
      })
      .catch(e => {
        if (e instanceof Error) console.error(e);  // eslint-disable-line no-console
      });
  }


  /**
   * _loadImageryIndexAsync
   * The imagery index loads after RapiD starts.
   * It contains these properties:
   *   {
   *     features:  Array of GeoJSON features for the imagery
   *     query:     A which-polygon index to perform spatial queries against
   *     sources:   Instantiated tile source objects for all the imagery
   *   }
   * @return  Promise that resolves with the imagery index once it has been loaded
   */
  _loadImageryIndexAsync() {
    return fileFetcher.get('imagery')
      .then(data => {
        if (this._imageryIndex) {
          return this._imageryIndex;
        }

        this._imageryIndex = { features: {} };

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

          this._imageryIndex.features[d.id] = feature;
          return feature;
        }).filter(Boolean);

        // Create a which-polygon index to support efficient spatial querying.
        this._imageryIndex.query = whichPolygon({ type: 'FeatureCollection', features: features });

        // Instantiate `RendererImagerySource` objects for each imagery item.
        this._imageryIndex.sources = data.map(d => {
          if (d.type === 'bing') {
            return new RendererImagerySourceBing(d);
          } else if (/^EsriWorldImagery/.test(d.id)) {
            return new RendererImagerySourceEsri(d);
          } else {
            return new RendererImagerySource(d);
          }
        });

        // Add 'None'
        this._imageryIndex.sources.unshift(new RendererImagerySourceNone());

        // Add 'Custom' - seed it with whatever template the user has used previously
        const custom = new RendererImagerySourceCustom();
        custom.template = prefs('background-custom-template') || '';
        this._imageryIndex.sources.unshift(custom);

        return this._imageryIndex;
      });
  }

}
