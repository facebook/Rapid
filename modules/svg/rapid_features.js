import _throttle from 'lodash-es/throttle';

import { select as d3_select} from 'd3-selection';
import { geoScaleToZoom } from '../geo';
import { services } from '../services';
import { svgPath, svgPointTransform } from './index';
import { utilStringQs } from '../util';

let _enabled = false;
let _initialized = false;
let _FbMlService;
let _FbStreetviewSuggestionsService;
let _EsriService;
let _actioned;


export function svgRapidFeatures(projection, context, dispatch) {
  const VIEWFIELD_MAGENTA = 'rgba(218, 38, 212, 0.6)';
  const RAPID_MAGENTA = '#da26d3';
  const throttledRedraw = _throttle(() => dispatch.call('change'), 1000);
  const gpxInUrl = utilStringQs(window.location.hash).gpx;
  let _layer = d3_select(null);


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


  function getFbStreetviewSuggestionsService() {
    if (services.fbStreetviewSuggestions && !_FbStreetviewSuggestionsService) {
      _FbStreetviewSuggestionsService = services.fbStreetviewSuggestions;
      _FbStreetviewSuggestionsService.event.on('loadedData', throttledRedraw);
    }
    return _FbStreetviewSuggestionsService;
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
    if (_enabled) { dispatch.call('change'); }  // redraw
  }


  function onHistoryChange(/* difference */) {
    const annotation = context.history().peekAnnotation();
    if (!wasRapidEdit(annotation)) return;

    _actioned.add(annotation.id);
    if (_enabled) { dispatch.call('change'); }  // redraw
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
      dispatch.call('change');  // redraw
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
    _layer.style('display', 'block');
  }


  function layerOff() {
    _layer.style('display', 'none');
  }


  function isArea(d) {
    return (d.type === 'relation' || (d.type === 'way' && d.isArea()));
  }


  function featureKey(d) {
    return d.__fbid__;
  }


  function render(selection) {
    const rapidContext = context.rapidContext();

    // Ensure Rapid layer and <defs> exists
    _layer = selection.selectAll('.layer-ai-features')
      .data(_enabled ? [0] : []);

    _layer.exit()
      .remove();

    let layerEnter = _layer.enter()
      .append('g')
      .attr('class', 'layer-ai-features');

    layerEnter
      .append('defs')
      .attr('class', 'rapid-defs');

    _layer = layerEnter
      .merge(_layer);

    const surface = context.surface();
    const waitingForTaskExtent = gpxInUrl && !rapidContext.getTaskExtent();
    if (!surface || surface.empty() || waitingForTaskExtent) return;  // not ready to draw yet, starting up


    // Gather available datasets, generate a unique fill pattern
    // and a layer group for each dataset. Fill pattern styling is complicated.
    // Style needs to apply in the def, not where the pattern is used.
    const rapidDatasets = rapidContext.datasets();
    const datasets = Object.values(rapidDatasets)
      .filter(dataset => dataset.added && dataset.enabled);

    let defs = _layer.selectAll('.rapid-defs');
    let dsPatterns = defs.selectAll('.rapid-fill-pattern')
      .data(datasets, d => d.id);

    // exit
    dsPatterns.exit()
      .remove();

    // enter
    let dsPatternsEnter = dsPatterns.enter()
      .append('pattern')
      .attr('id', d => `fill-${d.id}`)
      .attr('class', 'rapid-fill-pattern')
      .attr('width', 5)
      .attr('height', 15)
      .attr('patternUnits', 'userSpaceOnUse')
      .attr('patternTransform', (d, i) => {
        const r = (45 + (67 * i)) % 180;   // generate something different for each layer
        return `rotate(${r})`;
      });

    dsPatternsEnter
      .append('line')
      .attr('class', 'ai-building-line')
      .attr('stroke', 'currentColor')
      .attr('stroke-width', '2px')
      .attr('stroke-opacity', 0.6)
      .attr('y2', '15');

    // update
    dsPatterns = dsPatternsEnter
      .merge(dsPatterns)
      .style('color', d => d.color || RAPID_MAGENTA);


    let dsGroups = _layer.selectAll('.layer-rapid-dataset')
      .data(datasets, d => d.id);

    // exit
    dsGroups.exit()
      .remove();

    // enter/update
    dsGroups = dsGroups.enter()
      .append('g')
      .attr('class', d => `layer-rapid-dataset layer-rapid-dataset-${d.id}`)
      .merge(dsGroups)
      .style('color', d => d.color || RAPID_MAGENTA)
      .each(eachDataset);
  }


  function getServiceByDataset(ds) {
    switch (ds.service) {
      case 'fbml':
        return getFbMlService();
      case 'fbml_streetview':
        return getFbStreetviewSuggestionsService();
      default:
        return getEsriService();
    }
  }


  function transformViewFieldPoint(d) {
      if(!d.loc) {
        d.loc = [d.lon, d.lat];
      }
      var t = svgPointTransform(projection)(d);
      t += ' scale(2,2) rotate(' + Math.floor(d.ca) + ',0,0)';
      return t;
  }


  function eachDataset(dataset, i, nodes) {
    const rapidContext = context.rapidContext();
    const selection = d3_select(nodes[i]);
    const service = getServiceByDataset(dataset);
    if (!service) return;
    const selectedIDs = context.selectedIDs();

    // Adjust the dataset id for whether we want the data conflated or not.
    const internalID = dataset.id + (dataset.conflated ? '-conflated' : '');
    const graph = service.graph(internalID);
    const getPath = svgPath(projection, graph);
    const getTransform = svgPointTransform(projection);

    // Gather data
    let geoData = {
      paths: [],
      vertices: [],
      points: [],
      viewfieldPoints: []
    };

    if (context.map().zoom() >= context.minEditableZoom()) {
      /* Facebook AI/ML */
      if (dataset.service === 'fbml' || dataset.service === 'fbml_streetview') {

        service.loadTiles(internalID, projection, rapidContext.getTaskExtent());
        let pathData = service
          .intersects(internalID, context.map().extent())
          .filter(d => d.type === 'way' && !_actioned.has(d.id) && !_actioned.has(d.__origid__) )  // see onHistoryRestore()
          .filter(getPath);

        // fb_ai service gives us roads and buildings together,
        // so filter further according to which dataset we're drawing
        if (dataset.id === 'fbRoads' || dataset.id === 'rapid_intro_graph' || dataset.id === 'fbSidewalks') {
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
            if(selectedIDs.includes(d.id) && d.suggestionContext && d.suggestionContext.streetViewImageSet) {
              const {images} = d.suggestionContext.streetViewImageSet;
              if(images) {
                geoData.viewfieldPoints = images;
              }
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
        service.loadTiles(internalID, projection);
        let visibleData = service
          .intersects(internalID, context.map().extent())
          .filter(d => !_actioned.has(d.id) && !_actioned.has(d.__origid__) );  // see onHistoryRestore()

        geoData.points = visibleData
          .filter(d => d.type === 'node' && !!d.__fbid__);  // standalone only (not vertices/childnodes)

        geoData.paths = visibleData
          .filter(d => d.type === 'way' || d.type === 'relation')
          .filter(getPath);
      }
    }

    selection
      .call(drawPaths, geoData.paths, dataset, getPath)
      .call(drawVertices, geoData.vertices, getTransform)
      .call(drawPoints, geoData.points, getTransform)
      .call(drawViewfieldPoints, geoData.viewfieldPoints);

    context.rapidContext().on('select_suggested_viewfield', function() {
      const selectedImage = rapidContext.getSelectSuggestedImage();
      if(selectedImage) {
        selection.select(`.viewfield-${selectedImage.key}`).style('stroke', 'white');
      } else {
        selection.selectAll(`.viewfieldSuggestion`)
          .style('stroke', VIEWFIELD_MAGENTA).attr('class', 'unzoomed');
      }
    });
  }


  function drawPaths(selection, pathData, dataset, getPath) {
    // Draw shadow, casing, stroke layers
    let linegroups = selection
      .selectAll('g.linegroup')
      .data(['shadow', 'casing', 'stroke']);

    linegroups = linegroups.enter()
      .append('g')
      .attr('class', d => `linegroup linegroup-${d}`)
      .merge(linegroups);

    // Draw paths
    let paths = linegroups
      .selectAll('path')
      .data(pathData, featureKey);

    // exit
    paths.exit()
      .remove();

    // enter/update
    paths = paths.enter()
      .append('path')
      .attr('style', d => isArea(d) ? `fill: url(#fill-${dataset.id})` : null)
      .attr('class', (d, i, nodes) => {
        const currNode = nodes[i];
        const linegroup = currNode.parentNode.__data__;
        const klass = isArea(d) ? 'building' : 'road';
        return `line ${linegroup} ${klass} data${d.__fbid__}`;
      })
      .merge(paths)
      .attr('d', getPath);
  }


  function drawViewfieldPoints(selection, viewfieldPoints) {
    const rapidContext = context.rapidContext();
    let viewfield = selection.selectAll("g.suggestionViewfieldGroup")
      .data(viewfieldPoints.length ? [0] : []);
    viewfield.exit().remove();

    viewfield = viewfield.enter()
      .append('g')
      .attr('class', 'suggestionViewfieldGroup')
      .merge(viewfield);

    let points = viewfield
      .selectAll('g.viewfieldSuggestion')
      .style('stroke', VIEWFIELD_MAGENTA)
      .on('mouseenter', (d, i) => {
        selection.select(`.viewfield-${viewfieldPoints[i].key}`).style('stroke', 'white');
        rapidContext.selectSuggestedImage(viewfieldPoints[i]);
      })
      .on('mouseleave', () => {
        selection.selectAll(`.viewfieldSuggestion`).style('stroke', VIEWFIELD_MAGENTA);
        rapidContext.selectSuggestedImage(null);
      })
      .data(viewfieldPoints, d => d.key);

    points.exit().remove();

    const enter = points.enter()
      .append('g')
      .attr('class', d => `viewfieldSuggestion viewfield-${d.key}`);

    // the circle created here needs to be aligned with
    // viewfield path added after it.
    enter
      .append('circle')
      .attr('r', 4)
      .attr('cx', 8)
      .attr('cy', 14)
      .attr('fill', VIEWFIELD_MAGENTA);

    enter
      .append('path')
      .attr('d', 'M 6,9 C 8,8.4 8,8.4 10,9 L 16,-2 C 12,-5 4,-5 0,-2 z')
      .attr('fill', VIEWFIELD_MAGENTA);

    // update
    points = points
      .merge(enter)
      .attr('transform', transformViewFieldPoint);
  }


  function drawVertices(selection, vertexData, getTransform) {
    const vertRadii = {
      //       z16-, z17,  z18+
      stroke: [3.5,  4,    4.5],
      fill:   [2,    2,    2.5]
    };

    let vertexGroup = selection
      .selectAll('g.vertexgroup')
      .data(vertexData.length ? [0] : []);

    vertexGroup.exit()
      .remove();

    vertexGroup = vertexGroup.enter()
      .append('g')
      .attr('class', 'vertexgroup')
      .merge(vertexGroup);


    let vertices = vertexGroup
      .selectAll('g.vertex')
      .data(vertexData, d => d.id);

    // exit
    vertices.exit()
      .remove();

    // enter
    let enter = vertices.enter()
      .append('g')
      .attr('class', d => `node vertex ${d.id}`);

    enter
      .append('circle')
      .attr('class', 'stroke');

    enter
      .append('circle')
      .attr('class', 'fill');

    // update
    const zoom = geoScaleToZoom(projection.scale());
    const radiusIdx = (zoom < 17 ? 0 : zoom < 18 ? 1 : 2);
    vertices = vertices
      .merge(enter)
      .attr('transform', getTransform)
      .call(selection => {
        ['stroke', 'fill'].forEach(klass => {
          selection.selectAll('.' + klass)
            .attr('r', vertRadii[klass][radiusIdx]);
        });
      });
  }


  function drawPoints(selection, pointData, getTransform) {
    const pointRadii = {
      //       z16-, z17,  z18+
      shadow: [4.5,   7,   8],
      stroke: [4.5,   7,   8],
      fill:   [2.5,   4,   5]
    };

    let pointGroup = selection
      .selectAll('g.pointgroup')
      .data(pointData.length ? [0] : []);

    pointGroup.exit()
      .remove();

    pointGroup = pointGroup.enter()
      .append('g')
      .attr('class', 'pointgroup')
      .merge(pointGroup);

    let points = pointGroup
      .selectAll('g.point')
      .data(pointData, featureKey);

    // exit
    points.exit()
      .remove();

    // enter
    let enter = points.enter()
      .append('g')
      .attr('class', d => `node point data${d.__fbid__}`);

    enter
      .append('circle')
      .attr('class', 'shadow');

    enter
      .append('circle')
      .attr('class', 'stroke');

    enter
      .append('circle')
      .attr('class', 'fill');

    // update
    const zoom = geoScaleToZoom(projection.scale());
    const radiusIdx = (zoom < 17 ? 0 : zoom < 18 ? 1 : 2);
    points = points
      .merge(enter)
      .attr('transform', getTransform)
      .call(selection => {
        ['shadow', 'stroke', 'fill'].forEach(klass => {
          selection.selectAll('.' + klass)
            .attr('r', pointRadii[klass][radiusIdx]);
        });
      });
  }


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

    dispatch.call('change');
    return render;
  };


  init();
  return render;
}
