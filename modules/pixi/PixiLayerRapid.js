import * as PIXI from 'pixi.js';

import { services } from '../services';
import { PixiLayer } from './PixiLayer';

import { prefs } from '../core/preferences';
import geojsonRewind from '@mapbox/geojson-rewind';
import { vecLength, geomGetSmallestSurroundingRectangle } from '@id-sdk/math';
import { lineToPolygon } from './helpers';

const LAYERID = 'rapid';
const LAYERZINDEX = 2;
const MINZOOM = 12;

const SHOWBBOX = false;
const PARTIALFILLWIDTH = 32;


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
    this._datasetFeatures = new Map();  // special Map just to cull RapiD stuff
    this.dispatch = dispatch;

    this._serviceFB = null;
    this._serviceEsri = null;
    this.getServiceFB();
    this.getServiceEsri();

    this.textures = {};
    const square = new PIXI.Graphics()
      .lineStyle(1, 0xffffff)
      .beginFill(0xffffff, 0.5)
      .drawRect(-5, -5, 10, 10)
      .endFill();

    // convert graphics to textures/sprites for performance
    // https://stackoverflow.com/questions/50940737/how-to-convert-a-graphic-to-a-sprite-in-pixijs
    const renderer = context.pixi.renderer;
    const options = { resolution: 2 };
    this.textures.square = renderer.generateTexture(square, options);


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
      datasets.forEach(dataset => this.renderDataset(dataset, projection));
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
   */
  renderDataset(dataset, projection) {
    const context = this.context;
    const rapidContext = context.rapidContext();

    const service = dataset.service === 'fbml' ? this.getServiceFB(): this.getServiceEsri();
    if (!service) return;

    // Adjust the dataset id for whether we want the data conflated or not.
    const internalID = dataset.id + (dataset.conflated ? '-conflated' : '');
    const graph = service.graph(internalID);

    // Gather data
    let geoData = {
      points: [],
      vertices: [],
      lines: [],
      areas: []
    };

    function matchesGeometry(entity, geom) {
      if (geom === 'point') {
        return (entity.type === 'node');
      } else if (geom === 'line') {
        return (entity.type === 'way' && !entity.isArea());
      } else if (geom === 'area') {
        return (entity.type === 'relation' || (entity.type === 'way' && entity.isArea()));
      }
      return false;
    }

    let acceptedIDs = this._acceptedIDs;
    function isAccepted(entity) {
      return acceptedIDs.has(entity.id) || acceptedIDs.has(entity.__origid__);
    }


    /* Facebook AI/ML */
    if (dataset.service === 'fbml') {
      service.loadTiles(internalID, context.projection, rapidContext.getTaskExtent());  // fetch more

      let visibleData = service
        .intersects(internalID, context.map().extent())
        .filter(d => d.type === 'way' && !isAccepted(d));  // see onHistoryRestore()

      // fb_ai service gives us roads and buildings together,
      // so filter further according to which dataset we're drawing
      if (dataset.id === 'fbRoads' || dataset.id === 'rapid_intro_graph') {
        geoData.lines = visibleData
          .filter(d => matchesGeometry(d, 'line') && !!d.tags.highway);

        let seen = {};
        geoData.lines.forEach(d => {
          const first = d.first();
          const last = d.last();
          if (!seen[first]) {
            seen[first] = true;
            geoData.vertices.push(graph.entity(first));
          }
          if (!seen[last]) {
            seen[last] = true;
            geoData.vertices.push(graph.entity(last));
          }
        });

      } else {  // ms buildings or esri buildings through conflation service
        geoData.areas = visibleData
          .filter(d => matchesGeometry(d, 'area'));
      }

    /* ESRI ArcGIS */
    } else if (dataset.service === 'esri') {
      service.loadTiles(internalID, context.projection);  // fetch more

      let visibleData = service
        .intersects(internalID, context.map().extent())
        .filter(d => !isAccepted(d));  // see onHistoryRestore()

      geoData.points = visibleData
        .filter(d => matchesGeometry(d, 'node') && !!d.__fbid__);  // standalone only (not vertices/childnodes)
      geoData.lines = visibleData
        .filter(d => matchesGeometry(d, 'line'));
      geoData.areas = visibleData
        .filter(d => matchesGeometry(d, 'area'));
    }

    // If this layer container doesn't exist, create it and add it to the main rapid layer.
    let layerContainer = this.container.getChildByName(dataset.id);
    if (!layerContainer) {
      layerContainer = new PIXI.Container();
      layerContainer.interactive = true;
      layerContainer.buttonMode = true;
      layerContainer.sortableChildren = true;
      layerContainer.name = dataset.id;
      this.container.addChild(layerContainer);
    }


// CULL this dataset's stuff
// todo: improve CULL :-(
let visibleEntities = {};
geoData.points.forEach(entity => visibleEntities[entity.id] = true);
geoData.lines.forEach(entity => visibleEntities[entity.id] = true);
geoData.vertices.forEach(entity => visibleEntities[entity.id] = true);
geoData.areas.forEach(entity => visibleEntities[entity.id] = true);

let dsfeatures = this._datasetFeatures.get(dataset.id);
if (dsfeatures) {
  [...dsfeatures.entries()].forEach(function cull([entityID, feature]) {
    const isVisible = !!visibleEntities[entityID];
    feature.displayObject.visible = isVisible;
  });
}

    this.drawLines(layerContainer, graph, projection, geoData.lines, dataset);
    this.drawAreas(layerContainer, graph, projection, geoData.areas, dataset);
      // drawVertices(geoData.vertices, getTransform);
      // drawPoints(geoData.points, getTransform);
  }


  drawLines(layerContainer, graph, projection, entities, dataset) {
    const featureCache = this.featureCache;
    const k = projection.scale();

    entities.forEach(entity => {
      let feature = featureCache.get(entity.id);

      if (!feature) {
        const geojson = entity.asGeoJSON(graph);
        const coords = geojson.coordinates;

        const bounds = new PIXI.Rectangle();

        const container = new PIXI.Container();
        container.name = entity.id;
        container.interactive = true;
        container.buttonmode = true;
        container.__data__ = entity;
        layerContainer.addChild(container);

        const stroke = new PIXI.Graphics();
        container.addChild(stroke);

        const bbox = new PIXI.Graphics();
        bbox.name = entity.id + '-bbox';
        bbox.visible = SHOWBBOX;
        container.addChild(bbox);

        feature = {
          displayObject: container,
          bounds: bounds,
          stroke: stroke,
          bbox: bbox,
          coords: coords,
          color: PIXI.utils.string2hex(dataset.color),
          rapidFeature: true
        };

        featureCache.set(entity.id, feature);

        // todo: improve CULL :-(
        let dsfeatures = this._datasetFeatures.get(dataset.id);
        if (!dsfeatures) {
        dsfeatures = new Map();   // map of RAPID ID -> Pixi data
        this._datasetFeatures.set(dataset.id, dsfeatures);
        }
        dsfeatures.set(entity.id, feature);
      }


      // remember scale and reproject only when it changes
      if (k === feature.k) return;
      feature.k = k;

      // Reproject and recalculate the bounding box
      let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
      let points = [];

      feature.coords.forEach(coord => {
        const [x, y] = projection.project(coord);
        points.push([x, y]);

        [minX, minY] = [Math.min(x, minX), Math.min(y, minY)];
        [maxX, maxY] = [Math.max(x, maxX), Math.max(y, maxY)];
      });

      const [w, h] = [maxX - minX, maxY - minY];
      feature.bounds.x = minX;
      feature.bounds.y = minY;
      feature.bounds.width = w;
      feature.bounds.height = h;

      let lineWidth = 3;

      // redraw the stroke
      let g = feature.stroke
        .clear()
        .lineStyle({ color: feature.color, width: lineWidth });

      points.forEach(([x, y], i) => {
        if (i === 0) {
          g.moveTo(x, y);
        } else {
          g.lineTo(x, y);
        }
      });

       const hitTarget = lineToPolygon(lineWidth, g.currentPath.points);
       g.hitArea = hitTarget;
      // g.buttonMode = true;
      // g.interactive = true;

      if (SHOWBBOX) {
        feature.bbox
          .clear()
          .lineStyle({
            width: 1,
            color: 0x66ff66,
            alignment: 0   // inside
          })
          .drawShape(feature.bounds);
      }
    });
  }



  drawAreas(layerContainer, graph, projection, entities, dataset) {
    const featureCache = this.featureCache;
    const textures = this.textures;
    const k = projection.scale();
    const fillstyle = (prefs('area-fill') || 'partial');

    entities.forEach(entity => {
      let feature = featureCache.get(entity.id);

      if (!feature) {   // make poly if needed
        const geojson = geojsonRewind(entity.asGeoJSON(graph), true);
        const polygons = (geojson.type === 'Polygon') ? [geojson.coordinates]
          : (geojson.type === 'MultiPolygon') ? geojson.coordinates : [];

        const bounds = new PIXI.Rectangle();

        const container = new PIXI.Container();
        container.name = entity.id;
container.__data__ = entity;
container.interactive = false;
container.interactiveChildren = false;
        container.sortableChildren = false;

        const area = entity.extent(graph).area();  // estimate area from extent for speed
        container.zIndex = -area;                  // sort by area descending (small things above big things)

        layerContainer.addChild(container);

        const lowRes = new PIXI.Sprite(textures.square);
        lowRes.name = entity.id + '-lowRes';
        lowRes.anchor.set(0.5, 0.5);  // middle, middle
        lowRes.visible = false;
        container.addChild(lowRes);

        const fill = new PIXI.Graphics();
        fill.name = entity.id + '-fill';
        fill.interactive = false;
        fill.interactiveChildren = false;
        fill.sortableChildren = false;
        container.addChild(fill);

        const stroke = new PIXI.Graphics();
        stroke.name = entity.id + '-stroke';
        stroke.interactive = false;
        stroke.interactiveChildren = false;
        stroke.sortableChildren = false;
        container.addChild(stroke);

        const mask = new PIXI.Graphics();
        mask.name = entity.id + '-mask';
        mask.interactive = false;
        mask.interactiveChildren = false;
        mask.sortableChildren = false;
        container.addChild(mask);

        const bbox = new PIXI.Graphics();
        bbox.name = entity.id + '-bbox';
        bbox.interactive = false;
        bbox.interactiveChildren = false;
        bbox.sortableChildren = false;
        bbox.visible = SHOWBBOX;
        container.addChild(bbox);

        feature = {
          displayObject: container,
          bounds: bounds,
          color: PIXI.utils.string2hex(dataset.color),
          polygons: polygons,
          // texture: texture,
          lowRes: lowRes,
          fill: fill,
          stroke: stroke,
          mask: mask,
          bbox: bbox,
          rapidFeature: true,
        };

        featureCache.set(entity.id, feature);

// todo: improve CULL :-(
let dsfeatures = this._datasetFeatures.get(dataset.id);
if (!dsfeatures) {
 dsfeatures = new Map();   // map of RAPID ID -> Pixi data
 this._datasetFeatures.set(dataset.id, dsfeatures);
}
dsfeatures.set(entity.id, feature);
      }

      // Remember scale and reproject only when it changes
      if (k === feature.k) return;
      feature.k = k;

      // Reproject and recalculate the bounding box
      let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
      let shapes = [];

      // Convert the GeoJSON style multipolygons to array of Pixi polygons with inner/outer
      feature.polygons.forEach(rings => {
        if (!rings.length) return;  // no rings?

        let shape = { outer: undefined, holes: [] };
        shapes.push(shape);

        rings.forEach((ring, index) => {
          const isOuter = (index === 0);
          let points = [];

// // SSR Experiment:
// // If this is an uncomplicated area (no multiple outers)
// // perform a one-time calculation of smallest surrounding rectangle (SSR).
// // Maybe we will use it as a replacement geometry at low zooms.
let projectedring = [];

          ring.forEach(coord => {
            const [x, y] = projection.project(coord);
            points.push(x, y);
projectedring.push([x, y]);

            if (isOuter) {   // outer rings define the bounding box
              [minX, minY] = [Math.min(x, minX), Math.min(y, minY)];
              [maxX, maxY] = [Math.max(x, maxX), Math.max(y, maxY)];
            }
          });

          if (isOuter && !feature.ssrdata && feature.polygons.length === 1) {
            let ssr = geomGetSmallestSurroundingRectangle(projectedring);   // compute SSR in projected coordinates
            if (ssr && ssr.poly) {
              // Calculate axes of symmetry to determine width, height
              // The shape's surrounding rectangle has 2 axes of symmetry.
              //
              //       1
              //   p1 /\              p1 = midpoint of poly[0]-poly[1]
              //     /\ \ q2          q1 = midpoint of poly[2]-poly[3]
              //   0 \ \/\
              //      \/\ \ 2         p2 = midpoint of poly[3]-poly[0]
              //    p2 \ \/           q2 = midpoint of poly[1]-poly[2]
              //        \/ q1
              //        3

              const p1 = [(ssr.poly[0][0] + ssr.poly[1][0]) / 2, (ssr.poly[0][1] + ssr.poly[1][1]) / 2 ];
              const q1 = [(ssr.poly[2][0] + ssr.poly[3][0]) / 2, (ssr.poly[2][1] + ssr.poly[3][1]) / 2 ];
              const p2 = [(ssr.poly[3][0] + ssr.poly[0][0]) / 2, (ssr.poly[3][1] + ssr.poly[0][1]) / 2 ];
              const q2 = [(ssr.poly[1][0] + ssr.poly[2][0]) / 2, (ssr.poly[1][1] + ssr.poly[2][1]) / 2 ];
              const axis1 = [p1, q1];
              const axis2 = [p2, q2];
              const centroid = [ (p1[0] + q1[0]) / 2, (p1[1] + q1[1]) / 2 ];
              feature.ssrdata = {
                poly: ssr.poly.map(coord => projection.invert(coord)),   // but store in raw wgsr84 coordinates
                axis1: axis1.map(coord => projection.invert(coord)),
                axis2: axis2.map(coord => projection.invert(coord)),
                centroid: projection.invert(centroid),
                angle: ssr.angle
              };
            }
          }

          const poly = new PIXI.Polygon(points);
          if (isOuter) {
            shape.outer = poly;
          } else {
            shape.holes.push(poly);
          }
        });
      });

      const [w, h] = [maxX - minX, maxY - minY];
      feature.bounds.x = minX;
      feature.bounds.y = minY;
      feature.bounds.width = w;
      feature.bounds.height = h;


      // Determine style info
      let color = feature.color;
      let alpha = 0.5;
      let texture = feature.texture || PIXI.Texture.WHITE;  // WHITE turns off the texture
      let doPartialFill = (fillstyle === 'partial');

      // If this shape is so small that partial filling makes no sense, fill fully (faster?)
      const cutoff = (2 * PARTIALFILLWIDTH) + 5;
      if (w < cutoff || h < cutoff) {
        doPartialFill = false;
      }
      // If this shape is so small that texture filling makes no sense, skip it (faster?)
      if (w < 32 || h < 32) {
        texture = PIXI.Texture.WHITE;
      }

      // If this shape small, swap with ssr?
      if ((w < 20 || h < 20) && feature.ssrdata) {
        const ssrdata = feature.ssrdata;
        feature.fill.visible = false;
        feature.stroke.visible = false;
        feature.mask.visible = false;

        feature.lowRes.visible = true;

        const [x, y] = projection.project(ssrdata.centroid);
        const axis1 = ssrdata.axis1.map(coord => projection.project(coord));
        const axis2 = ssrdata.axis2.map(coord => projection.project(coord));
        const w = vecLength(axis1[0], axis1[1]);
        const h = vecLength(axis2[0], axis2[1]);

        feature.lowRes.position.set(x, y);
        feature.lowRes.scale.set(w / 10, h / 10);   // our sprite is 10x10
        feature.lowRes.rotation = ssrdata.angle;
        feature.lowRes.tint = color;
        return;

      } else {
        feature.fill.visible = true;
        feature.stroke.visible = true;
        feature.lowRes.visible = false;
      }

      // redraw the shapes


      // STROKES
//        feature.stroke.interactive = true;
//        feature.stroke.buttonMode = true;
//        feature.displayObject.hitArea = shapes[0].outer;
      feature.stroke
        .clear()
        .lineStyle({
          alpha: 1,
          width: 2,
          color: color
        });

      shapes.forEach(shape => {
        feature.stroke.drawShape(shape.outer);
        shape.holes.forEach(hole => feature.stroke.drawShape(hole));
      });


      // FILLS
      feature.fill.clear();
      shapes.forEach(shape => {
        feature.fill
          .beginTextureFill({
            alpha: alpha,
            color: color,
            texture: texture
          })
          .drawShape(shape.outer);

        if (shape.holes.length) {
          feature.fill.beginHole();
          shape.holes.forEach(hole => feature.fill.drawShape(hole));
          feature.fill.endHole();
        }
        feature.fill.endFill();
      });

      if (doPartialFill) {   // mask around the edges of the fill
        feature.mask
          .clear()
          .lineTextureStyle({
            alpha: 1,
            alignment: 0,  // inside (will do the right thing even for holes, as they are wound correctly)
            width: PARTIALFILLWIDTH,
            color: 0x000000,
            texture: PIXI.Texture.WHITE
          });

        shapes.forEach(shape => {
          feature.mask.drawShape(shape.outer);
          shape.holes.forEach(hole => feature.mask.drawShape(hole));
        });

        feature.mask.visible = true;
        feature.fill.mask = feature.mask;
        feature.displayObject.hitArea = null;

      } else {  // full fill - no mask
        feature.mask.visible = false;
        feature.fill.mask = null;
      }

      if (SHOWBBOX) {
        feature.bbox
          .clear()
          .lineStyle({
            width: 1,
            color: doPartialFill ? 0xffff00 : 0x66ff66,
            alignment: 0   // inside
          })
          .drawShape(feature.bounds);
      }

    });

  }

}



