import { select as d3_select} from 'd3-selection';
import { dispatch as d3_dispatch } from 'd3-dispatch';
import { geoScaleToZoom } from '@id-sdk/math';
import _throttle from 'lodash-es/throttle';
import { utilArrayFlatten } from '@id-sdk/util';
import { services } from '../services';
import { svgPath, svgPointTransform } from '../svg/index';
import * as PIXI from 'pixi.js';
import { data } from 'autoprefixer';


let _enabled = false;
let _initialized = false;
let _FbMlService;
let _EsriService;
let _actioned;
let _dispatch = d3_dispatch('change');


export function pixiRapidFeatures(projectionMutator, context, featureCache) {
  const RAPID_MAGENTA = '#da26d3';
  const _projectionMutator = projectionMutator;
  const throttledRedraw = _throttle(() => _dispatch.call('change'), 1000);
  const gpxInUrl = context.initialHashParams.hasOwnProperty('gpx');


  function init() {
    if (_initialized) return;  // run once

    _enabled = true;
    _initialized = true;
    _actioned = new Set();

    // Watch history to synchronize the displayed layer with features
    // that have been accepted or rejected by the user.
    context.history().on('undone.aifeatures', onHistoryUndone);
    context.history().on('change.aifeatures', onHistoryChange);
    context.history().on('restore.aifeatures', onHistoryRestore);
  }


  // Services are loosly coupled in iD, so we use these functions
  // to gain access to them, and bind the event handlers a single time.
  function getFbMlService() {
    if (services.fbMLRoads && !_FbMlService) {
      _FbMlService = services.fbMLRoads;
      _FbMlService.event.on('loadedData', throttledRedraw);
    }
    return _FbMlService;
  }

  function getEsriService() {
    if (services.esriData && !_EsriService) {
      _EsriService = services.esriData;
      _EsriService.event.on('loadedData', throttledRedraw);
    }
    return _EsriService;
  }


  function wasRapidEdit(annotation) {
    return annotation && annotation.type && /^rapid/.test(annotation.type);
  }


  function onHistoryUndone(currentStack, previousStack) {
    const annotation = previousStack.annotation;
    if (!wasRapidEdit(annotation)) return;

    _actioned.delete(annotation.id);
    if (_enabled) { _dispatch.call('change'); }  // redraw
  }


  function onHistoryChange(/* difference */) {
    const annotation = context.history().peekAnnotation();
    if (!wasRapidEdit(annotation)) return;

    _actioned.add(annotation.id);
    if (_enabled) { _dispatch.call('change'); }  // redraw
  }


  function onHistoryRestore() {
    _actioned = new Set();
    context.history().peekAllAnnotations().forEach(annotation => {
      if (wasRapidEdit(annotation)) {
        _actioned.add(annotation.id);
        // origid (the original entity ID), a.k.a. datum.__origid__,
        // is a hack used to deal with non-deterministic way-splitting
        // in the roads service. Each way "split" will have an origid
        // attribute for the original way it was derived from. In this
        // particular case, restoring from history on page reload, we
        // prevent new splits (possibly different from before the page
        // reload) from being displayed by storing the origid and
        // checking against it in render().
        if (annotation.origid) {
          _actioned.add(annotation.origid);
        }
      }
    });
    if (_actioned.size && _enabled) {
      _dispatch.call('change');  // redraw
    }
  }


  function showLayer() {
    throttledRedraw();
    layerOn();
  }


  function hideLayer() {
    throttledRedraw.cancel();
    layerOff();
  }


  function layerOn() {
    context.pixi.stage.getChildByName('rapid').visible = true;
    _dispatch.call('change');
  }


  function layerOff() {
    context.pixi.stage.getChildByName('rapid').visible = false;
    _dispatch.call('change');
  }


  function isArea(d) {
    return (d.type === 'relation' || (d.type === 'way' && d.isArea()));
  }


  function featureKey(d) {
    return d.__fbid__;
  }


  function render(layer, projection) {
    const rapidContext = context.rapidContext();
    const surface = context.surface();
    const waitingForTaskExtent = gpxInUrl && !rapidContext.getTaskExtent();
    if (!surface || surface.empty() || waitingForTaskExtent) return;  // not ready to draw yet, starting up


    const rapidDatasets = rapidContext.datasets();
    const datasets = Object.values(rapidDatasets)
      .filter(dataset => dataset.added && dataset.enabled);

    datasets.forEach((dataset) => eachDataset(layer, projection, dataset));
  }


  function eachDataset(layer, projection, dataset) {
    const rapidContext = context.rapidContext();
    const service = dataset.service === 'fbml' ? getFbMlService(): getEsriService();
    if (!service) return;

    // Adjust the dataset id for whether we want the data conflated or not.
    const internalID = dataset.id + (dataset.conflated ? '-conflated' : '');
    const graph = service.graph(internalID);

    // Gather data
    let geoData = {
      paths: [],
      vertices: [],
      points: []
    };

    if (context.map().zoom() >= context.minEditableZoom()) {
      /* Facebook AI/ML */
      if (dataset.service === 'fbml') {

        service.loadTiles(internalID, _projectionMutator, rapidContext.getTaskExtent());
        let pathData = service
          .intersects(internalID, context.map().extent())
          .filter(d => d.type === 'way' && !_actioned.has(d.id) && !_actioned.has(d.__origid__));  // see onHistoryRestore()

        // fb_ai service gives us roads and buildings together,
        // so filter further according to which dataset we're drawing
        if (dataset.id === 'fbRoads' || dataset.id === 'rapid_intro_graph') {
          geoData.paths = pathData.filter(d => !!d.tags.highway);

          let seen = {};
          geoData.paths.forEach(d => {
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

        } else if (dataset.id === 'msBuildings') {
          geoData.paths = pathData.filter(isArea);
          // no vertices
        } else {
          // esri data via fb service
          geoData.paths = pathData.filter(isArea);
        }

      /* ESRI ArcGIS */
      } else if (dataset.service === 'esri') {
        service.loadTiles(internalID, _projectionMutator);
        let visibleData = service
          .intersects(internalID, context.map().extent())
          .filter(d => !_actioned.has(d.id) && !_actioned.has(d.__origid__) );  // see onHistoryRestore()

        geoData.points = visibleData
          .filter(d => d.type === 'node' && !!d.__fbid__);  // standalone only (not vertices/childnodes)

        geoData.paths = visibleData
          .filter(d => d.type === 'way' || d.type === 'relation');
      }
    }
    drawPaths(graph, layer, projection, geoData.paths, dataset);
      // drawVertices(geoData.vertices, getTransform);
      // drawPoints(geoData.points, getTransform);
  }


  function drawPaths(graph, layer, projection, entities, dataset) {

    const k = projection.scale();
    let layerContainer = context.pixi.stage.getChildByName('rapid').getChildByName(dataset.id);

    //If this layer container doesn't exist, create it and add it to the main rapid layer.
    if (!layerContainer) {
      layerContainer = new PIXI.Container();
      layerContainer.name = dataset.id;
      layer.addChild(layerContainer);
    }

    entities.forEach(function preparePaths(entity) {
      let feature = featureCache.get(entity.id);

      if (!feature) { // Make the path if needed
        const geojson = entity.asGeoJSON(graph);
        const coords = geojson.coordinates;

        const container = new PIXI.Container();
        container.name = entity.id;
        layerContainer.addChild(container);

        const graphics = new PIXI.Graphics();
        container.addChild(graphics);

        let newCoords;
        let area = false;
        if (coords.length === 1) { //Area!
          newCoords = [...coords[0]];
          area = true;
        } else {
          newCoords = coords;
        }

        feature = {
          displayObject: container,
          coords: newCoords,
          color: PIXI.utils.string2hex(dataset.color),
          graphics: graphics,
          isArea: area,
        };
        featureCache.set(entity.id, feature);
      }


        // remember scale and reproject only when it changes
        if (k === feature.k) return;
        feature.k = k;


      const points = feature.coords.map(coord => projection.project(coord));
      if (feature.isArea) {
        updateArea(feature.graphics);
      } else {
        updateWay(feature.graphics);
      }

      function updateWay(graphic) {
        let g = graphic.clear();
        g = g.lineStyle({
          color: feature.color,
          width: 3,
          alpha: 1
        });


        points.forEach(([x, y], i) => {
          if (i === 0) {
            g.moveTo(x, y);
          } else {
            g.lineTo(x, y);
          }
        });
      }

      function updateArea(graphic) {
        let g = graphic.clear();
        g = g.lineStyle({
          color: feature.color,
          width: 3,
          alpha: 1
        });

        g.beginFill(feature.color, 0.35)
          .drawPolygon(utilArrayFlatten(points))
          .endFill();
      }
    });
  }


  // function drawVertices(selection, vertexData, getTransform) {
  //   const vertRadii = {
  //     //       z16-, z17,  z18+
  //     stroke: [3.5,  4,    4.5],
  //     fill:   [2,    2,    2.5]
  //   };

  //   let vertexGroup = selection
  //     .selectAll('g.vertexgroup')
  //     .data(vertexData.length ? [0] : []);

  //   vertexGroup.exit()
  //     .remove();

  //   vertexGroup = vertexGroup.enter()
  //     .append('g')
  //     .attr('class', 'vertexgroup')
  //     .merge(vertexGroup);


  //   let vertices = vertexGroup
  //     .selectAll('g.vertex')
  //     .data(vertexData, d => d.id);

  //   // exit
  //   vertices.exit()
  //     .remove();

  //   // enter
  //   let enter = vertices.enter()
  //     .append('g')
  //     .attr('class', d => `node vertex ${d.id}`);

  //   enter
  //     .append('circle')
  //     .attr('class', 'stroke');

  //   enter
  //     .append('circle')
  //     .attr('class', 'fill');

  //   // update
  //   const zoom = geoScaleToZoom(projection.scale());
  //   const radiusIdx = (zoom < 17 ? 0 : zoom < 18 ? 1 : 2);
  //   vertices = vertices
  //     .merge(enter)
  //     .attr('transform', getTransform)
  //     .call(selection => {
  //       ['stroke', 'fill'].forEach(klass => {
  //         selection.selectAll('.' + klass)
  //           .attr('r', vertRadii[klass][radiusIdx]);
  //       });
  //     });
  // }


  // function drawPoints(selection, pointData, getTransform) {
  //   const pointRadii = {
  //     //       z16-, z17,  z18+
  //     shadow: [4.5,   7,   8],
  //     stroke: [4.5,   7,   8],
  //     fill:   [2.5,   4,   5]
  //   };

  //   let pointGroup = selection
  //     .selectAll('g.pointgroup')
  //     .data(pointData.length ? [0] : []);

  //   pointGroup.exit()
  //     .remove();

  //   pointGroup = pointGroup.enter()
  //     .append('g')
  //     .attr('class', 'pointgroup')
  //     .merge(pointGroup);

  //   let points = pointGroup
  //     .selectAll('g.point')
  //     .data(pointData, featureKey);

  //   // exit
  //   points.exit()
  //     .remove();

  //   // enter
  //   let enter = points.enter()
  //     .append('g')
  //     .attr('class', d => `node point data${d.__fbid__}`);

  //   enter
  //     .append('circle')
  //     .attr('class', 'shadow');

  //   enter
  //     .append('circle')
  //     .attr('class', 'stroke');

  //   enter
  //     .append('circle')
  //     .attr('class', 'fill');

  //   // update
  //   const zoom = geoScaleToZoom(projection.scale());
  //   const radiusIdx = (zoom < 17 ? 0 : zoom < 18 ? 1 : 2);
  //   points = points
  //     .merge(enter)
  //     .attr('transform', getTransform)
  //     .call(selection => {
  //       ['shadow', 'stroke', 'fill'].forEach(klass => {
  //         selection.selectAll('.' + klass)
  //           .attr('r', pointRadii[klass][radiusIdx]);
  //       });
  //     });
  // }


  render.showAll = function() {
    return _enabled;
  };


  render.enabled = function(val) {
    if (!arguments.length) return _enabled;

    _enabled = val;
    if (_enabled) {
      showLayer();
    } else {
      hideLayer();
    }

    _dispatch.call('change');
    return render;
  };


  init();
  return render;
}
