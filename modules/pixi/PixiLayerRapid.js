import * as PIXI from 'pixi.js';
import geojsonRewind from '@mapbox/geojson-rewind';

import { services } from '../services';
import { PixiLayer } from './PixiLayer';
import { PixiFeatureLine } from './PixiFeatureLine';
import { PixiFeaturePoint } from './PixiFeaturePoint';
import { PixiFeatureMultipolygon } from './PixiFeatureMultipolygon';

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
   * @param scene
   */
  constructor(context, scene) {
    super(context, LAYERID, LAYERZINDEX);
    this._enabled = true;  // RapiD features should be enabled by default
    this.scene = scene;

    this._serviceFB = null;
    this._serviceEsri = null;
    this.getServiceFB();
    this.getServiceEsri();

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
      service.loadTiles(datasetID, context.projection, rapidContext.getTaskExtent());  // fetch more

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
      service.loadTiles(datasetID, context.projection);  // fetch more

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
      let feature = scene.get(this.idAccessor(entity));

      if (!feature) {
        const geojson = geojsonRewind(entity.asGeoJSON(graph), true);
        const polygons = (geojson.type === 'Polygon') ? [geojson.coordinates]
          : (geojson.type === 'MultiPolygon') ? geojson.coordinates : [];

        feature = new PixiFeatureMultipolygon(context, this.idAccessor(entity), polygons, style);
        feature.rapidFeature = true;

        // bind data and add to scene
        const dObj = feature.displayObject;
        const area = entity.extent(graph).area();  // estimate area from extent for speed
        dObj.zIndex = -area;                  // sort by area descending (small things above big things)
        dObj.__data__ = entity;
        layer.addChild(dObj);
      }

      this.seenFeature.set(feature, timestamp);
      feature.visible = true;

      if (feature.needsUpdate(projection)) {
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
    const style = {
      casing: { width: 5, color: 0x444444 },
      stroke: { width: 3, color: color }
    };

    data.lines.forEach(entity => {
      let feature = scene.get(this.idAccessor(entity));

      if (!feature) {
        const geojson = entity.asGeoJSON(graph);
        const coords = geojson.coordinates;
        const showOneWay = entity.isOneWay();
        const reversePoints = (entity.tags.oneway === '-1');

        feature = new PixiFeatureLine(context, this.idAccessor(entity), coords, style, showOneWay, reversePoints);
        feature.rapidFeature = true;

        // bind data and add to scene
        const dObj = feature.displayObject;
        dObj.__data__ = entity;
        layer.addChild(dObj);
      }

      this.seenFeature.set(feature, timestamp);
      feature.visible = true;

      if (feature.needsUpdate(projection)) {
        feature.update(projection, zoom);
        scene.update(feature);
      }
    });
  }

  // Use something besides the entity id so that we don't collide features with the OSM renderer
  idAccessor(entity) {
    return 'rapid-' + entity.id;
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
      iconName: 'maki-circle-stroked'
    };
    const vertexStyle = {
      markerName: 'smallCircle',
      markerTint: color
    };

    data.points.forEach(entity => {
      let feature = scene.get(this.idAccessor(entity));

      if (!feature) {
        feature = new PixiFeaturePoint(context, this.idAccessor(entity), entity.loc, pointStyle);
        feature.rapidFeature = true;

        // bind data and add to scene
        const dObj = feature.displayObject;
        dObj.__data__ = entity;
        layer.addChild(dObj);
      }

      this.seenFeature.set(feature, timestamp);
      feature.visible = true;

      if (feature.needsUpdate(projection)) {
        feature.update(projection, zoom);
        scene.update(feature);
      }
    });


    data.vertices.forEach(entity => {
      let feature = scene.get(this.idAccessor(entity));

      if (!feature) {
        feature = new PixiFeaturePoint(context, this.idAccessor(entity), entity.loc, vertexStyle);
        feature.rapidFeature = true;

        // vertices in this layer don't actually need to be interactive
        const dObj = feature.displayObject;
        dObj.buttonMode = false;
        dObj.interactive = false;
        dObj.interactiveChildren = false;

        // bind data and add to scene
        dObj.__data__ = entity;
        layer.addChild(dObj);
      }

      this.seenFeature.set(feature, timestamp);
      feature.visible = true;

      if (feature.needsUpdate(projection)) {
        feature.update(projection, zoom);
        scene.update(feature);
      }
    });

  }

}
