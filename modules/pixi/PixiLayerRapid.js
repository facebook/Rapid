import * as PIXI from 'pixi.js';
import geojsonRewind from '@mapbox/geojson-rewind';
import { utilStringQs } from '@rapid-sdk/util';

import { AbstractLayer } from './AbstractLayer.js';
import { PixiFeatureLine } from './PixiFeatureLine.js';
import { PixiFeaturePoint } from './PixiFeaturePoint.js';
import { PixiFeaturePolygon } from './PixiFeaturePolygon.js';

const MINZOOM = 12;


/**
 * PixiLayerRapid
 * @class
 */
export class PixiLayerRapid extends AbstractLayer {

  /**
   * @constructor
   * @param  scene    The Scene that owns this Layer
   * @param  layerID  Unique string to use for the name of this Layer
   */
  constructor(scene, layerID) {
    super(scene, layerID);
    this.enabled = true;     // Rapid features should be enabled by default

    this._resolved = new Map();  // Map<entityID, GeoJSON feature>

//// shader experiment:
//this._uniforms = {
// u_resolution: [300.0, 300.0],
// u_time: 0.0,
// tint: new Float32Array([1, 1, 1, 1]),
// translationMatrix: new PIXI.Matrix(),
// default: this.gfx.renderer.plugins.batch._shader.uniformGroup
//};
//
//const vert = `
//precision highp float;
//attribute vec2 aVertexPosition;
//
//uniform mat3 projectionMatrix;
//uniform mat3 translationMatrix;
//
//void main(void) {
//  gl_Position = vec4((projectionMatrix * translationMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
//}
//`;
//
//const frag =`
//// varying vec2 vTextureCoord;
//// uniform sampler2D uSampler;
//// void main() {
////   // gl_FragColor *= texture2D(uSampler, vTextureCoord);
////  gl_FragColor = vec4(gl_FragCoord.x/1000.0, gl_FragCoord.y/1000.0, 0.0, 1.0);
//// }
////
//// https://thebookofshaders.com/examples/?chapter=proceduralTexture
//// Title: Cellular Noise
//
//#ifdef GL_ES
//precision mediump float;
//#endif
//
//uniform vec2 u_resolution;
//uniform float u_time;
//uniform vec4 tint;
//
//vec2 random2(vec2 p) {
//  return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*u_time);
//}
//
//float cellular(vec2 p) {
//  vec2 i_st = floor(p);
//  vec2 f_st = fract(p);
//  float m_dist = 10.;
//  for (int j=-1; j<=1; j++ ) {
//    for (int i=-1; i<=1; i++ ) {
//      vec2 neighbor = vec2(float(i),float(j));
//      vec2 point = random2(i_st + neighbor);
//      point = 0.5 + 0.5*sin(6.2831*point);
//      vec2 diff = neighbor + point - f_st;
//      float dist = length(diff);
//      if ( dist < m_dist ) {
//        m_dist = dist;
//      }
//    }
//  }
//  return m_dist;
//}
//
//void main() {
//  vec4 magenta = vec4(218.0/255.0, 38.0/255.0, 211.0/255.0, 0.7);
//  vec2 st = gl_FragCoord.xy / u_resolution.xy;
//  st.x *= u_resolution.x / u_resolution.y;
//  st *= 10.0;
//
//  float v = cellular(st);
//  gl_FragColor = vec4(vec3(v),1.0) * magenta;
//}
//`;
//
//this._customshader = new PIXI.Shader.from(vert, frag, this._uniforms);
  }


  /**
   * supported
   * Whether the Layer's service exists
   */
  get supported() {
    // return true if any of these are installed
    const services = this.context.services;
    return !!(services.mapwithai || services.esri || services.overture);
  }


  /**
   * enabled
   * Whether the user has chosen to see the Layer
   * Make sure to start the services first.
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

    const context = this.context;
    const gfx = context.systems.gfx;
    const esri = context.services.esri;
    const mapwithai = context.services.mapwithai;
    const overture = context.services.overture;

    // This code is written in a way that we can work with whatever
    // data-providing services are installed.
    const services = [];
    if (esri)      services.push(esri);
    if (mapwithai) services.push(mapwithai);
    if (overture)  services.push(overture);

    if (val && services.length) {
      Promise.all(services.map(service => service.startAsync()))
        .then(() => gfx.immediateRedraw());
    }
  }


  /**
   * reset
   * Every Layer should have a reset function to replace any Pixi objects and internal state.
   */
  reset() {
    super.reset();
    this._resolved.clear();  // cached geojson features

    const groupContainer = this.scene.groups.get('basemap');

    // Remove any existing containers
    for (const child of groupContainer.children) {
      if (child.label.startsWith(this.layerID + '-')) {   // 'rapid-*'
        groupContainer.removeChild(child);
        child.destroy({ children: true });  // recursive
      }
    }

    // We don't add area or line containers here - `renderDataset()` does it as needed
  }


  /**
   * render
   * Render any data we have, and schedule fetching more of it to cover the view
   * @param  frame      Integer frame being rendered
   * @param  viewport   Pixi viewport to use for rendering
   * @param  zoom       Effective zoom to use for rendering
   */
  render(frame, viewport, zoom) {
    const rapid = this.context.systems.rapid;
    if (!this.enabled || !rapid.datasets.size || zoom < MINZOOM) return;

// shader experiment
//const offset = this.gfx.pixi.stage.position;
//const transform = this.gfx.pixi.stage.worldTransform;
//this._uniforms.translationMatrix = transform.clone().translate(-offset.x, -offset.y);
//this._uniforms.u_time = frame/10;

    for (const dataset of rapid.datasets.values()) {
      this.renderDataset(dataset, frame, viewport, zoom);
    }
  }


  /**
   * renderDataset
   * Render any data we have, and schedule fetching more of it to cover the view
   *
   * @param  dataset    Object
   * @param  frame      Integer frame being rendered
   * @param  viewport   Pixi viewport to use for rendering
   * @param  zoom       Effective zoom to use for rendering
   */
  renderDataset(dataset, frame, viewport, zoom) {
    const context = this.context;
    const rapid = context.systems.rapid;

    const dsEnabled = (dataset.added && dataset.enabled);
    if (!dsEnabled) return;

    const service = context.services[dataset.service];  // 'mapwithai' or 'esri'
    if (!service?.started) return;

    const useConflationStr = utilStringQs(window.location.hash).conflation;

    let useConflation = dataset.conflated;

    if (useConflationStr === 'false' || useConflationStr === 'no') {
      useConflation = false;
    }

    // Adjust the dataset id for whether we want the data conflated or not
    const datasetID = dataset.id + (useConflation ? '-conflated' : '');

    // Overture data isn't editable, nor conflatable... yet.
    let dsGraph = null;
    if (dataset.service !== 'overture') {
       dsGraph = service.graph(datasetID);
    }

    // Filter out features that have already been accepted or ignored by the user.
    function isAcceptedOrIgnored(entity) {
      return rapid.acceptIDs.has(entity.id) || rapid.ignoreIDs.has(entity.id);
    }

    // Gather data
    const data = { points: [], vertices: new Set(), lines: [], polygons: [] };

    /* Facebook AI/ML */
    if (dataset.service === 'mapwithai') {
      if (zoom >= 15) {  // avoid firing off too many API requests
        service.loadTiles(datasetID);  // fetch more
      }

      // Skip features already accepted/ignored by the user
      const entities = service.getData(datasetID)
        .filter(entity => entity.type === 'way' && !isAcceptedOrIgnored(entity));

      // fb_ai service gives us roads and buildings together,
      // so filter further according to which dataset we're drawing
      if (dataset.id === 'fbRoads'
          || dataset.id === 'omdFootways'
          || dataset.id === 'metaSyntheticFootways'
          || dataset.id === 'rapid_intro_graph') {
        data.lines = entities.filter(d => d.geometry(dsGraph) === 'line' && !!d.tags.highway);

        // Gather endpoint vertices, we will render these also
        for (const way of data.lines) {
          const first = dsGraph.entity(way.first());
          const last = dsGraph.entity(way.last());
          data.vertices.add(first);
          data.vertices.add(last);
        }

      } else {  // ms buildings or esri buildings through conflation service
        data.polygons = entities.filter(d => d.geometry(dsGraph) === 'area');
      }

    /* ESRI ArcGIS */
    } else if (dataset.service === 'esri') {
      if (zoom >= 14) {  // avoid firing off too many API requests
        service.loadTiles(datasetID);  // fetch more
      }

      const entities = service.getData(datasetID);
      for (const entity of entities) {
        if (isAcceptedOrIgnored(entity)) continue;   // skip features already accepted/ignored by the user
        const geom = entity.geometry(dsGraph);
        if (geom === 'point' && !!entity.__fbid__) {  // standalone points only (not vertices/childnodes)
          data.points.push(entity);
        } else if (geom === 'line') {
          data.lines.push(entity);
        } else if (geom === 'area') {
          data.polygons.push(entity);
        }
      }

    } else if (dataset.service === 'overture') {
      if (zoom >= 16) {  // avoid firing off too many API requests
        service.loadTiles(datasetID);  // fetch more
      }
      const entities = service.getData(datasetID);

      // Support both points (places) and polygons (buildings)
      for (const entity of entities) {
        if (isAcceptedOrIgnored(entity)) continue;

        if (datasetID.includes('places')) {
          // Points for places (GeoJSON features from VectorTileService)
          entity.overture = true;
          entity.__datasetid__ = datasetID;
          data.points.push(entity);
        } else if (datasetID.includes('buildings')) {
          // Polygons for buildings (OSM entities from OvertureService)
          if (entity.type === 'way') {
            data.polygons.push(entity);
          }
        }
      }

      // For buildings, we need the graph to resolve node coordinates
      if (datasetID.includes('buildings')) {
        dsGraph = service.graph(datasetID);
      }
    }

    const pointsContainer = this.scene.groups.get('points');
    const basemapContainer = this.scene.groups.get('basemap');
    const areasID = `${this.layerID}-${dataset.id}-areas`;
    const linesID = `${this.layerID}-${dataset.id}-lines`;

    let areasContainer = basemapContainer.getChildByLabel(areasID);
    if (!areasContainer) {
      areasContainer = new PIXI.Container();
      areasContainer.label= areasID;
      areasContainer.sortableChildren = true;
      basemapContainer.addChild(areasContainer);
    }

    let linesContainer = basemapContainer.getChildByLabel(linesID);
    if (!linesContainer) {
      linesContainer = new PIXI.Container();
      linesContainer.label= linesID;
      linesContainer.sortableChildren = true;
      basemapContainer.addChild(linesContainer);
    }

    this.renderPolygons(areasContainer, dataset, dsGraph, frame, viewport, zoom, data);
    this.renderLines(linesContainer, dataset, dsGraph, frame, viewport, zoom, data);
    this.renderPoints(pointsContainer, dataset, dsGraph, frame, viewport, zoom, data);
  }


  /**
   * renderPolygons
   */
  renderPolygons(parentContainer, dataset, graph, frame, viewport, zoom, data) {
    const color = new PIXI.Color(dataset.color);
    const l10n = this.context.systems.l10n;

    for (const entity of data.polygons) {
      // Cache GeoJSON resolution, as we expect the rewind and asGeoJSON calls to be kinda slow.
      // This is ok because the rapid features won't change once loaded.
      let geojson = this._resolved.get(entity.id);
      if (!geojson) {
        geojson = geojsonRewind(entity.asGeoJSON(graph), true);
        this._resolved.set(entity.id, geojson);
      }

      const parts = (geojson.type === 'Polygon') ? [geojson.coordinates]
        : (geojson.type === 'MultiPolygon') ? geojson.coordinates : [];

      for (let i = 0; i < parts.length; ++i) {
        const coords = parts[i];
        const featureID = `${this.layerID}-${dataset.id}-${entity.id}-${i}`;
        let feature = this.features.get(featureID);

        if (!feature) {
          feature = new PixiFeaturePolygon(this, featureID);

          feature.geometry.setCoords(coords);
          const area = feature.geometry.origExtent.area();   // estimate area from extent for speed
          feature.container.zIndex = -area;      // sort by area descending (small things above big things)

          feature.parentContainer = parentContainer;
          feature.rapidFeature = true;
          feature.setData(entity.id, entity);
// shader experiment:
// check https://github.com/pixijs/pixijs/discussions/7728 for some discussion
// we are fighting with the batch system which is unfortunate
// feature.fill.geometry.isBatchable = () => { return false; };
// feature.fill.shader = this._customshader;

// also custom `.shader` dont work on sprites at all, and so we'd have to switch to meshes maybe?
        }

        this.syncFeatureClasses(feature);

        if (feature.dirty) {
          const style = {
            labelTint: color,
            fill: { width: 2, color: color, alpha: 0.3 },
            // fill: { width: 2, color: color, alpha: 1, pattern: 'stripe' }
          };
          feature.style = style;
          feature.label = l10n.displayName(entity.tags);
          feature.update(viewport, zoom);
        }

        this.retainFeature(feature, frame);
      }
    }
  }


  /**
   * renderLines
   */
  renderLines(parentContainer, dataset, graph, frame, viewport, zoom, data) {
    const color = new PIXI.Color(dataset.color);
    const l10n = this.context.systems.l10n;

    for (const entity of data.lines) {
      const featureID = `${this.layerID}-${dataset.id}-${entity.id}`;
      let feature = this.features.get(featureID);

      if (!feature) {
        const geojson = entity.asGeoJSON(graph);
        const coords = geojson.coordinates;
        if (entity.tags.oneway === '-1') {
          coords.reverse();
        }

        feature = new PixiFeatureLine(this, featureID);
        feature.geometry.setCoords(coords);
        feature.parentContainer = parentContainer;
        feature.rapidFeature = true;
        feature.setData(entity.id, entity);
      }

      this.syncFeatureClasses(feature);

      if (feature.dirty) {
        const style = {
          labelTint: color,
          casing: { width: 5, color: 0x444444 },
          stroke: { width: 3, color: color },
        };
        style.lineMarkerName = entity.isOneWay() ? 'oneway' : '';
        feature.style = style;
        feature.label = l10n.displayName(entity.tags);
        feature.update(viewport, zoom);
      }

      this.retainFeature(feature, frame);
    }
  }


  /**
   * renderPoints
   */
  renderPoints(parentContainer, dataset, graph, frame, viewport, zoom, data) {
    const color = new PIXI.Color(dataset.color);
    const l10n = this.context.systems.l10n;

    const pointStyle = {
      markerName: 'largeCircle',
      markerTint: color,
      iconName: 'maki-circle-stroked',
      labelTint: color
    };
    const vertexStyle = {
      markerName: 'smallCircle',
      markerTint: color,
      labelTint: color
    };

    for (const entity of data.points) {
      const featureID = `${this.layerID}-${dataset.id}-${entity.id}`;
      let feature = this.features.get(featureID);

      if (!feature) {
        feature = new PixiFeaturePoint(this, featureID);
        feature.geometry.setCoords(entity.loc || entity.geojson.geometry.coordinates);
        feature.parentContainer = parentContainer;
        feature.rapidFeature = true;
        feature.setData(entity.id, entity);
      }

      this.syncFeatureClasses(feature);

      if (feature.dirty) {
        feature.style = pointStyle;

        if (entity.geojson){
          feature.label = entity.geojson.properties['@name'];
        } else {
          feature.label = l10n.displayName(entity.tags);

          // experiment: label addresses
          const housenumber = entity.tags['addr:housenumber'];
          if (!feature.label && housenumber) {
            feature.label = housenumber;
          }
        }

        feature.update(viewport, zoom);
      }

      this.retainFeature(feature, frame);
    }


    for (const entity of data.vertices) {
      const featureID = `${this.layerID}-${entity.id}`;
      let feature = this.features.get(featureID);

      if (!feature) {
        feature = new PixiFeaturePoint(this, featureID);
        feature.geometry.setCoords(entity.loc);
        feature.parentContainer = parentContainer;
        feature.rapidFeature = true;
        feature.allowInteraction = false;   // vertices in this layer don't actually need to be interactive
        feature.setData(entity.id, entity);
      }

      this.syncFeatureClasses(feature);

      if (feature.dirty) {
        feature.style = vertexStyle;
        feature.label = l10n.displayName(entity.tags);
        // experiment: label addresses
        const housenumber = entity.tags['addr:housenumber'];
        if (!feature.label && housenumber) {
          feature.label = housenumber;
        }
        feature.update(viewport, zoom);
      }

      this.retainFeature(feature, frame);
    }

  }

}
