import * as PIXI from 'pixi.js';
import geojsonRewind from '@mapbox/geojson-rewind';

import { services } from '../services';
import { PixiLayer } from './PixiLayer';
import { PixiFeatureLine } from './PixiFeatureLine';
import { PixiFeaturePoint } from './PixiFeaturePoint';
import { PixiFeatureMultipolygon } from './PixiFeatureMultipolygon';

const LAYERID = 'rapid';
const MINZOOM = 12;


/**
 * PixiLayerRapid
 * @class
 */
export class PixiLayerRapid extends PixiLayer {

  /**
   * @constructor
   * @param context
   * @param scene
   * @param layerZ
   */
  constructor(context, scene, layerZ) {
    super(context, LAYERID, layerZ);
    this._enabled = true;  // RapiD features should be enabled by default
    this.scene = scene;

    this._serviceFB = null;
    this._serviceEsri = null;
    this.getServiceFB();
    this.getServiceEsri();

//// shader experiment:
//
//const uniforms = {
//  tint: new Float32Array([1, 1, 1, 1]),
//  translationMatrix: new PIXI.Matrix(),
//  default: context.pixi.renderer.plugins['batch']._shader.uniformGroup
//};
//
//    this._customshader = new PIXI.Shader.from(`
//precision highp float;
//attribute vec2 aVertexPosition;
//attribute vec2 aTextureCoord;
//attribute vec4 aColor;
//attribute float aTextureId;
//
//uniform mat3 projectionMatrix;
//uniform mat3 translationMatrix;
//uniform vec4 tint;
//
//varying vec2 vTextureCoord;
//varying vec4 vColor;
//varying float vTextureId;
//
//void main(void){
//  gl_Position = vec4((projectionMatrix * translationMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
//  vTextureCoord = aTextureCoord;
//  vTextureId = aTextureId;
//  vColor = aColor * tint;
//}
//`, `
//varying vec2 vTextureCoord;
//uniform sampler2D uSampler;
//void main() {
//   // gl_FragColor *= texture2D(uSampler, vTextureCoord);
//  gl_FragColor = vec4(gl_FragCoord.x/1000.0, gl_FragCoord.y/1000.0, 0.0, 1.0);
//}
//`, uniforms);

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
   * Services are loosely coupled in iD, so we use these functions
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
   * Draw any data we have, and schedule fetching more of it to cover the view
   * @param timestamp    timestamp in milliseconds
   * @param projection   pixi projection to use for rendering
   * @param zoom         effective zoom to use for rendering
   */
  render(timestamp, projection, zoom) {
    const rapidContext = this.context.rapidContext();
    const datasets = Object.values(rapidContext.datasets());

    if (this._enabled && datasets.length && zoom >= MINZOOM) {
      this.visible = true;
      datasets.forEach(dataset => this.renderDataset(dataset, timestamp, projection, zoom));
      this.cull(timestamp);

    } else {
      this.visible = false;
    }
  }


  /**
   * renderDataset
   * Draw any data we have, and schedule fetching more of it to cover the view
   *
   * @param dataset
   * @param timestamp    timestamp in milliseconds
   * @param projection   pixi projection to use for rendering
   * @param zoom         effective zoom to use for rendering
   */
  renderDataset(dataset, timestamp, projection, zoom) {
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
      dsContainer.interactive = true;
      dsContainer.buttonMode = false;
      dsContainer.sortableChildren = false;
      this.container.addChild(dsContainer);

      areas = new PIXI.Container();
      areas.name = `${dataset.id}-areas`;
      areas.interactive = true;
      areas.buttonMode = false;
      areas.sortableChildren = true;

      lines = new PIXI.Container();
      lines.name = `${dataset.id}-lines`;
      lines.interactive = true;
      lines.buttonMode = false;
      lines.sortableChildren = true;

      points = new PIXI.Container();
      points.name = `${dataset.id}-points`;
      points.interactive = true;
      points.buttonMode = false;
      points.sortableChildren = true;

      dsContainer.addChild(areas, lines, points);

    } else {
      areas = dsContainer.getChildByName(`${dataset.id}-areas`);
      lines = dsContainer.getChildByName(`${dataset.id}-lines`);
      points = dsContainer.getChildByName(`${dataset.id}-points`);
    }

    if (dsEnabled) {
      dsContainer.visible = true;
      this.drawPolygons(areas, dataset, dsGraph, timestamp, projection, zoom, data);
      this.drawLines(lines, dataset, dsGraph, timestamp, projection, zoom, data);
      this.drawPoints(points, dataset, dsGraph, timestamp, projection, zoom, data);
    } else {
      dsContainer.visible = false;
    }
  }


  /**
   * drawPolygons
   */
  drawPolygons(layer, dataset, graph, timestamp, projection, zoom, data) {
    const context = this.context;
    const scene = this.scene;
    const color = PIXI.utils.string2hex(dataset.color);
    const style = {
      fill: { width: 2, color: color, alpha: 0.3 }
      // fill: { width: 2, color: color, alpha: 1, pattern: 'stripe' }
    };

    data.polygons.forEach(entity => {
      const featureID = `${LAYERID}-${entity.id}`;
      let feature = scene.get(featureID);

      if (!feature) {
        const geojson = geojsonRewind(entity.asGeoJSON(graph), true);
        const geometry = (geojson.type === 'Polygon') ? [geojson.coordinates]
          : (geojson.type === 'MultiPolygon') ? geojson.coordinates : [];

        feature = new PixiFeatureMultipolygon(context, featureID, layer, entity, geometry);
        feature.rapidFeature = true;

// shader experiment:
// check https://github.com/pixijs/pixijs/discussions/7728 for some discussion
// we are fighting with the batch system which is unfortunate
        // feature.fill.geometry.isBatchable = () => { return false };
        // feature.fill.shader = this._customshader;

// also custom `.shader` dont work on sprites at all, and so we'd have to switch to meshes maybe?
        // feature.lowRes.geometry.isBatchable = () => { return false };
        // feature.lowRes.shader = this._customshader;
      }

      this.seenFeature.set(feature, timestamp);
      feature.visible = true;

      if (feature.dirty) {
        feature.style = style;
        feature.update(projection, zoom);
        scene.update(feature);
      }
    });
  }


  /**
   * drawLines
   */
  drawLines(layer, dataset, graph, timestamp, projection, zoom, data) {
    const context = this.context;
    const scene = this.scene;
    const color = PIXI.utils.string2hex(dataset.color);

    data.lines.forEach(entity => {
      const featureID = `${LAYERID}-${entity.id}`;
      let feature = scene.get(featureID);

      if (!feature) {
        const geojson = entity.asGeoJSON(graph);
        const geometry = geojson.coordinates;

        feature = new PixiFeatureLine(context, featureID, layer, entity, geometry);
        feature.rapidFeature = true;
      }

      this.seenFeature.set(feature, timestamp);
      feature.visible = true;

      if (feature.dirty) {
        const style = {
          casing: { width: 5, color: 0x444444 },
          stroke: { width: 3, color: color }
        };
        style.reversePoints = (entity.tags.oneway === '-1');
        style.lineMarkerName = entity.isOneWay() ? 'oneway' : '';
        feature.style = style;
        feature.update(projection, zoom);
        scene.update(feature);
      }
    });
  }


  /**
   * drawPoints
   */
  drawPoints(layer, dataset, graph, timestamp, projection, zoom, data) {
    const context = this.context;
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
      let feature = scene.get(featureID);

      if (!feature) {
        feature = new PixiFeaturePoint(context, featureID, layer, entity, entity.loc);
        feature.rapidFeature = true;
      }

      this.seenFeature.set(feature, timestamp);
      feature.visible = true;

      if (feature.dirty) {
        // experiment: label addresses
        const housenumber = entity.tags['addr:housenumber'];
        if (housenumber) {
          feature.label = housenumber;
        }
        feature.style = pointStyle;
        feature.update(projection, zoom);
        scene.update(feature);
      }
    });


    data.vertices.forEach(entity => {
      const featureID = `${LAYERID}-${entity.id}`;
      let feature = scene.get(featureID);

      if (!feature) {
        feature = new PixiFeaturePoint(context, featureID, layer, entity, entity.loc);
        feature.rapidFeature = true;

        // vertices in this layer don't actually need to be interactive
        const dObj = feature.displayObject;
        dObj.buttonMode = false;
        dObj.interactive = false;
        dObj.interactiveChildren = false;
      }

      this.seenFeature.set(feature, timestamp);
      feature.visible = true;

      if (feature.dirty) {
        feature.style = vertexStyle;
        feature.update(projection, zoom);
        scene.update(feature);
      }
    });

  }

}
