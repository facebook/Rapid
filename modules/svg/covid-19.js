import _throttle from 'lodash-es/throttle';
import { svgPath } from './helpers';
import { geoBounds as d3_geoBounds, geoPath as d3_geoPath } from 'd3-geo';
import { text as d3_text } from 'd3-fetch';
import { utilDetect } from '../util/detect';
import { geoExtent, geoPolygonIntersectsPolygon } from '../geo';

import stringify from 'fast-json-stable-stringify';
import toGeoJSON from '@mapbox/togeojson';
import { utilArrayFlatten, utilArrayUnion, utilHashcode } from '../util';
import { event as d3_event, select as d3_select } from 'd3-selection';

var radii = {
    //       z16-, z17,  z18+
    stroke: [3.5,  4,    4.5],
    fill:   [2,    2,    2.5]
};
var _enabled = false;
var _initialized = false;
var _actioned;
var _geojson;

export function svgCovid19Data(projection, context, dispatch) {
    var throttledRedraw = _throttle(function () { dispatch.call('change'); }, 1000);
    var _showLabels = true;
    var detected = utilDetect();
    var layer = d3_select(null);
    var _fileList;
    var _template;
    var _src;

    function init() {
        if (_initialized) return;  // run once
        var _geojson = {}; 
        _enabled = true;
        _actioned = new Set();

        function over() {
            d3_event.stopPropagation();
            d3_event.preventDefault();
            d3_event.dataTransfer.dropEffect = 'copy';
        }

        d3_select('body')
            .attr('dropzone', 'copy')
            .on('drop.svgData', function() {
                d3_event.stopPropagation();
                d3_event.preventDefault();
                if (!detected.filedrop) return;
                drawData.fileList(d3_event.dataTransfer.files);
            })
            .on('dragenter.svgData', over)
            .on('dragexit.svgData', over)
            .on('dragover.svgData', over);

        _initialized = true;
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


    // ensure that all geojson features in a collection have IDs
    function ensureIDs(gj) {
        if (!gj) return null;

        if (gj.type === 'FeatureCollection') {
            for (var i = 0; i < gj.features.length; i++) {
                ensureFeatureID(gj.features[i]);
            }
        } else {
            ensureFeatureID(gj);
        }
        return gj;
    }

    // ensure that each single Feature object has a unique ID
    function ensureFeatureID(feature) {
        if (!feature) return;
        feature.__featurehash__ = utilHashcode(stringify(feature));
        return feature;
    }



    function isPolygon(d) {
        return d.geometry.type === 'Polygon' || d.geometry.type === 'MultiPolygon';
    }


    function clipPathID(d) {
        return 'data-' + d.__featurehash__ + '-clippath';
    }


    function featureClasses(d) {
        return [
            'data' + d.__fbid__,
            'covid-19-tracepoint',
            d.geometry.type,
        ].filter(Boolean).join(' ');
    }

    // Prefer an array of Features instead of a FeatureCollection
    function getFeatures(gj) {
        if (!gj) return [];

        if (gj.type === 'FeatureCollection') {
            return gj.features;
        } else {
            return [gj];
        }
    }

    function featureKey(d) {
        return d.__featurehash__;
    }

    
    function drawData(selection) {
       
        var getPath = svgPath(projection).geojson;
        var getAreaPath = svgPath(projection, null, true).geojson;
        var hasData = drawData.hasData();

        layer = selection.selectAll('.layer-mapdata')
            .data(_enabled && hasData ? [0] : []);

        layer.exit()
            .remove();

        layer = layer.enter()
            .append('g')
            .attr('class', 'layer-mapdata')
            .merge(layer);

        var surface = context.surface();
        if (!surface || surface.empty()) return;  // not ready to draw yet, starting up


        // Gather data
        var geoData, polygonData;
        geoData = getFeatures(_geojson);
        geoData = geoData.filter(getPath);
        polygonData = geoData.filter(isPolygon);


        // Draw clip paths for polygons
        var clipPaths = surface.selectAll('defs').selectAll('.clipPath-data')
           .data(polygonData, featureKey);

        clipPaths.exit()
           .remove();

        var clipPathsEnter = clipPaths.enter()
           .append('clipPath')
           .attr('class', 'clipPath-data')
           .attr('id', clipPathID);

        clipPathsEnter
           .append('path');

        clipPaths.merge(clipPathsEnter)
           .selectAll('path')
           .attr('d', getAreaPath);


        // Draw fill, shadow, stroke layers
        var datagroups = layer
            .selectAll('g.datagroup')
            .data(['fill', 'shadow', 'stroke']);

        datagroups = datagroups.enter()
            .append('g')
            .attr('class', function(d) { return 'datagroup datagroup-' + d; })
            .merge(datagroups);


        // Draw paths
        var pathData = {
            fill: polygonData,
            shadow: geoData,
            stroke: geoData
        };

        var paths = datagroups
            .selectAll('path')
            .data(function(layer) { return pathData[layer]; }, featureKey);

        // exit
        paths.exit()
            .remove();

        // enter/update
        paths = paths.enter()
            .append('path')
            .attr('class', function(d) {
                var datagroup = this.parentNode.__data__;
                return 'pathdata ' + datagroup + ' ' + featureClasses(d);
            })
            .attr('clip-path', function(d) {
                var datagroup = this.parentNode.__data__;
                return datagroup === 'fill' ? ('url(#' + clipPathID(d) + ')') : null;
            })
            .merge(paths)
            .attr('d', function(d) {
                var datagroup = this.parentNode.__data__;
                return datagroup === 'fill' ? getAreaPath(d) : getPath(d);
            });


        // Draw labels
        layer
            .call(drawLabels, 'label-halo', geoData)
            .call(drawLabels, 'label', geoData);


        function drawLabels(selection, textClass, data) {
            var labelPath = d3_geoPath(projection);
            var labelData = data.filter(function(d) {
                return _showLabels && d.properties && (d.properties.desc || d.properties.name);
            });

            var labels = selection.selectAll('text.' + textClass)
                .data(labelData, featureKey);

            // exit
            labels.exit()
                .remove();

            // enter/update
            labels = labels.enter()
                .append('text')
                .attr('class', function(d) { return textClass + ' ' + featureClasses(d); })
                .merge(labels)
                .text(function(d) {
                    return d.properties.desc || d.properties.name;
                })
                .attr('x', function(d) {
                    var centroid = labelPath.centroid(d);
                    return centroid[0] + 11;
                })
                .attr('y', function(d) {
                    var centroid = labelPath.centroid(d);
                    return centroid[1];
                });
        }
    }

    drawData.showAll = function() {
        return _enabled;
    };

    function getExtension(fileName) {
        if (!fileName) return;

        var re = /\.(gpx|kml|spjson|(geo)?json)$/i;
        var match = fileName.toLowerCase().match(re);
        return match && match.length && match[0];
    }


    function xmlToDom(textdata) {
        return (new DOMParser()).parseFromString(textdata, 'text/xml');
    }

    //  [ { “time”: 12345, “lat”: 1.2345, “lon”: 34.432 } … ]
    function spJsonToGeoJSON(spJson) {
        var gj = {
            type: 'FeatureCollection',
            features: []
        };
        for (var i = 0; i < spJson.length; i++) {
            var point = spJson[i];
            gj.features = gj.features.concat({
                'type': 'Feature',
                'geometry': {
                    'type': 'Point',
                    'coordinates': [point.lon, point.lat]
                },
                'properties': {
                    'time': point.time
                }
            });
        }
        return gj;
    }
    drawData.setFile = function(extension, data) {
        _template = null;
        _fileList = null;
        _geojson = null;
        _src = null;

        var gj;
        switch (extension) {
            case '.gpx':
                gj = toGeoJSON.gpx(xmlToDom(data));
                break;
            case '.kml':
                gj = toGeoJSON.kml(xmlToDom(data));
                break;
            case '.geojson':
            case '.json':
                gj = JSON.parse(data);
                break;
            case '.spjson':
                gj = spJsonToGeoJSON(JSON.parse(data));
                break;
        }

        gj = gj || {};
        if (Object.keys(gj).length) {
            _geojson = ensureIDs(gj);
            _src = extension + ' data file';
            this.fitZoom();
        }

        dispatch.call('change');
        return this;
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
        return this;
    };


    drawData.hasData = function() {
        var gj = _geojson || {};
        return !!(_template || Object.keys(gj).length);
    };

    
    drawData.template = function(val, src) {
        if (!arguments.length) return _template;

        // test source against OSM imagery blacklists..
        var osm = context.connection();
        if (osm) {
            var blacklists = osm.imageryBlacklists();
            var fail = false;
            var tested = 0;
            var regex;

            for (var i = 0; i < blacklists.length; i++) {
                try {
                    regex = new RegExp(blacklists[i]);
                    fail = regex.test(val);
                    tested++;
                    if (fail) break;
                } catch (e) {
                    /* noop */
                }
            }

            // ensure at least one test was run.
            if (!tested) {
                regex = new RegExp('.*\.google(apis)?\..*/(vt|kh)[\?/].*([xyz]=.*){3}.*');
                fail = regex.test(val);
            }
        }

        _template = val;
        _fileList = null;
        _geojson = null;

        // strip off the querystring/hash from the template,
        // it often includes the access token
        _src = src || ('vectortile:' + val.split(/[?#]/)[0]);

        dispatch.call('change');
        return this;
    };

    
    drawData.geojson = function(gj, src) {
        if (!arguments.length) return _geojson;

        _template = null;
        _fileList = null;
        _geojson = null;
        _src = null;

        gj = gj || {};
        if (Object.keys(gj).length) {
            _geojson = ensureIDs(gj);
            _src = src || 'unknown.geojson';
        }

        dispatch.call('change');
        return this;
    };

    
    drawData.fileList = function(fileList) {
        if (!arguments.length) return _fileList;

        _template = null;
        _fileList = fileList;
        _geojson = null;
        _src = null;

        if (!fileList || !fileList.length) return this;
        var f = fileList[0];
        var extension = getExtension(f.name);
        var reader = new FileReader();
        reader.onload = (function() {
            return function(e) {
                drawData.setFile(extension, e.target.result);
            };
        })(f);

        reader.readAsText(f);

        return this;
    };


    drawData.url = function(url, defaultExtension) {
        _template = null;
        _fileList = null;
        _geojson = null;
        _src = null;

        // strip off any querystring/hash from the url before checking extension
        var testUrl = url.split(/[?#]/)[0];
        var extension = getExtension(testUrl) || defaultExtension;
        if (extension) {
            _template = null;
            d3_text(url)
                .then(function(data) {
                    drawData.setFile(extension, data);
                    var isTaskBoundsUrl = extension === '.gpx' && url.indexOf('project') > 0 && url.indexOf('task') > 0;
                    if (isTaskBoundsUrl) {
                        context.rapidContext().setTaskExtentByGpxData(data);
                    }
                })
                .catch(function() {
                    /* ignore */
                });
        } else {
            drawData.template(url);
        }

        return this;
    };


    drawData.getSrc = function() {
        return _src || '';
    };


    drawData.fitZoom = function() {
        var features = getFeatures(_geojson);
        if (!features.length) return;

        var map = context.map();
        var viewport = map.trimmedExtent().polygon();
        var coords = features.reduce(function(coords, feature) {
            var c = feature.geometry.coordinates;

            /* eslint-disable no-fallthrough */
            switch (feature.geometry.type) {
                case 'Point':
                    c = [c];
                case 'MultiPoint':
                case 'LineString':
                    break;

                case 'MultiPolygon':
                    c = utilArrayFlatten(c);
                case 'Polygon':
                case 'MultiLineString':
                    c = utilArrayFlatten(c);
                    break;
            }
            /* eslint-enable no-fallthrough */

            return utilArrayUnion(coords, c);
        }, []);

        if (!geoPolygonIntersectsPolygon(viewport, coords, true)) {
            var extent = geoExtent(d3_geoBounds({ type: 'LineString', coordinates: coords }));
            map.centerZoom(extent.center(), map.trimmedExtentZoom(extent));
        }

        return this;
    };


    init();
    return drawData;
}
