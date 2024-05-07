import * as PIXI from 'pixi.js';
import { Color } from 'pixi.js';

import { AbstractLayer } from './AbstractLayer.js';
import { PixiFeatureLine } from './PixiFeatureLine.js';
import { PixiFeaturePoint } from './PixiFeaturePoint.js';

const CUSTOM_COLOR = 0x2eff2e;


/**
 * PixiLayerGeoScribble
 * This class contains any geo scribbles that should be 'drawn over' the map.
 * Originally from the EveryDoor folks - reference: https://github.com/Zverik/every_door/issues/197
 * This data comes from API at https://geoscribble.osmz.ru/docs#/default/scribbles_scribbles_get.
 * @class
 */
export class PixiLayerGeoScribble extends AbstractLayer {

  /**
   * @constructor
   * @param  scene    The Scene that owns this Layer
   * @param  layerID  Unique string to use for the name of this Layer
   */
  constructor(scene, layerID) {
    super(scene, layerID);

    const geoscribbles = new PIXI.Container();
    geoscribbles.name = `${this.layerID}-geoscribbles`;
    geoscribbles.sortableChildren = false;
    geoscribbles.interactiveChildren = true;
    this.scribblesContainer = geoscribbles;

    const basemapContainer = this.scene.groups.get('basemap');
    basemapContainer.addChild(geoscribbles);
  }


  /**
   * supported
   * Whether the Layer's service exists
   */
  get supported() {
    return !!this.context.services.geoScribble;
  }


  /**
   * enabled
   * Whether the user has chosen to see the Layer
   * Make sure to start the service.
   */
  get enabled() {
    return this._enabled;
  }
  set enabled(val) {
    if (!this.supported) {
      val = false;
    }

    if (val === this._enabled) return;  // no change
    this._enabled = val;

    if (val) {
      this.dirtyLayer();
      this.context.services.geoScribble.startAsync();
    }
  }


  /**
   * render
   * Render the geojson custom data
   * @param  frame        Integer frame being rendered
   * @param  viewport   Pixi viewport to use for rendering
   * @param  zoom         Effective zoom to use for rendering
   */
  render(frame, viewport, zoom) {
    if (!this.enabled) return;

    const service = this.context.services.geoScribble;
    service.loadTiles();

    const geoData = service.getData();

    // No polygons will be returned by the service, so we don't need to consider those types.
    const lines = geoData.filter(d => d.geometry.type === 'LineString' || d.geometry.type === 'MultiLineString');
    const points = geoData.filter(d => d.geometry.type === 'Point' || d.geometry.type === 'MultiPoint');

    this.renderLines(frame, viewport, zoom, lines);
    this.renderPoints(frame, viewport, zoom, points);
  }


  /**
   * getLineStyle
   * @param styleOverride Custom style
   * @param line the geojson formatted scribble object with the following useful (but optional) style properties:
   * `thin` (boolean)
   * `dashed` (boolean)
   * `color` (hex code string like `#FFEECC`)
   * `style` One of: "scribble", "eraser", "road", "track", "footway", "path", "cycleway", "cycleway_shared",
   *          "wall", "fence", "power","stream", "drain", etc.
   * @return a style object that can be given to the pixi renderer
   */
  getLineStyle(styleOverride, line) {
    // Start with the default style object.
    const lineStyle = styleOverride || {
      stroke: { width: 2, color: CUSTOM_COLOR, alpha: 1, cap: PIXI.LINE_CAP.ROUND },
      labelTint: CUSTOM_COLOR
    };

    const color = line.properties.color ? new Color(line.properties.color) : CUSTOM_COLOR;
    const thin = line.properties.thin;
    const dashed = line.properties.dashed;

    // Modify the alpha down a bit to add to 'scribble' factor.
    lineStyle.stroke.alpha = 0.70;
    lineStyle.stroke.color = color;
    lineStyle.stroke.width =  thin ? 4 : 8;
    if (dashed) {
      lineStyle.stroke.dash = thin ? [12,6] : [24,12]; // Thinner lines get shorter dashes
    }
    return lineStyle;
  }


  /**
   * renderLines
   * @param  frame        Integer frame being rendered
   * @param  viewport   Pixi viewport to use for rendering
   * @param  zoom         Effective zoom to use for rendering
   * @param  lines        Array of line data
   * @param styleOverride Custom style
   */
  renderLines(frame, viewport, zoom, lines, styleOverride) {
    const parentContainer = this.scribblesContainer;

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

        const lineStyle = this.getLineStyle(styleOverride, d);
        if (!feature) {
          feature = new PixiFeatureLine(this, featureID);
          feature.style = lineStyle;
          feature.parentContainer = parentContainer;
        }

        // If data has changed.. Replace it.
        if (feature.v !== version) {
          feature.v = version;
          feature.geometry.setCoords(coords);
          feature.label = d.properties.text;
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
   * @param  frame        Integer frame being rendered
   * @param  viewport   Pixi viewport to use for rendering
   * @param  zoom         Effective zoom to use for rendering
   * @param  lines        Array of point data
   */
  renderPoints(frame, viewport, zoom, points) {
    const parentContainer = this.scribblesContainer;

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
          feature.label = d.properties.text;
          feature.setData(dataID, d);
        }

        this.syncFeatureClasses(feature);
        feature.update(viewport, zoom);
        this.retainFeature(feature, frame);
      }
    }
  }

}
