import _throttle from 'lodash-es/throttle';

import { select as d3_select} from 'd3-selection';
import { geoScaleToZoom } from '../geo';
import { services } from '../services';
import { svgPath, svgPointTransform } from './index';
import { utilStringQs } from '../util';


const radii = {
    //       z16-, z17,  z18+
    stroke: [3.5,  4,    4.5],
    fill:   [2,    2,    2.5]
};
let _enabled = false;
let _initialized = false;
let _roadsService;
let _actioned;


export function svgAiFeatures(projection, context, dispatch) {
  let throttledRedraw = _throttle(() => dispatch.call('change'), 1000);
  let layer = d3_select(null);
  let gpxInUrl = utilStringQs(window.location.hash).gpx;


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


  function getService() {
    if (services.fbMLRoads && !_roadsService) {
      _roadsService = services.fbMLRoads;
      _roadsService.event.on('loadedData', throttledRedraw);
    }

    return _roadsService;
  }


  function isAiFeaturesAnnotation(annotation) {
    return annotation &&
      (annotation.type === 'fb_accept_feature'
      || annotation.type === 'fb_reject_feature');
  }


  function onHistoryUndone(currentStack, previousStack) {
    const annotation = previousStack.annotation;
    if (isAiFeaturesAnnotation(annotation)) {
      _actioned.delete(annotation.id);
      if (_enabled) { dispatch.call('change'); }  // redraw
    }
  }


  function onHistoryChange(/* difference */) {
    const annotation = context.history().peekAnnotation();
    if (isAiFeaturesAnnotation(annotation)) {
      _actioned.add(annotation.id);
      if (_enabled) { dispatch.call('change'); }  // redraw
    }
  }


  function onHistoryRestore() {
    _actioned = new Set();
    context.history().peekAllAnnotations().forEach(annotation => {
      if (isAiFeaturesAnnotation(annotation)) {
        _actioned.add(annotation.id);
        // origid (the original entity ID), a.k.a. datum.__origid__,
        // is a hack used to deal with non-deterministic way-splitting
        // in the roads service. Each way "split" will have an origid
        // attribute for the original way it was derived from. In this
        // particular case, restoring from history on page reload, we
        // prevent new splits (possibly different from before the page
        // reload) from being displayed by storing the origid and
        // checking against it in drawData().
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
    layer.style('display', 'block');
  }


  function layerOff() {
    layer.style('display', 'none');
  }


  function isBuilding(d){
    return d.tags.building === 'yes';
  }


  function isRoad(d){
    return !!d.tags.highway;
  }


  function featureKey(d) {
    return d.__fbid__;
  }


  function featureClasses(d) {
    return [
      'data' + d.__fbid__,
      isBuilding(d) ? 'building' : 'road',
      d.geometry.type,
    ].filter(Boolean).join(' ');
  }


  function drawData(selection) {
    layer = selection.selectAll('.layer-ai-features')
      .data(_enabled ? [0] : []);

    layer.exit()
      .remove();

    layer = layer.enter()
      .append('g')
      .attr('class', 'layer-ai-features')
      .merge(layer);

    const surface = context.surface();
    const waitingForTaskExtent = gpxInUrl && !context.rapidContext().getTaskExtent();
    if (!surface || surface.empty() || waitingForTaskExtent) return;  // not ready to draw yet, starting up

    const roadsService = getService();
    const roadsGraph = roadsService && roadsService.graph();
    const getPath = svgPath(projection, roadsGraph);
    const getTransform = svgPointTransform(projection);


    // Gather data
    let geoData = [];
    if (roadsService && context.map().zoom() >= context.minEditableZoom()) {
      roadsService.loadTiles(projection, context.rapidContext().getTaskExtent());
      geoData = roadsService
        .intersects(context.extent())
        .filter(d => {
          return d.type === 'way'
            && !_actioned.has(d.id)
            && !_actioned.has(d.__origid__);  // see onHistoryRestore()
        })
        .filter(getPath);
    }


    // Draw shadow, casing, stroke layers
    let linegroups = layer
      .selectAll('g.linegroup')
      .data(['shadow', 'casing', 'stroke']);

    linegroups = linegroups.enter()
      .append('g')
      .attr('class', d => `linegroup linegroup-${d}`)
      .merge(linegroups);

    // Draw paths
    let pathData = {
      shadow: geoData,
      casing: geoData,
      stroke: geoData
    };

    let paths = linegroups
      .selectAll('path')
      .data(layer => pathData[layer], featureKey);

    // exit
    paths.exit()
      .remove();

    // enter/update
    paths = paths.enter()
      .append('path')
      .attr('class', (d, i, nodes) => {
        const currNode = nodes[i];
        const linegroup = currNode.parentNode.__data__;
        return 'pathdata line ' + linegroup + ' ' + featureClasses(d);
      })
      .merge(paths)
      .attr('d', getPath);


    // Draw first, last vertex layers
    let vertexgroups = layer
      .selectAll('g.vertexgroup')
      .data(['first', 'last']);

    vertexgroups = vertexgroups.enter()
      .append('g')
      .attr('class', d => `vertexgroup vertexgroup-${d}`)
      .merge(vertexgroups);

    // Draw groups
    let vertexData = {
      first: geoData,
      last: geoData
    };

    let groups = vertexgroups
      .selectAll('g.vertex')
      .data(layer => vertexData[layer], featureKey);

    // exit
    groups.exit()
      .remove();

    // enter
    let enter = groups.enter()
      .append('g')
      .attr('class', (d, i, nodes) => {
        const currNode = nodes[i];
        const vertexgroup = currNode.parentNode.__data__;
        return 'node vertex ' + vertexgroup + ' ' + featureClasses(d);
      });

    enter
      .append('circle')
      .attr('class', 'stroke');

    enter
      .append('circle')
      .attr('class', 'fill');

    // update
    const zoom = geoScaleToZoom(projection.scale());
    const radiusIdx = (zoom < 17 ? 0 : zoom < 18 ? 1 : 2);
    groups = groups
      .merge(enter)
      .attr('transform', (d, i, nodes) => {
        const currNode = nodes[i];
        const vertexgroup = currNode.parentNode.__data__;
        const nodeIdx = vertexgroup === 'first' ? 0 : d.nodes.length - 1;
        return getTransform(roadsGraph.entities[d.nodes[nodeIdx]]);
      })
      .call(selection => {
        ['stroke', 'fill'].forEach(klass => {
          selection.selectAll('.' + klass)
            .attr('r', radii[klass][radiusIdx]);
        });
      });
  }


  drawData.showAll = function() {
    return _enabled;
  };


  drawData.enabled = function(val) {
    if (!arguments.length) return _enabled;

    _enabled = val;
    if (_enabled) {
      showLayer();
    } else {
      hideLayer();
    }

    dispatch.call('change');
    return drawData;
  };


  init();
  return drawData;
}
