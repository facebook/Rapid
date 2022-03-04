import * as PIXI from 'pixi.js';
import geojsonRewind from '@mapbox/geojson-rewind';

import { services } from '../services';
import { PixiLayer } from './PixiLayer';
import { PixiFeatureLine } from './PixiFeatureLine';
import { PixiFeaturePoint } from './PixiFeaturePoint';
import { PixiFeaturePolygon } from './PixiFeaturePolygon';

const LAYERID = 'rapid';
const LAYERZINDEX = 2;
const MINZOOM = 12;


/**
 * PixiLayerRapid
 * @class
 */
export class PixiLayerRapid extends PixiLayer {

  /**
   * @constructor
   * @param context
   * @param featureCache
   * @param dispatch
   */
  constructor(context, featureCache, dispatch) {
    super(context, LAYERID, LAYERZINDEX);

    this._enabled = true;  // RapiD features should be enabled by default

    this.featureCache = featureCache;
    this.dispatch = dispatch;

    this._serviceFB = null;
    this._serviceEsri = null;
    this.getServiceFB();
    this.getServiceEsri();

    // Watch history to keep track of which features have been accepted by the user
    // These features will be filtered out when drawing
    this._acceptedIDs = new Set();

    this.context.history()
      .on('undone.rapid', onHistoryUndone)
      .on('change.rapid', onHistoryChange)
      .on('restore.rapid', onHistoryRestore);


    function wasRapidEdit(annotation) {
      return annotation && annotation.type && /^rapid/.test(annotation.type);
    }


    function onHistoryUndone(currentStack, previousStack) {
      const annotation = previousStack.annotation;
      if (!wasRapidEdit(annotation)) return;

      this._acceptedIDs.delete(annotation.id);
      dispatch.call('change');   // redraw
    }


    function onHistoryChange() {
      const annotation = this.context.history().peekAnnotation();
      if (!wasRapidEdit(annotation)) return;

      this._acceptedIDs.add(annotation.id);
      this.dispatch.call('change');   // redraw
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

      this.dispatch.call('change');  // redraw
    }
  }


  /**
   * Services are loosely coupled in iD, so we use these functions
   * to gain access to them, and bind any event handlers a single time.
   */
  getServiceFB() {
    if (services.fbMLRoads && !this._serviceFB) {
      this._serviceFB = services.fbMLRoads;
      // this._serviceFB.event.on('loadedData', throttledRedraw);
    } else if (!services.fbMLRoads && this._serviceFB) {
      this._serviceFB = null;
    }
    return this._serviceFB;
  }

  getServiceEsri() {
    if (services.esriData && !this._serviceEsri) {
      this._serviceEsri = services.esriData;
      // this._serviceEsri.event.on('loadedData', throttledRedraw);
    } else if (!services.esriData && this._serviceEsri) {
      this._serviceEsri = null;
    }
    return this._serviceEsri;
  }


  /**
   * render
   * Draw any data we have, and schedule fetching more of it to cover the view
   *
   * @param projection - a pixi projection
   * @param zoom - the effective zoom to use for rendering
   */
  render(projection, zoom) {
    if (!this._enabled) return;

    const rapidContext = this.context.rapidContext();
    const rapidDatasets = rapidContext.datasets();

    const datasets = Object.values(rapidDatasets)
      .filter(dataset => dataset.added && dataset.enabled);

    if (datasets.length && zoom >= MINZOOM) {
      datasets.forEach(dataset => this.renderDataset(dataset, projection, zoom));
      this.visible = true;
    } else {
      this.visible = false;
    }
  }


  /**
   * renderDataset
   * Draw any data we have, and schedule fetching more of it to cover the view
   *
   * @param dataset
   * @param projection - a pixi projection
   * @param zoom - the effective zoom to use for rendering
   */
  renderDataset(dataset, projection, zoom) {
    const context = this.context;
    const rapidContext = context.rapidContext();

    const service = dataset.service === 'fbml' ? this.getServiceFB(): this.getServiceEsri();
    if (!service) return;

    // Adjust the dataset id for whether we want the data conflated or not.
    const datasetID = dataset.id + (dataset.conflated ? '-conflated' : '');
    const datasetGraph = service.graph(datasetID);

    // Gather data
    let geoData = {
      points: [],
      vertices: [],
      lines: [],
      areas: []
    };

    let acceptedIDs = this._acceptedIDs;
    function isAccepted(entity) {
      return acceptedIDs.has(entity.id) || acceptedIDs.has(entity.__origid__);
    }


    /* Facebook AI/ML */
    if (dataset.service === 'fbml') {
      service.loadTiles(datasetID, context.projection, rapidContext.getTaskExtent());  // fetch more

      const visibleData = service
        .intersects(datasetID, context.map().extent())
        .filter(d => d.type === 'way' && !isAccepted(d));  // see onHistoryRestore()

      // fb_ai service gives us roads and buildings together,
      // so filter further according to which dataset we're drawing
      if (dataset.id === 'fbRoads' || dataset.id === 'rapid_intro_graph') {
        geoData.lines = visibleData
          .filter(d => d.geometry(datasetGraph) === 'line' && !!d.tags.highway);

        let seen = {};
        geoData.lines.forEach(d => {
          const first = d.first();
          const last = d.last();
          if (!seen[first]) {
            seen[first] = true;
            geoData.vertices.push(datasetGraph.entity(first));
          }
          if (!seen[last]) {
            seen[last] = true;
            geoData.vertices.push(datasetGraph.entity(last));
          }
        });

      } else {  // ms buildings or esri buildings through conflation service
        geoData.areas = visibleData
          .filter(d => d.geometry(datasetGraph) === 'area');
      }

    /* ESRI ArcGIS */
    } else if (dataset.service === 'esri') {
      service.loadTiles(datasetID, context.projection);  // fetch more

      const visibleData = service
        .intersects(datasetID, context.map().extent())
        .filter(d => !isAccepted(d));  // see onHistoryRestore()

      geoData.points = visibleData
        .filter(d => d.geometry(datasetGraph) === 'point' && !!d.__fbid__);  // standalone only (not vertices/childnodes)
      geoData.lines = visibleData
        .filter(d => d.geometry(datasetGraph) === 'line');
      geoData.areas = visibleData
        .filter(d => d.geometry(datasetGraph) === 'area');
    }

    // If a container doesn't yet exist for this dataset, create it and add it to the main rapid layer.
    let datasetContainer = this.container.getChildByName(dataset.id);
    let areas, lines, points;

    if (!datasetContainer) {
      datasetContainer = new PIXI.Container();
      datasetContainer.name = dataset.id;
      datasetContainer.interactive = true;
      datasetContainer.buttonMode = false;
      datasetContainer.sortableChildren = false;
      this.container.addChild(datasetContainer);

      areas = new PIXI.Container();
      areas.name = 'areas';
      areas.interactive = true;
      areas.buttonMode = false;
      areas.sortableChildren = true;

      lines = new PIXI.Container();
      lines.name = 'lines';
      lines.interactive = true;
      lines.buttonMode = false;
      lines.sortableChildren = true;

      points = new PIXI.Container();
      points.name = 'points';
      points.interactive = true;
      points.buttonMode = false;
      points.sortableChildren = true;

      datasetContainer.addChild(areas, lines, points);

    } else {
      areas = datasetContainer.getChildByName('areas');
      lines = datasetContainer.getChildByName('lines');
      points = datasetContainer.getChildByName('points');
    }

    this.renderAreas(areas, dataset, datasetGraph, projection, zoom, geoData);
    this.renderLines(lines, dataset, datasetGraph, projection, zoom, geoData);
    this.renderPoints(points, dataset, datasetGraph, projection, zoom, geoData);
  }


  /**
   * renderLines
   */
  renderAreas(layer, dataset, graph, projection, zoom, geoData) {
    const context = this.context;
    const featureCache = this.featureCache;
    const color = PIXI.utils.string2hex(dataset.color);
    const style = {
      fill: { width: 2, color: color, alpha: 0.3 }
    };

    geoData.areas.forEach(entity => {
      let feature = featureCache.get(entity.id);

      if (!feature) {
        const geojson = geojsonRewind(entity.asGeoJSON(graph), true);
        const polygons = (geojson.type === 'Polygon') ? [geojson.coordinates]
          : (geojson.type === 'MultiPolygon') ? geojson.coordinates : [];

        feature = new PixiFeaturePolygon(context, entity.id, polygons, style);
        feature.rapidFeature = true;

        // bind data and add to scene
        const container = feature.displayObject;
        const area = entity.extent(graph).area();  // estimate area from extent for speed
        container.zIndex = -area;                  // sort by area descending (small things above big things)
        container.__data__ = entity;
        layer.addChild(container);

        featureCache.set(entity.id, feature);
      }

      feature.update(projection, zoom);
    });
  }


  /**
   * renderLines
   */
  renderLines(layer, dataset, graph, projection, zoom, geoData) {
    const context = this.context;
    const featureCache = this.featureCache;
    const color = PIXI.utils.string2hex(dataset.color);
    const style = {
      casing: { width: 5, color: 0x444444 },
      stroke: { width: 3, color: color }
    };

    geoData.lines.forEach(entity => {
      let feature = featureCache.get(entity.id);

      if (!feature) {
        const geojson = entity.asGeoJSON(graph);
        const coords = geojson.coordinates;
        const showOneWay = entity.isOneWay();
        const reversePoints = (entity.tags.oneway === '-1');

        feature = new PixiFeatureLine(context, entity.id, coords, style, showOneWay, reversePoints);
        feature.rapidFeature = true;

        // bind data and add to scene
        const container = feature.displayObject;
        container.__data__ = entity;
        layer.addChild(container);

        featureCache.set(entity.id, feature);
      }

      feature.update(projection, zoom);
    });
  }


  /**
   * renderPoints
   */
  renderPoints(layer, dataset, graph, projection, zoom, geoData) {
    const context = this.context;
    const featureCache = this.featureCache;
    const color = PIXI.utils.string2hex(dataset.color);

    const pointStyle = {
      markerName: 'largeCircle',
      markerTint: color,
      iconName: 'maki-circle-stroked'
    };
    const vertexStyle = {
      markerName: 'smallCircle',
      markerTint: color
    };

    geoData.points.forEach(entity => {
      let feature = featureCache.get(entity.id);

      if (!feature) {
        feature = new PixiFeaturePoint(context, entity.id, entity.loc, [], pointStyle);
        feature.rapidFeature = true;

        // bind data and add to scene
        const marker = feature.displayObject;
        marker.__data__ = entity;
        layer.addChild(marker);

        featureCache.set(entity.id, feature);
      }

      feature.update(projection, zoom);
    });


    geoData.vertices.forEach(entity => {
      let feature = featureCache.get(entity.id);

      if (!feature) {
        feature = new PixiFeaturePoint(context, entity.id, entity.loc, [], vertexStyle);
        feature.rapidFeature = true;

        // vertices in this layer don't actually need to be interactive
        const marker = feature.displayObject;
        marker.buttonMode = false;
        marker.interactive = false;
        marker.interactiveChildren = false;

        // bind data and add to scene
        marker.__data__ = entity;
        layer.addChild(marker);

        featureCache.set(entity.id, feature);
      }

      feature.update(projection, zoom);
    });

  }

}
