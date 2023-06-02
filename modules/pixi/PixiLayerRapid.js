import * as PIXI from 'pixi.js';
import geojsonRewind from '@mapbox/geojson-rewind';

import { AbstractLayer } from './AbstractLayer';
import { PixiFeatureLine } from './PixiFeatureLine';
import { PixiFeaturePoint } from './PixiFeaturePoint';
import { PixiFeaturePolygon } from './PixiFeaturePolygon';

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

    this._enabled = true;     // Rapid features should be enabled by default
    this._resolved = new Map();  // Map (entity.id -> GeoJSON feature)

//// shader experiment:
//this._uniforms = {
// u_resolution: [300.0, 300.0],
// u_time: 0.0,
// tint: new Float32Array([1, 1, 1, 1]),
// translationMatrix: new PIXI.Matrix(),
// default: this.context.pixi.renderer.plugins.batch._shader.uniformGroup
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

    // Watch history to keep track of which features have been accepted by the user
    // These features will be filtered out when drawing
    this._acceptedIDs = new Set();

    // Make sure the event handlers have `this` bound correctly
    this._onUndone = this._onUndone.bind(this);
    this._onChange = this._onChange.bind(this);
    this._onRestore = this._onRestore.bind(this);

    this.context.editSystem()
      .on('undone.rapid', this._onUndone)
      .on('change.rapid', this._onChange)
      .on('restore.rapid', this._onRestore);
  }



  _wasRapidEdit(annotation) {
    return annotation && annotation.type && /^rapid/.test(annotation.type);
  }


  _onUndone(currentStack, previousStack) {
    const annotation = previousStack.annotation;
    if (!this._wasRapidEdit(annotation)) return;

    this._acceptedIDs.delete(annotation.id);
    this.context.mapSystem().immediateRedraw();
  }


  _onChange() {
    const annotation = this.context.editSystem().peekAnnotation();
    if (!this._wasRapidEdit(annotation)) return;

    this._acceptedIDs.add(annotation.id);
    this.context.mapSystem().immediateRedraw();
  }


  _onRestore() {
    this._acceptedIDs = new Set();

    this.context.editSystem().peekAllAnnotations().forEach(annotation => {
      if (!this._wasRapidEdit(annotation)) return;

      this._acceptedIDs.add(annotation.id);

      // `origid` (the original entity ID), a.k.a. datum.__origid__,
      // is a hack used to deal with non-deterministic way-splitting
      // in the roads service. Each way "split" will have an origid
      // attribute for the original way it was derived from. In this
      // particular case, restoring from history on page reload, we
      // prevent new splits (possibly different from before the page
      // reload) from being displayed by storing the origid and
      // checking against it in render().
      if (annotation.origid) {
        this._acceptedIDs.add(annotation.origid);
      }
    });

    this.context.mapSystem().immediateRedraw();
  }


  /**
   * supported
   * Whether the Layer's service exists
   */
  get supported() {
    return this.context.services.has('mapwithai') || this.context.services.has('esri');
  }


  /**
   * render
   * Render any data we have, and schedule fetching more of it to cover the view
   * @param  frame        Integer frame being rendered
   * @param  projection   Pixi projection to use for rendering
   * @param  zoom         Effective zoom to use for rendering
   */
  render(frame, projection, zoom) {
    const rapid = this.context.rapidSystem();
    if (!this.enabled || !rapid.datasets.size || zoom < MINZOOM) return;

// shader experiment
//const offset = this.context.pixi.stage.position;
//const transform = this.context.pixi.stage.worldTransform;
//this._uniforms.translationMatrix = transform.clone().translate(-offset.x, -offset.y);
//this._uniforms.u_time = frame/10;

    for (const dataset of rapid.datasets.values()) {
      this.renderDataset(dataset, frame, projection, zoom);
    }
  }


  /**
   * renderDataset
   * Render any data we have, and schedule fetching more of it to cover the view
   *
   * @param  dataset      Object
   * @param  frame        Integer frame being rendered
   * @param  projection   Pixi projection to use for rendering
   * @param  zoom         Effective zoom to use for rendering
   */
  renderDataset(dataset, frame, projection, zoom) {
    const context = this.context;
    const dsEnabled = (dataset.added && dataset.enabled);
    if (!dsEnabled) return;

    const service = context.services.get(dataset.service);  // 'mapwithai' or 'esri'
    if (!service) return;

    // Adjust the dataset id for whether we want the data conflated or not.
    const datasetID = dataset.id + (dataset.conflated ? '-conflated' : '');
    const dsGraph = service.graph(datasetID);

    let acceptedIDs = this._acceptedIDs;
    function isAccepted(entity) {
      return acceptedIDs.has(entity.id) || acceptedIDs.has(entity.__origid__);
    }

    // Gather data
    let data = { points: [], vertices: new Set(), lines: [], polygons: [] };
    // let data = { polygons: [], lines: [], points: [], vertices: new Set() };

    /* Facebook AI/ML */
    if (dataset.service === 'mapwithai') {
      if (zoom >= 15) { // avoid firing off too many API requests
        service.loadTiles(datasetID, context.projection);  // fetch more
      }

      const entities = service.intersects(datasetID, context.mapSystem().extent())
        .filter(d => d.type === 'way' && !isAccepted(d));  // see this._onRestore()

      // fb_ai service gives us roads and buildings together,
      // so filter further according to which dataset we're drawing
      if (dataset.id === 'fbRoads' || dataset.id === 'rapid_intro_graph') {
        data.lines = entities.filter(d => d.geometry(dsGraph) === 'line' && !!d.tags.highway);

        // Gather first and last vertices
        data.lines.forEach(d => {
          const first = dsGraph.entity(d.first());
          const last = dsGraph.entity(d.last());
          data.vertices.add(first);
          data.vertices.add(last);
        });

      } else {  // ms buildings or esri buildings through conflation service
        data.polygons = entities.filter(d => d.geometry(dsGraph) === 'area');
      }

    /* ESRI ArcGIS */
    } else if (dataset.service === 'esri') {
      if (zoom >= 14) { // avoid firing off too many API requests
        service.loadTiles(datasetID, context.projection);  // fetch more
      }

      const entities = service.intersects(datasetID, context.mapSystem().extent());

      for (const entity of entities) {
        if (isAccepted(entity)) continue;   // skip features already accepted, see this._onRestore()
        const geom = entity.geometry(dsGraph);
        if (geom === 'point' && !!entity.__fbid__) {  // standalone points only (not vertices/childnodes)
          data.points.push(entity);
        } else if (geom === 'line') {
          data.lines.push(entity);
        } else if (geom === 'area') {
          data.polygons.push(entity);
        }
      }
    }

    const pointsContainer = this.scene.groups.get('points');
    const basemapContainer = this.scene.groups.get('basemap');
    const areasID = `${this.layerID}-${dataset.id}-areas`;
    const linesID = `${this.layerID}-${dataset.id}-lines`;

    let areasContainer = basemapContainer.getChildByName(areasID);
    if (!areasContainer) {
      areasContainer = new PIXI.Container();
      areasContainer.name = areasID;
      areasContainer.sortableChildren = true;
      basemapContainer.addChild(areasContainer);
    }

    let linesContainer = basemapContainer.getChildByName(linesID);
    if (!linesContainer) {
      linesContainer = new PIXI.Container();
      linesContainer.name = linesID;
      linesContainer.sortableChildren = true;
      basemapContainer.addChild(linesContainer);
    }

    this.renderPolygons(areasContainer, dataset, dsGraph, frame, projection, zoom, data);
    this.renderLines(linesContainer, dataset, dsGraph, frame, projection, zoom, data);
    this.renderPoints(pointsContainer, dataset, dsGraph, frame, projection, zoom, data);
  }


  /**
   * renderPolygons
   */
  renderPolygons(parentContainer, dataset, graph, frame, projection, zoom, data) {
    const color = PIXI.utils.string2hex(dataset.color);
    const l10n = this.context.localizationSystem();

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
          feature.label = l10n.displayName(entity);
          feature.update(projection, zoom);
        }

        this.retainFeature(feature, frame);
      }
    }
  }


  /**
   * renderLines
   */
  renderLines(parentContainer, dataset, graph, frame, projection, zoom, data) {
    const color = PIXI.utils.string2hex(dataset.color);
    const l10n = this.context.localizationSystem();

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
        feature.label = l10n.displayName(entity);
        feature.update(projection, zoom);
      }

      this.retainFeature(feature, frame);
    }
  }


  /**
   * renderPoints
   */
  renderPoints(parentContainer, dataset, graph, frame, projection, zoom, data) {
    const color = PIXI.utils.string2hex(dataset.color);
    const l10n = this.context.localizationSystem();

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
        feature.geometry.setCoords(entity.loc);
        feature.parentContainer = parentContainer;
        feature.rapidFeature = true;
        feature.setData(entity.id, entity);
      }

      this.syncFeatureClasses(feature);

      if (feature.dirty) {
        feature.style = pointStyle;
        feature.label = l10n.displayName(entity);
        // experiment: label addresses
        const housenumber = entity.tags['addr:housenumber'];
        if (!feature.label && housenumber) {
          feature.label = housenumber;
        }
        feature.update(projection, zoom);
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
        feature.label = l10n.displayName(entity);
        // experiment: label addresses
        const housenumber = entity.tags['addr:housenumber'];
        if (!feature.label && housenumber) {
          feature.label = housenumber;
        }
        feature.update(projection, zoom);
      }

      this.retainFeature(feature, frame);
    }

  }

}
