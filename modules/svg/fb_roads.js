import _throttle from 'lodash-es/throttle';

import { select as d3_select } from 'd3-selection';
import { geoScaleToZoom } from '../geo';
import { services } from '../services';
import { svgPath, svgPointTransform } from './index';


var radii = {
    //       z16-, z17,  z18+
    stroke: [3.5,  4,    4.5],
    fill:   [2,    2,    2.5]
};


export function svgFbRoads(projection, context, dispatch) {
    var throttledRedraw = _throttle(function () { dispatch.call('change'); }, 1000);
    var layer = d3_select(null);
    var _enabled = false;
    var _initialized = false;
    var _roadsService;


    function init() {
        if (_initialized) return;  // run once

        _enabled = true;
        _initialized = true;
    }


    function getService() {
        if (services.fbMLRoads && !_roadsService) {
            _roadsService = services.fbMLRoads;
            _roadsService.event.on('loadedData', throttledRedraw);
        }

        return _roadsService;
    }


    function showLayer() {
        layerOn();

        layer
            .style('opacity', 0)
            .transition()
            .duration(250)
            .style('opacity', 1)
            .on('end', function () { dispatch.call('change'); });
    }


    function hideLayer() {
        throttledRedraw.cancel();

        layer
            .transition()
            .duration(250)
            .style('opacity', 0)
            .on('end', layerOff);
    }


    function layerOn() {
        layer.style('display', 'block');
    }


    function layerOff() {
        layer.style('display', 'none');
    }


    function featureKey(d) {
        return d.__fbid__;
    }


    function featureClasses(d) {
        return [
            'data' + d.__fbid__,
            d.geometry.type,
        ].filter(Boolean).join(' ');
    }


    function drawData(selection) {
        layer = selection.selectAll('.layer-fb-roads')
            .data(_enabled ? [0] : []);

        layer.exit()
            .remove();

        layer = layer.enter()
            .append('g')
            .attr('class', 'layer-fb-roads')
            .merge(layer);

        var surface = context.surface();
        if (!surface || surface.empty()) return;  // not ready to draw yet, starting up

        var roadsService = getService();
        var graph = context.graph();
        var roadsGraph = roadsService && roadsService.graph();
        var getPath = svgPath(projection, roadsGraph);
        var getTransform = svgPointTransform(projection);

        // Gather data
        var geoData = [];
        if (roadsService && context.map().zoom() >= context.minEditableZoom()) {
            roadsService.loadTiles(projection);
            geoData = roadsService
                .intersects(context.extent())
                .filter(function(d) {
                    return d.type === 'way'
                        && !graph.entities[d.id];
                })
                .filter(getPath);
        }


        // Draw shadow, casing, stroke layers
        var linegroups = layer
            .selectAll('g.linegroup')
            .data(['shadow', 'casing', 'stroke']);

        linegroups = linegroups.enter()
            .append('g')
            .attr('class', function(d) { return 'linegroup linegroup-' + d; })
            .merge(linegroups);

        // Draw paths
        var pathData = {
            shadow: geoData,
            casing: geoData,
            stroke: geoData
        };

        var paths = linegroups
            .selectAll('path')
            .data(function(layer) { return pathData[layer]; }, featureKey);

        // exit
        paths.exit()
            .remove();

        // enter/update
        paths = paths.enter()
            .append('path')
            .attr('class', function(d) {
                var linegroup = this.parentNode.__data__;
                return 'pathdata line ' + linegroup + ' ' + featureClasses(d);
            })
            .merge(paths)
            .attr('d', function(d) {
                return getPath(d);
            });


        // Draw first, last vertex layers
        var vertexgroups = layer
            .selectAll('g.vertexgroup')
            .data(['first', 'last']);

        vertexgroups = vertexgroups.enter()
            .append('g')
            .attr('class', function(d) { return 'vertexgroup vertexgroup-' + d; })
            .merge(vertexgroups);

        // Draw groups
        var vertexData = {
            first: geoData,
            last: geoData
        };

        var groups = vertexgroups
            .selectAll('g.vertex')
            .data(function(layer) { return vertexData[layer]; }, featureKey);

        // exit
        groups.exit()
            .remove();

        // enter
        var enter = groups.enter()
            .append('g')
            .attr('class', function(d) {
                var vertexgroup = this.parentNode.__data__;
                return 'node vertex ' + vertexgroup + ' ' + featureClasses(d);
            });

        enter
            .append('circle')
            .attr('class', 'stroke');

        enter
            .append('circle')
            .attr('class', 'fill');

        // update
        var zoom = geoScaleToZoom(projection.scale());
        var radiusIdx = (zoom < 17 ? 0 : zoom < 18 ? 1 : 2);
        groups = groups
            .merge(enter)
            .attr('transform', function(d) {
                var vertexgroup = this.parentNode.__data__;
                var nodeIdx = vertexgroup === 'first' ? 0 : d.nodes.length - 1;
                return getTransform(roadsGraph.entities[d.nodes[nodeIdx]]);
            })
            .call(function(selection) {
                ['stroke', 'fill'].forEach(function(cls) {
                    selection.selectAll('.' + cls)
                        .attr('r', radii[cls][radiusIdx]);
                });
            });
    }


    drawData.enabled = function(val) {
        if (!arguments.length) return _enabled;

        _enabled = val;
        if (_enabled) {
            showLayer();
        } else {
            hideLayer();
        }

        dispatch.call('change');
        return this;
    };


    init();
    return drawData;
}
