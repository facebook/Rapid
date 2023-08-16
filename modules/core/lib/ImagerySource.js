import { geoArea as d3_geoArea, geoMercatorRaw as d3_geoMercatorRaw } from 'd3-geo';
import { utilAesDecrypt, utilQsString, utilStringQs } from '@rapid-sdk/util';
import { geoSphericalDistance } from '@rapid-sdk/math';

import { utilFetchResponse } from '../../util';


/**
 * `ImagerySource` maintains the state of a single tiled imagery source.
 */
export class ImagerySource {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   * @param  `src`      source Object describing the imagery source
   */
  constructor(context, src) {
    this.context = context;

    this._id = src.id;
    this._idtx = src.id.replace(/\./g, '<TX_DOT>');  // replace '.' in ids, so localization system can handle them
    this._name = src.name;
    this._description = src.description;
    this._template = src.encrypted ? utilAesDecrypt(src.template) : src.template;

    this.best = !!src.best;
    this.endDate = src.endDate;
    this.icon = src.icon;
    this.overlay = src.overlay;
    this.overzoom = src.overzoom !== false;
    this.polygon = src.polygon;
    this.projection = src.projection;
    this.startDate = src.startDate;
    this.terms_html = src.terms_html;
    this.terms_text = src.terms_text;
    this.terms_url = src.terms_url;
    this.tileSize = src.tileSize || 256;
    this.type = src.type;
    this.zoomExtent = src.zoomExtent || [0, 22];

    this.isBlocked = false;
    this.offset = [0, 0];
  }


  get id() {
    return this._id;
  }

  get idtx() {
    return this._idtx;
  }

  get name() {
    return this.context.systems.l10n.t(`imagery.${this._idtx}.name`, { default: this._name });
  }

  get label() {
    return this.context.systems.l10n.tHtml(`imagery.${this._idtx}.name`, { default: this._name });
  }

  get description() {
    return this.context.systems.l10n.tHtml(`imagery.${this._idtx}.description`, { default: this._description });
  }

  get imageryUsed() {
    return this._name || this._id;
  }

  get template() {
    return this._template;
  }

  get area() {
    if (!this.polygon) return Number.MAX_VALUE;  // worldwide
    const area = d3_geoArea({ type: 'MultiPolygon', coordinates: [ this.polygon ] });
    return isNaN(area) ? 0 : area;
  }


  validZoom(z) {
    return this.zoomExtent[0] <= z && (this.overzoom || this.zoomExtent[1] > z);
  }

  isLocatorOverlay() {
    return this._id === 'mapbox_locator_overlay';
  }

  // hides a source from the list, but leaves it available for use
  isHidden() {
    return this._id === 'DigitalGlobe-Premium-vintage' || this._id === 'DigitalGlobe-Standard-vintage';
  }

  copyrightNotices() {
    /* noop */
  }


  getMetadata(center, tileCoord, callback) {
    let vintage = {
      start: this._localeDateString(this.startDate),
      end: this._localeDateString(this.endDate)
    };
    vintage.range = this._vintageRange(vintage);

    const metadata = { vintage: vintage };
    callback(null, metadata);
  }


  nudge(val, zoom) {
    this.offset[0] += val[0] / Math.pow(2, zoom);
    this.offset[1] += val[1] / Math.pow(2, zoom);
    return this;
  }


  url(coord) {
    let result = this._template;
    if (result === '') return result;   // source 'none'

    function _tileToProjectedCoords(proj, x, y, z) {
      const zoomSize = Math.pow(2, z);
      const lon = x / zoomSize * Math.PI * 2 - Math.PI;
      const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / zoomSize)));
      let mercCoords;

      switch (proj) {
        case 'EPSG:4326':
          return {
            x: lon * 180 / Math.PI,
            y: lat * 180 / Math.PI
          };
        default: // EPSG:3857 and synonyms
          mercCoords = d3_geoMercatorRaw(lon, lat);
          return {
            x: 20037508.34 / Math.PI * mercCoords[0],
            y: 20037508.34 / Math.PI * mercCoords[1]
          };
      }
    }


    // Guess a type based on the tokens present in the template
    // (This is for 'custom' source, where we don't know)
    if (!this.type) {
      if (/SERVICE=WMS|\{(proj|wkid|bbox)\}/.test(this._template)) {
        this.type = 'wms';
        this.projection = 'EPSG:3857';  // guess
      } else if (/\{(x|y)\}/.test(this._template)) {
        this.type = 'tms';
      } else if (/\{u\}/.test(this._template)) {
        this.type = 'bing';
      }
    }

    if (this.type === 'wms') {
      const tileSize = this.tileSize;
      const projection = this.projection;
      const minXmaxY = _tileToProjectedCoords(projection, coord[0], coord[1], coord[2]);
      const maxXminY = _tileToProjectedCoords(projection, coord[0] + 1, coord[1] + 1, coord[2]);

      result = result.replace(/\{(\w+)\}/g, (match, capture) => {
        switch (capture) {
          case 'width':
          case 'height':
            return tileSize;
          case 'proj':
            return projection;
          case 'wkid':
            return projection.replace(/^EPSG:/, '');
          case 'bbox':
            // WMS 1.3 flips x/y for some coordinate systems including EPSG:4326 - #7557
            // The CRS parameter implies version 1.3 (prior versions use SRS)
            if (projection === 'EPSG:4326' && /VERSION=1.3|CRS={proj}/.test(this._template.toUpperCase())) {
              return maxXminY.y + ',' + minXmaxY.x + ',' + minXmaxY.y + ',' + maxXminY.x;
            } else {
              return minXmaxY.x + ',' + maxXminY.y + ',' + maxXminY.x + ',' + minXmaxY.y;
            }
          case 'w':
            return minXmaxY.x;
          case 's':
            return maxXminY.y;
          case 'n':
            return maxXminY.x;
          case 'e':
            return minXmaxY.y;
          default:
            return match;
        }
      });

     } else if (this.type === 'tms') {
      const isRetina = window.devicePixelRatio && window.devicePixelRatio >= 2;
      result = result
        .replace('{x}', coord[0])
        .replace('{y}', coord[1])
        // TMS-flipped y coordinate
        .replace(/\{[t-]y\}/, Math.pow(2, coord[2]) - coord[1] - 1)
        .replace(/\{z(oom)?\}/, coord[2])
        // only fetch retina tiles for retina screens
        .replace(/\{@2x\}|\{r\}/, isRetina ? '@2x' : '');

    } else if (this.type === 'bing') {
      result = result
        .replace('{u}', () => {
          let u = '';
          for (let zoom = coord[2]; zoom > 0; zoom--) {
            let b = 0;
            const mask = 1 << (zoom - 1);
            if ((coord[0] & mask) !== 0) b++;
            if ((coord[1] & mask) !== 0) b += 2;
            u += b.toString();
          }
          return u;
        });
    }

    // these apply to any type..
    result = result.replace(/\{switch:([^}]+)\}/, (match, capture) => {
      const subdomains = capture.split(',');
      return subdomains[(coord[0] + coord[1]) % subdomains.length];
    });

    return result;
  }


  _localeDateString(s) {
    if (!s) return null;
    const options = { day: 'numeric', month: 'short', year: 'numeric' };
    const d = new Date(s);
    if (isNaN(d.getTime())) return null;

    const localeCode = this.context.localizationSystem.localeCode();
    return d.toLocaleDateString(localeCode, options);
  }


  _vintageRange(vintage) {
    let s;
    if (vintage.start || vintage.end) {
      s = (vintage.start || '?');
      if (vintage.start !== vintage.end) {
        s += ' - ' + (vintage.end || '?');
      }
    }
    return s;
  }

}


/**
 * `ImagerySourceNone`
 * A special imagery source for when the user has imagery disabled.
 */
export class ImagerySourceNone extends ImagerySource {
  constructor(context) {
    super(context, { id: 'none', template: '' });
  }
  get name() {
    return this.context.systems.l10n.t('background.none');
  }
  get label() {
    return this.context.systems.l10n.tHtml('background.none');
  }
  get area() {
    return -1;  // sources in background pane are sorted by area
  }
  get imageryUsed() {
    return null;
  }
}


/**
 * `ImagerySourceCustom`
 * A special imagery source for when the user has custom imagery.
 * Overrides the imageryUsed method, also allows the url template to be changed.
 */
export class ImagerySourceCustom extends ImagerySource {
  constructor(context, template = '') {
    super(context, { id: 'custom', template: template });
  }
  get name() {
    return this.context.systems.l10n.t('background.custom');
  }
  get label() {
    return this.context.systems.l10n.tHtml('background.custom');
  }
  get area() {
    return -2;  // sources in background pane are sorted by area
  }

  get imageryUsed() {
    // sanitize personal connection tokens - #6801
    let cleaned = this._template;

    // from query string parameters
    if (cleaned.indexOf('?') !== -1) {
      let parts = cleaned.split('?', 2);
      let qs = utilStringQs(parts[1]);

      ['access_token', 'connectId', 'token'].forEach(param => {
        if (qs[param]) {
          qs[param] = '{apikey}';
        }
      });
      cleaned = parts[0] + '?' + utilQsString(qs, true);  // true = soft encode
    }

    // from wms/wmts api path parameters
    cleaned = cleaned.replace(/token\/(\w+)/, 'token/{apikey}');
    return `Custom (${cleaned} )`;
  }

  // only 'custom' imagery source allows the template to be changed
  set template(val) {
    this._template = val;
  }
  get template() {
    return this._template;
  }
}


/**
 * `ImagerySourceBing`
 * A special imagery source for the Bing imagery source.
 * There should be more overrides in here, but they aren't currently working.
 *   https://docs.microsoft.com/en-us/bingmaps/rest-services/imagery/get-imagery-metadata
 *   https://docs.microsoft.com/en-us/bingmaps/rest-services/directly-accessing-the-bing-maps-tiles
 *   See also https://github.com/openstreetmap/iD/pull/9133
 */
export class ImagerySourceBing extends ImagerySource {
  constructor(context, src) {
    super(context, src);

    // missing tile image strictness param (n=)
    // * n=f -> (Fail) returns a 404
    // * n=z -> (Empty) returns a 200 with 0 bytes (no content)
    // * n=t -> (Transparent) returns a 200 with a transparent (png) tile
    this._template = 'https://ecn.t{switch:0,1,2,3}.tiles.virtualearth.net/tiles/a{u}.jpeg?g=1&pr=odbl&n=z';
    this.terms_url = 'https://blog.openstreetmap.org/2010/11/30/microsoft-imagery-details';
  }
}


/**
 * `ImagerySourceEsri`
 * A special imagery source for the Esri imagery sources
 * Overrides the getMetadata function to get more imagery metadata.
 */
export class ImagerySourceEsri extends ImagerySource {
  constructor(context, src) {
    super(context, src);

    // In addition to using the tilemap at zoom level 20, overzoom real tiles
    //  #4327 (deprecated technique, but it works)
    if (!/blankTile/.test(this._template)) {
      this._template += '?blankTile=false';
    }

    this._cache = {};
    this._inflight = {};
    this._prevCenter = null;
  }


  // use a tilemap service to set maximum zoom for esri tiles dynamically
  // https://developers.arcgis.com/documentation/tiled-elevation-service/
  fetchTilemap(center) {
    // skip if we have already fetched a tilemap within 5km
    if (this._prevCenter && geoSphericalDistance(center, this._prevCenter) < 5000) return;
    this._prevCenter = center;

    // tiles are available globally to zoom level 19, afterward they may or may not be present
    // first generate a random url using the template
    const dummyUrl = this.url([1,2,3]);

    // calculate url z/y/x from the lat/long of the center of the map
    const z = 20;
    const x = (Math.floor((center[0] + 180) / 360 * Math.pow(2, z)));
    const y = (Math.floor((1 - Math.log(Math.tan(center[1] * Math.PI / 180) + 1 / Math.cos(center[1] * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, z)));

    // fetch an 8x8 grid to leverage cache
    let tilemapUrl = dummyUrl.replace(/tile\/[0-9]+\/[0-9]+\/[0-9]+\?blankTile=false/, 'tilemap') + '/' + z + '/' + y + '/' + x + '/8/8';

    // make the request and inspect the response from the tilemap server
    fetch(tilemapUrl)
      .then(utilFetchResponse)
      .then(tilemap => {
        if (!tilemap) {
          throw new Error('Unknown Error');
        }
        let hasTiles = true;
        for (let i = 0; i < tilemap.data.length; i++) {
          // 0 means an individual tile in the grid doesn't exist
          if (!tilemap.data[i]) {
            hasTiles = false;
            break;
          }
        }
        // if any tiles are missing at level 20 we restrict maxZoom to 19
        this.zoomExtent[1] = (hasTiles ? 22 : 19);
      })
      .catch(e => console.error(e));  // eslint-disable-line
  }


  getMetadata(center, tileCoord, callback) {
    const tileID = tileCoord.slice(0, 3).join('/');
    const zoom = Math.min(tileCoord[2], this.zoomExtent[1]);
    const centerPoint = center[0] + ',' + center[1];  // long, lat (as it should be)
    const unknown = this.context.systems.l10n.t('info_panels.background.unknown');

    if (this._inflight[tileID]) return;

    let metadataLayer;
    switch (true) {
      case (zoom >= 20 && this._id === 'EsriWorldImageryClarity'):
        metadataLayer = 4;
        break;
      case zoom >= 19:
        metadataLayer = 3;
        break;
      case zoom >= 17:
        metadataLayer = 2;
        break;
      case zoom >= 13:
        metadataLayer = 0;
        break;
      default:
        metadataLayer = 99;
    }

    // build up query using the layer appropriate to the current zoom
    let url;
    if (this._id === 'EsriWorldImagery') {
      url = 'https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/';
    } else if (this._id === 'EsriWorldImageryClarity') {
      url = 'https://serviceslab.arcgisonline.com/arcgis/rest/services/Clarity_World_Imagery/MapServer/';
    } else {
      return;
    }

    url += metadataLayer + '/query?returnGeometry=false&geometry=' + centerPoint + '&inSR=4326&geometryType=esriGeometryPoint&outFields=*&f=json';

    if (!this._cache[tileID]) {
      this._cache[tileID] = {};
    }
    if (this._cache[tileID] && this._cache[tileID].metadata) {
      return callback(null, this._cache[tileID].metadata);
    }

    // accurate metadata is only available >= 13
    let vintage = {};
    let metadata = {};
    if (metadataLayer === 99) {
      vintage = {
        start: null,
        end: null,
        range: null
      };
      metadata = {
        vintage: null,
        source: unknown,
        description: unknown,
        resolution: unknown,
        accuracy: unknown
      };

      callback(null, metadata);

    } else {
      this._inflight[tileID] = true;
      fetch(url)
        .then(utilFetchResponse)
        .then(result => {
          delete this._inflight[tileID];

          if (!result) {
            throw new Error('Unknown Error');
          } else if (result.features && result.features.length < 1) {
            throw new Error('No Results');
          } else if (result.error && result.error.message) {
            throw new Error(result.error.message);
          }

          // pass through the discrete capture date from metadata
          const captureDate = this._localeDateString(result.features[0].attributes.SRC_DATE2);
          vintage = {
            start: captureDate,
            end: captureDate,
            range: captureDate
          };
          metadata = {
            vintage: vintage,
            source: clean(result.features[0].attributes.NICE_NAME),
            description: clean(result.features[0].attributes.NICE_DESC),
            resolution: clean(+parseFloat(result.features[0].attributes.SRC_RES).toFixed(4)),
            accuracy: clean(+parseFloat(result.features[0].attributes.SRC_ACC).toFixed(4))
          };

          // append units - meters
          if (isFinite(metadata.resolution)) {
            metadata.resolution += ' m';
          }
          if (isFinite(metadata.accuracy)) {
            metadata.accuracy += ' m';
          }

          this._cache[tileID].metadata = metadata;
          if (callback) callback(null, metadata);
        })
        .catch(err => {
          delete this._inflight[tileID];

          if (callback) callback(err.message);
        });
    }

    function clean(val) {
      return String(val).trim() || unknown;
    }
  }

}
