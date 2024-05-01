import * as PIXI from 'pixi.js';
import { gpx, kml } from '@tmcw/togeojson';
import geojsonRewind from '@mapbox/geojson-rewind';
import { parse as wktParse } from 'wkt';

import { geojsonExtent, geojsonFeatures } from '../util/util.js';
import { AbstractLayer } from './AbstractLayer.js';
import { PixiFeatureLine } from './PixiFeatureLine.js';
import { PixiFeaturePoint } from './PixiFeaturePoint.js';
import { PixiFeaturePolygon } from './PixiFeaturePolygon.js';
import { utilFetchResponse } from '../util/index.js';

const CUSTOM_COLOR = 0x00ffff;


/**
 * PixiLayerCustomData
 * This class contains any custom data traces that should be 'drawn over' the map.
 * This data only comes from the 'load custom data' option in the map data sidebar.
 * @class
 */
export class PixiLayerCustomData extends AbstractLayer {

  /**
   * @constructor
   * @param  scene    The Scene that owns this Layer
   * @param  layerID  Unique string to use for the name of this Layer
   */
  constructor(scene, layerID) {
    super(scene, layerID);

    this._clear();
    this._fileReader = new FileReader();

    // Ensure methods used as callbacks always have `this` bound correctly.
    this._hashchange = this._hashchange.bind(this);
    this._updateHash = this._updateHash.bind(this);
    this._setFile = this._setFile.bind(this);
    this.setFileList = this.setFileList.bind(this);

    // Setup event handlers..
    // drag and drop
    function over(d3_event) {
      d3_event.stopPropagation();
      d3_event.preventDefault();
      d3_event.dataTransfer.dropEffect = 'copy';
    }

    this.context.container()
      .attr('dropzone', 'copy')
      .on('dragenter.draganddrop', over)
      .on('dragexit.draganddrop', over)
      .on('dragover.draganddrop', over)
      .on('drop.draganddrop', d3_event => {
        d3_event.stopPropagation();
        d3_event.preventDefault();
        this.setFileList(d3_event.dataTransfer.files);
      });

    // hashchange - pick out the 'gpx' param
    this.context.systems.urlhash
      .on('hashchange', this._hashchange);

    // layerchange - update the url hash
    scene.on('layerchange', this._updateHash);
  }


  /**
   * render
   * Render the GeoJSON custom data
   * @param  frame      Integer frame being rendered
   * @param  viewport   Pixi viewport to use for rendering
   * @param  zoom       Effective zoom to use for rendering
   */
  render(frame, viewport, zoom) {
    if (!this.enabled || !(this.hasData())) return;

    const vtService = this.context.services.vectortile;
    let geoData = [];
    if (this._template && vtService) {   // fetch data from vector tile service
      if (zoom >= 13) {  // avoid firing off too many API requests
        vtService.loadTiles(this._template);
      }
      geoData = vtService.getData(this._template).map(d => d.geojson);
    } else {
      geoData = geojsonFeatures(this._geojson);
    }

    const polygons = geoData.filter(d => d.geometry.type === 'Polygon' || d.geometry.type === 'MultiPolygon');
    const lines = geoData.filter(d => d.geometry.type === 'LineString' || d.geometry.type === 'MultiLineString');
    const points = geoData.filter(d => d.geometry.type === 'Point' || d.geometry.type === 'MultiPoint');

    this.renderPolygons(frame, viewport, zoom, polygons);
    this.renderLines(frame, viewport, zoom, lines);
    this.renderPoints(frame, viewport, zoom, points);

    // Now render any extras, like gridlines in square bounding boxes or arbitrary WKT polygons/multipolys.
    const gridLines = this.createGridLines(lines);
    const gridStyle = { stroke: { width: 0.5, color: 0x0ffff, alpha: 0.5, cap: PIXI.LINE_CAP.ROUND }};
    this.renderLines(frame, viewport, zoom, gridLines, gridStyle);
  }


  /**
   * createGridLines
   * creates interstitial grid lines inside the rectangular bounding box, if specified.
   * @param lines - the line string(s) that may contain a rectangular bounding box
   * @returns a list of linestrings to draw as gridlines.
  */
  createGridLines(lines) {
    const context = this.context;
    const imagery = context.systems.imagery;
    const rapid = context.systems.rapid;

    const numSplits = imagery.numGridSplits;
    let gridLines = [];

    // 'isTaskRectangular' implies one and only one rectangular linestring.
    if (rapid.isTaskRectangular && numSplits > 0) {
      const box = lines[0];

      const lats = box.geometry.coordinates.map((f) => f[0]);
      const lons = box.geometry.coordinates.map((f) => f[1]);

      const minLat = Math.min(...lats);
      const minLon = Math.min(...lons);
      const maxLat = Math.max(...lats);
      const maxLon = Math.max(...lons);

      let latIncrement = (maxLat - minLat) / numSplits;
      let lonIncrement = (maxLon - minLon) / numSplits;

      // num splits is a grid specificer, so 2 => 2x2 grid, 3 => 3x3 grid, all the way up to 6 => 6x6 grid.
      for (let i = 1; i < numSplits; i++) {
        let thisLat = minLat + latIncrement * i;
        let thisLon = minLon + lonIncrement * i;

        gridLines.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [minLat, thisLon],
              [maxLat, thisLon],
            ],
          },
          id: numSplits + 'gridcol' + i,
        });
        gridLines.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [thisLat, minLon],
              [thisLat, maxLon],
            ],
          },
          id: numSplits + 'gridrow' + i,
        });
      }
    }
    return gridLines;
  }


  /**
   * renderPolygons
   * @param  frame      Integer frame being rendered
   * @param  viewport   Pixi viewport to use for rendering
   * @param  zoom       Effective zoom to use for rendering
   * @param  polygons   Array of polygon data
   */
  renderPolygons(frame, viewport, zoom, polygons) {
    const l10n = this.context.systems.l10n;
    const parentContainer = this.scene.groups.get('basemap');

    const polygonStyle = {
      fill: { color: CUSTOM_COLOR, alpha: 0.3, },
      stroke: { width: 2, color: CUSTOM_COLOR, alpha: 1, cap: PIXI.LINE_CAP.ROUND },
      labelTint: CUSTOM_COLOR
    };

    for (const d of polygons) {
      const dataID = d.__featurehash__;
      const version = d.v || 0;
      const parts = (d.geometry.type === 'Polygon') ? [d.geometry.coordinates]
        : (d.geometry.type === 'MultiPolygon') ? d.geometry.coordinates : [];

      for (let i = 0; i < parts.length; ++i) {
        const coords = parts[i];
        const featureID = `${this.layerID}-${dataID}-${i}`;
        let feature = this.features.get(featureID);

        // If feature existed before as a different type, recreate it.
        if (feature && feature.type !== 'polygon') {
          feature.destroy();
          feature = null;
        }

        if (!feature) {
          feature = new PixiFeaturePolygon(this, featureID);
          feature.style = polygonStyle;
          feature.parentContainer = parentContainer;
        }

        // If data has changed.. Replace it.
        if (feature.v !== version) {
          feature.v = version;
          feature.geometry.setCoords(coords);
          feature.label = l10n.displayName(d.properties);
          feature.setData(dataID, d);
        }

        this.syncFeatureClasses(feature);
        feature.update(viewport, zoom);
        this.retainFeature(feature, frame);
      }
    }
  }


  /**
   * renderLines
   * @param  frame      Integer frame being rendered
   * @param  viewport   Pixi viewport to use for rendering
   * @param  zoom       Effective zoom to use for rendering
   * @param  lines      Array of line data
   * @param styleOverride Custom style
   */
  renderLines(frame, viewport, zoom, lines, styleOverride) {
    const l10n = this.context.systems.l10n;
    const parentContainer = this.scene.groups.get('basemap');

    const lineStyle = styleOverride || {
      stroke: { width: 2, color: CUSTOM_COLOR, alpha: 1, cap: PIXI.LINE_CAP.ROUND },
      labelTint: CUSTOM_COLOR
    };

    for (const d of lines) {
      const dataID = d.__featurehash__;
      const version = d.v || 0;
      const parts = (d.geometry.type === 'LineString') ? [d.geometry.coordinates]
        : (d.geometry.type === 'MultiLineString') ? d.geometry.coordinates : [];

      for (let i = 0; i < parts.length; ++i) {
        const coords = parts[i];
        const featureID = `${this.layerID}-${dataID}-${i}`;
        let feature = this.features.get(featureID);

        // If feature existed before as a different type, recreate it.
        if (feature && feature.type !== 'line') {
          feature.destroy();
          feature = null;
        }

        if (!feature) {
          feature = new PixiFeatureLine(this, featureID);
          feature.style = lineStyle;
          feature.parentContainer = parentContainer;
        }

        // If data has changed.. Replace it.
        if (feature.v !== version) {
          feature.v = version;
          feature.geometry.setCoords(coords);
          feature.label = l10n.displayName(d.properties);
          feature.setData(dataID, d);
        }

        this.syncFeatureClasses(feature);
        feature.update(viewport, zoom);
        this.retainFeature(feature, frame);
      }
    }
  }


  /**
   * renderPoints
   * @param  frame      Integer frame being rendered
   * @param  viewport   Pixi viewport to use for rendering
   * @param  zoom       Effective zoom to use for rendering
   * @param  lines      Array of point data
   */
  renderPoints(frame, viewport, zoom, points) {
    const l10n = this.context.systems.l10n;
    const parentContainer = this.scene.groups.get('points');

    const pointStyle = {
      markerName: 'largeCircle',
      markerTint: CUSTOM_COLOR,
      iconName: 'maki-circle-stroked',
      labelTint: CUSTOM_COLOR
    };

    for (const d of points) {
      const dataID = d.__featurehash__;
      const version = d.v || 0;
      const parts = (d.geometry.type === 'Point') ? [d.geometry.coordinates]
        : (d.geometry.type === 'MultiPoint') ? d.geometry.coordinates : [];

      for (let i = 0; i < parts.length; ++i) {
        const coords = parts[i];
        const featureID = `${this.layerID}-${dataID}-${i}`;
        let feature = this.features.get(featureID);

        // If feature existed before as a different type, recreate it.
        if (feature && feature.type !== 'point') {
          feature.destroy();
          feature = null;
        }

        if (!feature) {
          feature = new PixiFeaturePoint(this, featureID);
          feature.style = pointStyle;
          feature.parentContainer = parentContainer;
        }

        // If data has changed.. Replace it.
        if (feature.v !== version) {
          feature.v = version;
          feature.geometry.setCoords(coords);
          feature.label = l10n.displayName(d.properties);
          feature.setData(dataID, d);
        }

        this.syncFeatureClasses(feature);
        feature.update(viewport, zoom);
        this.retainFeature(feature, frame);
      }
    }
  }


  /**
   * hasData
   * Return true if there is custom data to display
   * @return {boolean}  `true` if there is a vector tile template or geojson to display
   */
  hasData() {
    return !!(this._template || this._geojson);
  }

  /**
   * dataUsed
   * @return  {Array}  Array of single element for the data layer currently enabled
   */
  dataUsed() {
    return this._dataUsed ? [ this._dataUsed ] : [];
  }


  /**
   * fitZoom
   * Fits the map view to show the extent of the loaded geojson data
   */
  fitZoom() {
    const extent = this._geojsonExtent;
    if (!extent) return;

    this.context.systems.map.trimmedExtent(extent);
  }


  /**
   * getFileList
   * This returns any FileList which we have stored
   * @return {FileList|null}  Files, or null if none
   */
  getFileList() {
    return this._fileList;
  }


  /**
   * setFileList
   * This sets a FileList which we got from either a drag-and-drop operation or a `<input 'type'='file'>` field.
   * It is Array-like, but we only look at the first one.
   *
   * https://developer.mozilla.org/en-US/docs/Web/API/FileList
   * https://developer.mozilla.org/en-US/docs/Web/API/File
   * https://developer.mozilla.org/en-US/docs/Web/API/FileReader
   * @param  {FileList|null} fileList  Files to process (only first one is used), or null to reset
   */
  setFileList(fileList) {
    this._clear();
    this._fileList = fileList;
    this.scene.disableLayers(this.layerID);  // emits 'layerchange', so UI gets updated

    if (!fileList || !fileList.length) return;

    const file = fileList[0];
    const extension = this._getExtension(file.name);

    this._fileReader.onload = (e) => {
      this._fileReader.onload = null;
      this._setFile(e.target.result, extension);
    };
    this._fileReader.readAsText(file);
  }


  /**
   * setUrl
   * This checks a url that we got from either the custom data screen or the `data=` or `gpx=` url parameter
   * It decides whether the url looks like a single file to load or a vector tile template url.
   * @param  {string}  url
   */
  setUrl(url) {
    this._clear();
    this._url = url;
    this.scene.disableLayers(this.layerID);  // emits 'layerchange', so UI gets updated

    if (!url) return;

    // Strip off any querystring/hash from the url before checking extension
    const testUrl = url.toLowerCase().split(/[?#]/)[0];
    const isTask = testUrl.includes('project') && testUrl.includes('task') && testUrl.includes('gpx');
    const extension = isTask ? '.gpx' : this._getExtension(testUrl);

    if (extension) {   // Looks like a gpx, kml, geojson file.. load it!
      fetch(url)
        .then(utilFetchResponse)
        .then(data => {
          this._setFile(data, extension);
          if (isTask) {
            this._dataUsed = null;    // A task boundary is not really a data source
            this.context.systems.rapid.setTaskExtentByGpxData(data);
          }
        })
        .catch(e => console.error(e));  // eslint-disable-line

    } else {   // Looks like a vector tile url template
      this._setUrlTemplate(url);
    }
  }


  /**
   * _setUrlTemplate
   * A url template is something we can pass to the Vector Tile service. It can be:
   *   - Mapbox Vector Tiles (MVT) made available from a z/x/y tileserver
   *   - Protomaps .pmtiles single-file archive containing MVT
   * @param  {string}  url
   */
  _setUrlTemplate(url) {
    // Test source against OSM imagery blocklists..
    const osm = this.context.services.osm;
    if (osm) {
      const blocklists = osm.imageryBlocklists ?? [];
      let fail = false;
      let tested = 0;
      let regex;

      for (regex of blocklists) {
        fail = regex.test(url);
        tested++;
        if (fail) return;   // a banned source
      }

      // ensure at least one test was run.
      if (!tested) {
        regex = /.*\.google(apis)?\..*\/(vt|kh)[\?\/].*([xyz]=.*){3}.*/;
        fail = regex.test(url);
        if (fail) return;   // a banned source
      }
    }

    this._template = url;
    // strip off the querystring/hash from the template, it often includes the access token
    this._dataUsed = 'vectortile:' + url.split(/[?#]/)[0];
    this.scene.enableLayers(this.layerID);  // emits 'layerchange', so UI gets updated
  }


  /**
   * _setFile
   * This function is either called from the `FileReader` or the `fetch` then chain.
   * All files get converted to GeoJSON
   * @param  {string|Object}  data       The file data
   * @param  {string}         extension  The file extension
   */
  _setFile(data, extension) {
    if (!data) return;

    let geojson;
    switch (extension) {
      case '.gpx':
        geojson = gpx( (data instanceof Document) ? data : _toXML(data) );
        break;
      case '.kml':
        geojson = kml( (data instanceof Document) ? data : _toXML(data) );
        break;
      case '.geojson':
      case '.json':
        geojson = (data instanceof Object) ? data : JSON.parse(data);
        break;
    }

    geojson = geojson || {};
    if (Object.keys(geojson).length) {
      this._dataUsed = `${extension} data file`;
      this._geojson = this._ensureIDs(geojson);
      geojsonRewind(this._geojson);
      this._geojsonExtent = geojsonExtent(geojson);
      this.fitZoom();
      this.scene.enableLayers(this.layerID);  // emits 'layerchange', so UI gets updated
    }

    function _toXML(text) {
      return (new DOMParser()).parseFromString(text, 'text/xml');
    }
  }


  /**
   * _ensureIDs
   * After loading GeoJSON data, check the Features and make sure they have unique IDs.
   * This function modifies the GeoJSON features in place and then returns it.
   * @param  {Object}  geojson - A GeoJSON Feature or FeatureCollection
   * @return {Object}  The GeoJSON, but with IDs added
   */
  _ensureIDs(geojson) {
    if (!geojson) return null;

    for (const feature of geojsonFeatures(geojson)) {
      this._ensureFeatureID(feature);
    }
    return geojson;
  }


  /**
   * _ensureFeatureID
   * Ensure that this GeoJSON Feature has a unique ID.
   * This function modifies the GeoJSON Feature in place and then returns it.
   * @param  {Object}  A GeoJSON feature
   * @return {Object}  The GeoJSON Feature, but with an ID added
   */
  _ensureFeatureID(feature) {
    if (!feature) return;

    const vtService = this.context.services.vectortile;
    const featureID = vtService.getNextID();
    feature.id = featureID;
    feature.__featurehash__ = featureID;
    return feature;
  }


  /**
   * _getExtension
   * Return the extension at the end of a filename or url.
   * This only returns the extension if it one of the recognized file types:
   *   '.gpx', '.kml', '.json', '.geojson'
   * @param  {string}       name - A filename or url
   * @return {string|null}  The extension including the dot '.'
   */
  _getExtension(name) {
    if (!name) return;
    const regex = /\.(gpx|kml|(geo)?json)$/i;
    const match = name.match(regex);
    return match && match.length && match[0];
  }


  /**
   * _hashchange
   * Respond to any changes appearing in the url hash
   * @param  currParams   Map(key -> value) of the current hash parameters
   * @param  prevParams   Map(key -> value) of the previous hash parameters
   */
  _hashchange(currParams, prevParams) {
    // 'data' (or 'gpx', legacy)
    const newData = currParams.get('data') || currParams.get('gpx');
    const oldData = prevParams.get('data') || prevParams.get('gpx');
    if (newData !== oldData) {
      this._clear();
      if (typeof newData === 'string') {
        // Attempt to parse the data string as a WKT.
        // If it is, treat it as such. If not, treat it as a URL.
        const geojson = this._parseAsWkt(newData);
        if (geojson) {
          this._wkt = newData.toUpperCase();  // convention is to use uppercase
          this._setFile(geojson, '.geojson');
          this._dataUsed = null;  // A wkt area of interest is not really a data source
        } else {
          this.setUrl(newData);
        }
      }
    }
  }


  /**
   * _updateHash
   * Push changes in custom data url to the urlhash
   */
  _updateHash() {
    const urlhash = this.context.systems.urlhash;

    // reset
    urlhash.setParam('gpx', null);
    urlhash.setParam('data', null);

    if (!this.enabled) return;

    if (typeof this._wkt === 'string') {
      urlhash.setParam('data', this._wkt);
    } else if (typeof this._url === 'string') {
      // 'gpx' is considered a "legacy" param..
      // We'll only set it if the url really does seem to be for a gpx file
      if (/gpx/i.test(this._url)) {
        urlhash.setParam('gpx', this._url);
      } else {
        urlhash.setParam('data', this._url);
      }
    }
  }


  /**
   * _parseAsWkt
   * creates WKT Polys from a raw string supplied by the `data` url param.
   *
   * @param wktString - the poly or multipoly string(s) in wkt format
   * i.e. 'POLYGON((-10 10, -10 -10, 10 -10, 10 10, -10 10))'
   * or
   *  'MULTIPOLYGON (((-1.5 1.3, -1.5 1.3, -1.5 1.3, -1.5 1.3, -1.4 1.3, -1.4 1.3, -1.5 1.3)),
   *   ((-1.5 1.3, -1.5 1.3, -1.5 1.3, -1.4 1.3, -1.5 1.3)))'
   * @returns a list containing polygons to draw as a custom shape, or null
   */
  _parseAsWkt(wktString) {
    const parsedWkt = wktParse(wktString);

    // If it couldn't be parsed, or if it isn't a poly/multipoly, we can't render it.
    if (!parsedWkt || (parsedWkt.type !== 'Polygon' && parsedWkt.type !== 'MultiPolygon')) {
      return null;
    }

    return {
      type: 'Feature',
      geometry: {
        type: parsedWkt.type,
        coordinates: parsedWkt.coordinates,
      },
      id: 'customWktPoly',
      properties: {}
    };
  }


  /**
   * _clear
   * Clear state to prepare for new custom data
   */
  _clear() {
    this._dataUsed = null;
    this._fileList = null;
    this._template = null;
    this._wkt = null;
    this._url = null;
    this._geojson = null;
    this._geojsonExtent = null;
  }

}
