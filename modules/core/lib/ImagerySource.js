import { geoArea as d3_geoArea, geoMercatorRaw as d3_geoMercatorRaw } from 'd3-geo';
import { utilAesDecrypt, utilQsString, utilStringQs } from '@rapid-sdk/util';
import { geoSphericalDistance, geoZoomToScale, Tiler, Viewport } from '@rapid-sdk/math';
import * as Wayback from '@rapideditor/wayback-core';
import RBush from 'rbush';

import { utilFetchResponse } from '../../util/index.js';


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

    this.alpha = src.alpha || 1;
    this.best = !!src.best;
    this.endDate = src.endDate;       // dates are stored as strings
    this.icon = src.icon;
    this.overlay = src.overlay;
    this.polygon = src.polygon;
    this.projection = src.projection;
    this.startDate = src.startDate;   // dates are stored as strings
    this.terms_html = src.terms_html;
    this.terms_text = src.terms_text;
    this.terms_url = src.terms_url;
    this.tileSize = src.tileSize || 256;
    this.type = src.type;
    this.zoomExtent = src.zoomExtent || [0, 22];
    this.zoomRange = src.zoomRange || 5;

    this.isBlocked = false;
    this.offset = [0, 0];
  }


  get id() {
    return this._id;
  }

  get idtx() {
    return this._idtx;
  }

  // `key` can be used to uniquely identify this imagery source.
  // It is usually just the `id`, but for 'wayback' it will also include the `date`.
  get key() {
    return this._id;
  }

  get name() {
    return this.context.systems.l10n.t(`_imagery.imagery.${this._idtx}.name`, { default: this._name });
  }

  get description() {
    return this.context.systems.l10n.t(`_imagery.imagery.${this._idtx}.description`, { default: this._description });
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
    if (Number.isNaN(z)) return false;
    const [min, max] = this.zoomExtent;
    return (z >= min) && (z <= max);
  }

  isLocatorOverlay() {
    return this._id === 'mapbox_locator_overlay';
  }


  getMetadata(loc, tileCoord, callback) {
    const vintage = {
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
    const urlTemplate = this.template;
    let result = urlTemplate;
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
      if (/SERVICE=WMS|\{(proj|wkid|bbox)\}/.test(urlTemplate)) {
        this.type = 'wms';
        this.projection = 'EPSG:3857';  // guess
      } else if (/\{(x|y)\}/.test(urlTemplate)) {
        this.type = 'tms';
      } else if (/\{u\}/.test(urlTemplate)) {
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
            // WMS 1.3 flips x/y for some coordinate systems including EPSG:4326 - iD#7557
            // The CRS parameter implies version 1.3 (prior versions use SRS)
            if (projection === 'EPSG:4326' && /VERSION=1.3|CRS={proj}/.test(urlTemplate.toUpperCase())) {
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
    const d = new Date(s + 'T00:00:00Z');  // Add 'T00:00:00Z' to create the date in UTC
    if (isNaN(d.getTime())) return null;

    return d.toISOString().split('T')[0];  // Return the date part of the ISO string
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
  get area() {
    return -2;  // sources in background pane are sorted by area
  }

  get imageryUsed() {
    // Sanitize personal connection tokens - iD#6801
    let cleaned = this.template;

    // Sanitize query string parameters
    let [url, params] = cleaned.split('?', 2);
    if (params) {
      const qs = utilStringQs(params);
      for (const k of Object.keys(qs)) {
        if (/^(access_token|connectid|key|signature|token)$/i.test(k)) {
          qs[k] = '{apikey}';
        }
      }
      cleaned = url + '?' + utilQsString(qs, true);  // true = soft encode
    }

    // Sanitize wms/wmts path parameters
    cleaned = cleaned
      .replace(/token\/(\w+)/, 'token/{apikey}')
      .replace(/key=(\w+)/, 'key={apikey}');

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
    //  iD#4327 (deprecated technique, but it works)
    if (!/blankTile/.test(this._template)) {
      this._template += '?blankTile=false';
    }

    this._cache = {};
    this._inflight = {};
    this._prevLoc = null;
  }


  // Use a tilemap service to set maximum zoom for Esri tiles dynamically
  // https://developers.arcgis.com/documentation/tiled-elevation-service/
  fetchTilemap(loc) {
    // skip if we have already fetched a tilemap within 5km
    if (this._prevLoc && geoSphericalDistance(loc, this._prevLoc) < 5000) return;
    this._prevLoc = loc;

    // tiles are available globally to zoom level 19, afterward they may or may not be present
    // first generate a random url using the template
    const dummyUrl = this.url([1,2,3]);

    // calculate url z/y/x from the lat/long of the center of the map
    const z = 20;
    const x = (Math.floor((loc[0] + 180) / 360 * Math.pow(2, z)));
    const y = (Math.floor((1 - Math.log(Math.tan(loc[1] * Math.PI / 180) + 1 / Math.cos(loc[1] * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, z)));

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
          }
        }
        // if any tiles are missing at level 20 we restrict maxZoom to 19
        this.zoomExtent[1] = (hasTiles ? 22 : 19);
      })
      .catch(e => console.error(e));  // eslint-disable-line
  }


  getMetadata(loc, tileCoord, callback) {
    const tileID = tileCoord.slice(0, 3).join('/');
    const zoom = Math.min(tileCoord[2], this.zoomExtent[1]);
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

    url += metadataLayer + '/query?returnGeometry=false&geometry=' + loc.join(',') + '&inSR=4326&geometryType=esriGeometryPoint&outFields=*&f=json';

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


/**
 * `ImagerySourceEsriWayback`
 * A special imagery source that allows users to choose available dates in the Esri Wayback Archive.
 * The actual date that the user wants to view is stored in `this.startDate` (and `this.endDate`)
 * Note that all "dates" in imagery sources are actually stored as ISO strings like `2024-01-01`
 */
export class ImagerySourceEsriWayback extends ImagerySourceEsri {

  constructor(context, src) {
    super(context, src);
    this._initPromise = null;
    this._refreshPromise = null;
    this._tiler = new Tiler();

    this._waybackData = new Map();        // Map (releaseDate -> data)
    this._releaseDateCache = new RBush();
    this._oldestDate = null;
    this._newestDate = null;
  }

  // Append the date to the `id` if there is one, e.g. `EsriWayback_2024-01-01`
  get key() {
    let s = this._id;
    const date = this.date;
    if (date) {
      s += `_${date}`;
    }
    return s;
  }

  // `wayback` will not be in the imagery index, so we localize these strings differently
  get name() {
    return this.context.systems.l10n.t('background.wayback.name', { default: this._name });
  }
  get description() {
    return this.context.systems.l10n.t('background.wayback.description', { default: this._description });
  }

  get template() {
    const current = this._waybackData.get(this.startDate);
    return current?.template || this._template;
  }

  // Append the date to `imageryUsed` if there is one, e.g. `Esri Wayback (2024-01-01)`
  get imageryUsed() {
    let s = this._name;
    const date = this.date;
    if (date) {
      s += ` (${date})`;
    }
    return s;
  }

  get oldestDate() {
    return this._oldestDate;
  }

  get newestDate() {
    return this._newestDate;
  }

  // getter only, no setter
  // `localReleaseDates` contains only the dates when the imagery has changed locally.
  // While all dates are valid, these are the interesting ones where the map has changed.
  // Copy to an Array for when we need to make the dropdown options list
  get localReleaseDates() {
    let results;

    // Include any release dates we have fetched for this location
    const [lon, lat] = this.context.viewport.centerLoc();
    const hit = this._releaseDateCache.search({ minX: lon, minY: lat, maxX: lon, maxY: lat });
    if (hit.length) {
      results = new Set(hit[0].releaseDates);
    } else {
      results = new Set();
    }

    // always include oldest, newest, and current selection
    if (this._oldestDate)  results.add(this._oldestDate);
    if (this._newestDate)  results.add(this._newestDate);
    if (this.startDate)    results.add(this.startDate);

    return [...results].sort().reverse();   // sort as strings decending
  }


  // Pick the closest date available within range of valid dates
  set date(val) {
    const requestDate = this._localeDateString(val);
    if (!requestDate) return;

    const allDates = [...this._waybackData.keys()].sort();  // sort as strings ascending

    let chooseDate = allDates[0];
    for (let i = 1; i < allDates.length; i++) {   // can skip oldest, it is already in chooseDate
      const cmp = requestDate.localeCompare(chooseDate);
      if (cmp <= 0) break;        // stop looking
      chooseDate = allDates[i];   // try next date
    }

    this.startDate = chooseDate;
    this.endDate = chooseDate;
  }


  get date() {
    return this.startDate;
  }


  /**
   * initWaybackAsync
   * Fetch all available Wayback imagery sources.
   * If the wayback data is not available, just resolve anyway.
   * We do this at init time so that if the url contains a wayback source, the user can use it.
   * @return {Promise} Promise resolved when this data has been loaded
   */
  initWaybackAsync() {
    if (this._initPromise) return this._initPromise;

    return this._initPromise = new Promise(resolve => {
      const context = this.context;
      const assets = context.systems.assets;
      assets.loadAssetAsync('wayback')
        .then(data => Wayback.setWaybackConfigData(data.wayback))
        .then(() => {
          // `getWaybackItems` returns a `Promise` that resolves to a list of `WaybackItem` for all
          // World Imagery Wayback releases from the Wayback archive. The output list is sorted by
          // release date in descending order (newest release is the first item).
          return Wayback.getWaybackItems()
            .then(data => {
              if (!Array.isArray(data) || !data.length) throw new Error('No Wayback data');

              this._oldestDate = data.at(-1).releaseDateLabel;
              this._newestDate = data.at(0).releaseDateLabel;
              this.startDate = this.endDate = this._newestDate;  // default to showing the newest one

              for (const d of data) {
                // Convert placeholder tokens in the URL template from Esri's format to ours.
                d.template = d.itemURL
                  .replaceAll('{level}', '{zoom}')
                  .replaceAll('{row}', '{y}')
                  .replaceAll('{col}', '{x}');

                // Use `releaseDateLabel` as the date, it's an ISO date string like `2024-01-01`
                d.startDate = d.endDate = d.releaseDateLabel;

                this._waybackData.set(d.releaseDateLabel, d);
              }
            });
        })
        .catch(e => console.error(e))  // eslint-disable-line no-console
        .finally(() => resolve());
    });
  }


  /**
   * refreshLocalReleaseDatesAsync
   * Refresh the list of localReleaseDates that appear changed in the current view.
   * Because this is expensive, we cache the result for a given zoomed out tile.
   * Do this sometimes but not too often.
   * @return {Promise} Promise resolved when the localReleaseDates have been loaded
   */
  refreshLocalReleaseDatesAsync() {
    // If we have already fetched the release dates for this box, resolve immediately
    const [lon, lat] = this.context.viewport.centerLoc();
    const hit = this._releaseDateCache.search({ minX: lon, minY: lat, maxX: lon, maxY: lat });
    if (hit.length) {
      return Promise.resolve(hit[0].releaseDates);
    }

    // If a refresh is in progress, return that instead
    if (this._refreshPromise) {
      return this._refreshPromise;
    }

    // Get a single tile at this location
    const TILEZOOM = 14;
    const k = geoZoomToScale(TILEZOOM);
    const [x, y] = new Viewport({ k: k }).project([lon, lat]);
    const viewport = new Viewport({ k: k, x: -x, y: -y });
    const tile = this._tiler.zoomRange(TILEZOOM).getTiles(viewport).tiles[0];

    return this._refreshPromise = new Promise(resolve => {
      Wayback.getWaybackItemsWithLocalChanges({ latitude: lat, longitude: lon }, TILEZOOM)
        .then(data => {
          if (!Array.isArray(data) || !data.length) throw new Error('No locally changed Wayback data');

          const box = tile.wgs84Extent.bbox();
          box.id = tile.id;
          box.releaseDates = new Set(data.map(d => d.releaseDateLabel));
          this._releaseDateCache.insert(box);
          return box.releaseDates;
        })
        .catch(e => {
          console.error(e);  // eslint-disable-line no-console
          return new Set();
        })
        .then(val => {
          this._refreshPromise = null;
          resolve(val);
        });
    });
  }


  /**
   * getMetadata
   * The wayback-core library has a helpful function to get the metadata for us
   */
  getMetadata(loc, tileCoord, callback) {
    const point = { longitude: loc[0], latitude: loc[1] };
    const zoom = Math.min(tileCoord[2], this.zoomExtent[1]);
    const current = this._waybackData.get(this.startDate);
    if (!current) {
      callback(null, {});
      return;
    }

    Wayback.getMetadata(point, zoom, current.releaseNum)
      .then(data => {
        const unknown = this.context.systems.l10n.t('info_panels.background.unknown');
        const captureDate = new Date(data.date).toISOString().split('T')[0];
        const vintage = {
          start: captureDate,
          end: captureDate,
          range: captureDate
        };
        const metadata = {
          vintage: vintage,
          source: clean(data.source),
          description: clean(data.provider),
          resolution: clean(+parseFloat(data.resolution).toFixed(4)),
          accuracy: clean(+parseFloat(data.accuracy).toFixed(4))
        };

        // append units - meters
        if (isFinite(metadata.resolution)) {
          metadata.resolution += ' m';
        }
        if (isFinite(metadata.accuracy)) {
          metadata.accuracy += ' m';
        }

        callback(null, metadata);

        function clean(val) {
          return String(val).trim() || unknown;
        }
      })
      .catch(e => {
        console.error(e);  // eslint-disable-line no-console
        callback(e);
      });
  }

}

