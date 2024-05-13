import * as PIXI from 'pixi.js';
import { gpx, kml } from '@tmcw/togeojson';
import geojsonRewind from '@mapbox/geojson-rewind';
import { parse as wktParse } from 'wkt';
import { Color } from 'pixi.js';

import { geojsonExtent, geojsonFeatures } from '../util/util.js';
import { AbstractLayer } from './AbstractLayer.js';
import { PixiFeatureLine } from './PixiFeatureLine.js';
import { PixiFeaturePoint } from './PixiFeaturePoint.js';
import { PixiFeaturePolygon } from './PixiFeaturePolygon.js';
import { utilFetchResponse } from '../util/index.js';

const CUSTOM_COLOR = 0x00ffff;


/**
 * PixiLayerRapidOverlay
 * This class contains any overlay vectors that should be 'drawn over' the map, usually at low zooms.
 * The data for these are scraped from the RapidSystem's datasets, specifically the 'overlay' field.
 * @class
 */
export class PixiLayerRapidOverlay extends AbstractLayer {

  /**
   * @constructor
   * @param  scene    The Scene that owns this Layer
   * @param  layerID  Unique string to use for the name of this Layer
   */
  constructor(scene, layerID) {
    super(scene, layerID);
    this._clear();
    this._enabled = true;
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
    const datasets = this.context.systems.rapid.datasets;

    // for (const [key, dataset] in datasets) {

    // }

    const customColor = new PIXI.Color(datasets.get('fbRoads').color);
    const overlay = datasets.get('fbRoads').overlay;
    let overlayData = [];
    if (overlay && vtService) {   // fetch data from vector tile service
      if ((zoom >= overlay.minZoom ) && (zoom <= overlay.maxZoom)) {  // avoid firing off too many API requests 
        vtService.loadTiles(overlay.url);
      }
      overlayData = vtService.getData(overlay.url).map(d => d.geojson);
    }

    const polygons = overlayData.filter(d => d.geometry.type === 'Polygon' || d.geometry.type === 'MultiPolygon');
    const lines = overlayData.filter(d => d.geometry.type === 'LineString' || d.geometry.type === 'MultiLineString');
    const points = overlayData.filter(d => d.geometry.type === 'Point' || d.geometry.type === 'MultiPoint');

    this.renderPolygons(frame, viewport, zoom, polygons, customColor);
    this.renderLines(frame, viewport, zoom, lines, customColor);
    this.renderPoints(frame, viewport, zoom, points, customColor);
  }


  /**
   * renderPolygons
   * @param  frame      Integer frame being rendered
   * @param  viewport   Pixi viewport to use for rendering
   * @param  zoom       Effective zoom to use for rendering
   * @param  polygons   Array of polygon data
   * @param  color      The color to use
   */
  renderPolygons(frame, viewport, zoom, polygons, color) {
    const l10n = this.context.systems.l10n;
    const parentContainer = this.scene.groups.get('basemap');

    const polygonStyle = {
      fill: { color: color, alpha: 0.3, },
      stroke: { width: 2, color: color, alpha: 1, cap: PIXI.LINE_CAP.ROUND },
      labelTint: color
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
   * @param  color      The color to use
   * @param styleOverride Custom style
   */
  renderLines(frame, viewport, zoom, lines, color, styleOverride) {
    const l10n = this.context.systems.l10n;
    const parentContainer = this.scene.groups.get('basemap');

    const lineStyle = styleOverride || {
      stroke: { width: 2, color: color, alpha: 1, cap: PIXI.LINE_CAP.ROUND },
      labelTint: color
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
   * @param  color      The color to use
   */
  renderPoints(frame, viewport, zoom, points, color) {
    const l10n = this.context.systems.l10n;
    const parentContainer = this.scene.groups.get('points');

    const pointStyle = {
      markerName: 'largeCircle',
      markerTint: color,
      iconName: 'maki-circle-stroked',
      labelTint: color
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
   * Return true if there is no overlay data to display
   * @return {boolean}  `true` if there is a vector tile template or geojson to display
   */
  hasData() {
      return !!this.context.systems.rapid.datasets.get('fbRoads').overlay;
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
   * _clear
   * Clear state to prepare for new custom data
   */
  _clear() {
    this._dataUsed = null;
    this._wkt = null;
    this._urls = null;
    this._geojson = null;
    this._geojsonExtent = null;
  }

}
