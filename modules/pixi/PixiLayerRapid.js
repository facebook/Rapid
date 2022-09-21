import * as PIXI from 'pixi.js';
import geojsonRewind from '@mapbox/geojson-rewind';

import { services } from '../services';
import { AbstractLayer } from './AbstractLayer';
import { PixiFeatureLine } from './PixiFeatureLine';
import { PixiFeaturePoint } from './PixiFeaturePoint';
import { PixiFeatureMultipolygon } from './PixiFeatureMultipolygon';
import { utilDisplayName } from '../util';

const LAYERID = 'rapid';
const MINZOOM = 12;


/**
 * PixiLayerRapid
 * @class
 */
export class PixiLayerRapid extends AbstractLayer {

  /**
   * @constructor
   * @param  scene    The Scene that owns this Layer
   * @param  layerZ   z-index to assign to this Layer's container
   */
  constructor(scene, layerZ) {
    super(scene, LAYERID, layerZ);

    this._enabled = true;  // RapiD features should be enabled by default
    this._serviceFB = null;
    this._serviceEsri = null;
    this.getServiceFB();
    this.getServiceEsri();

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

    this.context.history()
      .on('undone.rapid', onHistoryUndone.bind(this))
      .on('change.rapid', onHistoryChange.bind(this))
      .on('restore.rapid', onHistoryRestore.bind(this));


    function wasRapidEdit(annotation) {
      return annotation && annotation.type && /^rapid/.test(annotation.type);
    }


    function onHistoryUndone(currentStack, previousStack) {
      const annotation = previousStack.annotation;
      if (!wasRapidEdit(annotation)) return;

      this._acceptedIDs.delete(annotation.id);
      this.context.map().immediateRedraw();
    }


    function onHistoryChange() {
      const annotation = this.context.history().peekAnnotation();
      if (!wasRapidEdit(annotation)) return;

      this._acceptedIDs.add(annotation.id);
      this.context.map().immediateRedraw();
    }


    function onHistoryRestore() {
      this._acceptedIDs = new Set();

      this.context.history().peekAllAnnotations().forEach(annotation => {
        if (!wasRapidEdit(annotation)) return;

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

      this.context.map().immediateRedraw();
    }
  }


  /**
   * Services are loosely coupled in RapiD, so we use these functions
   * to gain access to them, and bind any event handlers a single time.
   */
  getServiceFB() {
    if (services.fbMLRoads && !this._serviceFB) {
      this._serviceFB = services.fbMLRoads;
      this._serviceFB.on('loadedData', () => this.context.map().deferredRedraw());
    } else if (!services.fbMLRoads && this._serviceFB) {
      this._serviceFB = null;
    }
    return this._serviceFB;
  }

  getServiceEsri() {
    if (services.esriData && !this._serviceEsri) {
      this._serviceEsri = services.esriData;
      this._serviceEsri.on('loadedData', () => this.context.map().deferredRedraw());
    } else if (!services.esriData && this._serviceEsri) {
      this._serviceEsri = null;
    }
    return this._serviceEsri;
  }


  /**
   * render
   * Render any data we have, and schedule fetching more of it to cover the view
   * @param  frame        Integer frame being rendered
   * @param  projection   Pixi projection to use for rendering
   * @param  zoom         Effective zoom to use for rendering
   */
  render(frame, projection, zoom) {
    const rapidContext = this.context.rapidContext();
    const datasets = Object.values(rapidContext.datasets());

// shader experiment
//const offset = this.context.pixi.stage.position;
//const transform = this.context.pixi.stage.worldTransform;
//this._uniforms.translationMatrix = transform.clone().translate(-offset.x, -offset.y);
//this._uniforms.u_time = frame/10;

    if (this._enabled && datasets.length && zoom >= MINZOOM) {
      this.visible = true;
      datasets.forEach(dataset => this.renderDataset(dataset, frame, projection, zoom));

    } else {
      this.visible = false;
    }
  }


  /**
   * renderDataset
   * Render any data we have, and schedule fetching more of it to cover the view
   *
   * @param  dataset
   * @param  frame        Integer frame being rendered
   * @param  projection   Pixi projection to use for rendering
   * @param  zoom         Effective zoom to use for rendering
   */
  renderDataset(dataset, frame, projection, zoom) {
    const context = this.context;
    const rapidContext = context.rapidContext();
    const dsEnabled = (dataset.added && dataset.enabled);

    const service = dataset.service === 'fbml' ? this.getServiceFB(): this.getServiceEsri();
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
    if (dsEnabled && dataset.service === 'fbml') {
      if (zoom >= 15) { // avoid firing off too many API requests
        service.loadTiles(datasetID, context.projection, rapidContext.getTaskExtent());  // fetch more
      }

      const entities = service.intersects(datasetID, context.map().extent())
        .filter(d => d.type === 'way' && !isAccepted(d));  // see onHistoryRestore()

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
    } else if (dsEnabled && dataset.service === 'esri') {
      if (zoom >= 14) { // avoid firing off too many API requests
        service.loadTiles(datasetID, context.projection);  // fetch more
      }

      const entities = service.intersects(datasetID, context.map().extent());

      entities.forEach(entity => {
        if (isAccepted(entity)) return;   // skip features already accepted, see onHistoryRestore()
        const geom = entity.geometry(dsGraph);
        if (geom === 'point' && !!entity.__fbid__) {  // standalone points only (not vertices/childnodes)
          data.points.push(entity);
        } else if (geom === 'line') {
          data.lines.push(entity);
        } else if (geom === 'area') {
          data.polygons.push(entity);
        }
      });
    }


    // If a container doesn't yet exist for this dataset, create it and add it to the main rapid layer.
    let dsContainer = this.container.getChildByName(dataset.id);
    let areas, lines, points;

    if (!dsContainer) {
      dsContainer = new PIXI.Container();
      dsContainer.name = dataset.id;
      dsContainer.sortableChildren = false;
      this.container.addChild(dsContainer);

      areas = new PIXI.Container();
      areas.name = `${dataset.id}-areas`;
      areas.sortableChildren = true;

      lines = new PIXI.Container();
      lines.name = `${dataset.id}-lines`;
      lines.sortableChildren = true;

      points = new PIXI.Container();
      points.name = `${dataset.id}-points`;
      points.sortableChildren = true;

      dsContainer.addChild(areas, lines, points);

    } else {
      areas = dsContainer.getChildByName(`${dataset.id}-areas`);
      lines = dsContainer.getChildByName(`${dataset.id}-lines`);
      points = dsContainer.getChildByName(`${dataset.id}-points`);
    }

    if (dsEnabled) {
      dsContainer.visible = true;
      this.renderPolygons(areas, dataset, dsGraph, frame, projection, zoom, data);
      this.renderLines(lines, dataset, dsGraph, frame, projection, zoom, data);
      this.renderPoints(points, dataset, dsGraph, frame, projection, zoom, data);
    } else {
      dsContainer.visible = false;
    }
  }


  /**
   * renderPolygons
   */
  renderPolygons(layer, dataset, graph, frame, projection, zoom, data) {
    const scene = this.scene;
    const color = PIXI.utils.string2hex(dataset.color);
    const wireframeEnabled = this.context.map().wireframeMode;
    const width = wireframeEnabled ? 1 : 2;
    const style = {
      labelTint: color,
      fill: { width: width, color: color, alpha: 0.3 },
      // fill: { width: 2, color: color, alpha: 1, pattern: 'stripe' }
    };

    if (wireframeEnabled) {
      style.fill.width = 0;
    }

    data.polygons.forEach(entity => {
      const featureID = `${LAYERID}-${entity.id}`;
      let feature = scene.getFeature(featureID);

      if (!feature) {
        const geojson = geojsonRewind(entity.asGeoJSON(graph), true);
        const geometry = (geojson.type === 'Polygon') ? [geojson.coordinates]
          : (geojson.type === 'MultiPolygon') ? geojson.coordinates : [];

        feature = new PixiFeatureMultipolygon(this, featureID, layer, entity, geometry);
        feature.rapidFeature = true;

// shader experiment:
// check https://github.com/pixijs/pixijs/discussions/7728 for some discussion
// we are fighting with the batch system which is unfortunate
// feature.fill.geometry.isBatchable = () => { return false; };
// feature.fill.shader = this._customshader;

// also custom `.shader` dont work on sprites at all, and so we'd have to switch to meshes maybe?
      }

      feature.selected = scene.selected.has(feature.id);
      feature.hovered = scene.hovered.has(feature.id);

      if (feature.dirty) {
        feature.style = style;
        feature.label = utilDisplayName(entity);
        feature.update(projection, zoom);
        scene.updateFeature(feature);
      }

      if (feature.lod > 0) {
        feature.visible = true;
        scene.retainFeature(feature, frame);
      }
    });
  }


  /**
   * renderLines
   */
  renderLines(layer, dataset, graph, frame, projection, zoom, data) {
    const scene = this.scene;
    const color = PIXI.utils.string2hex(dataset.color);

    data.lines.forEach(entity => {
      const featureID = `${LAYERID}-${entity.id}`;
      let feature = scene.getFeature(featureID);

      if (!feature) {
        const geojson = entity.asGeoJSON(graph);
        const geometry = geojson.coordinates;

        feature = new PixiFeatureLine(this, featureID, layer, entity, geometry);
        feature.rapidFeature = true;
      }

      feature.selected = scene.selected.has(feature.id);
      feature.hovered = scene.hovered.has(feature.id);

      if (feature.dirty) {
        const wireframeEnabled = this.context.map().wireframeMode;
        const casingWidth = wireframeEnabled ? 0 : 5;
        const strokeWidth = wireframeEnabled ? 1 : 3;

        const style = {
          labelTint: color,
          casing: { width: casingWidth, color: 0x444444 },
          stroke: { width: strokeWidth, color: color },
        };
        style.reversePoints = (entity.tags.oneway === '-1');
        style.lineMarkerName = entity.isOneWay() ? 'oneway' : '';
        feature.style = style;
        feature.label = utilDisplayName(entity);
        feature.update(projection, zoom);
        scene.updateFeature(feature);
      }

      if (feature.lod > 0) {
        feature.visible = true;
        scene.retainFeature(feature, frame);
      }
    });
  }


  /**
   * renderPoints
   */
  renderPoints(layer, dataset, graph, frame, projection, zoom, data) {
    const scene = this.scene;
    const color = PIXI.utils.string2hex(dataset.color);

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

    data.points.forEach(entity => {
      const featureID = `${LAYERID}-${entity.id}`;
      let feature = scene.getFeature(featureID);

      if (!feature) {
        feature = new PixiFeaturePoint(this, featureID, layer, entity, entity.loc);
        feature.rapidFeature = true;
      }

      feature.selected = scene.selected.has(feature.id);
      feature.hovered = scene.hovered.has(feature.id);

      if (feature.dirty) {
        feature.style = pointStyle;

        feature.label = utilDisplayName(entity);
        // experiment: label addresses
        const housenumber = entity.tags['addr:housenumber'];
        if (!feature.label && housenumber) {
          feature.label = housenumber;
        }

        feature.update(projection, zoom);
        scene.updateFeature(feature);
      }

      if (feature.lod > 0) {
        feature.visible = true;
        scene.retainFeature(feature, frame);
      }
    });


    data.vertices.forEach(entity => {
      const featureID = `${LAYERID}-${entity.id}`;
      let feature = scene.getFeature(featureID);

      if (!feature) {
        feature = new PixiFeaturePoint(this, featureID, layer, entity, entity.loc);
        feature.rapidFeature = true;
        feature.interactive = false;   // vertices in this layer don't actually need to be interactive
      }

      feature.selected = scene.selected.has(feature.id);
      feature.hovered = scene.hovered.has(feature.id);

      if (feature.dirty) {
        feature.style = vertexStyle;

        feature.label = utilDisplayName(entity);
        // experiment: label addresses
        const housenumber = entity.tags['addr:housenumber'];
        if (!feature.label && housenumber) {
          feature.label = housenumber;
        }

        feature.update(projection, zoom);
        scene.updateFeature(feature);
      }

      if (feature.lod > 0) {
        feature.visible = true;
        scene.retainFeature(feature, frame);
      }
    });

  }

}
