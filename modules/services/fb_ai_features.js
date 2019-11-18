import _forEach from 'lodash-es/forEach';

import { dispatch as d3_dispatch } from 'd3-dispatch';
import { xml as d3_xml } from 'd3-fetch';

import { coreGraph, coreTree } from '../core';
import { osmEntity, osmNode, osmWay } from '../osm';
import { utilRebind, utilStringQs, utilTiler } from '../util';

// constants
var API_URL = 'https://www.facebook.com/maps/ml_roads?conflate_with_osm=true&theme=ml_road_vector&collaborator=fbid&token=ASZUVdYpCkd3M6ZrzjXdQzHulqRMnxdlkeBJWEKOeTUoY_Gwm9fuEd2YObLrClgDB_xfavizBsh0oDfTWTF7Zb4C&hash=ASYM8LPNy8k1XoJiI7A&result_type=road_building_vector_xml';
var TILEZOOM = 16;
var tiler = utilTiler().zoomExtent([TILEZOOM, TILEZOOM]);
var dispatch = d3_dispatch('loadedData');

var _checkpoints = {};
var _graph;
var _tileCache;
var _tree;
var _deferredAiFeaturesParsing = new Set();

var _off;

function abortRequest(i) {
    i.abort();
}


function apiURL(extent, taskExtent) {
    // fb_ml_road_url: if set, get road data from this url
    var fb_ml_road_url = utilStringQs(window.location.hash).fb_ml_road_url;
    var result = (fb_ml_road_url ? fb_ml_road_url : API_URL) + '&bbox=' + extent.toParam();
    if (taskExtent) result += '&crop_bbox=' + taskExtent.toParam();

    var custom_ml_road_tags = utilStringQs(window.location.hash).fb_ml_road_tags;
    if (custom_ml_road_tags) {
      custom_ml_road_tags.split(',').forEach(function (tag) {
        result += '&allow_tags[]=' + tag;
      });
    }
    return result;
}


function getLoc(attrs) {
    var lon = attrs.lon && attrs.lon.value;
    var lat = attrs.lat && attrs.lat.value;
    return [parseFloat(lon), parseFloat(lat)];
}


function getNodes(obj) {
    var elems = obj.getElementsByTagName('nd');
    var nodes = new Array(elems.length);
    for (var i = 0, l = elems.length; i < l; i++) {
        nodes[i] = 'n' + elems[i].attributes.ref.value;
    }
    return nodes;
}


function getTags(obj) {
    var elems = obj.getElementsByTagName('tag');
    var tags = {};
    for (var i = 0, l = elems.length; i < l; i++) {
        var attrs = elems[i].attributes;
        tags[attrs.k.value] = attrs.v.value;
    }

    return tags;
}


function getVisible(attrs) {
    return (!attrs.visible || attrs.visible.value !== 'false');
}


var parsers = {
    node: function nodeData(obj, uid) {
        var attrs = obj.attributes;
        return new osmNode({
            id: uid,
            visible: getVisible(attrs),
            loc: getLoc(attrs),
            tags: getTags(obj)
        });
    },

    way: function wayData(obj, uid) {
        var attrs = obj.attributes;
        return new osmWay({
            id: uid,
            visible: getVisible(attrs),
            tags: getTags(obj),
            nodes: getNodes(obj),
        });
    }
};


function parseXML(xml, tile, callback, options) {
    options = Object.assign({ skipSeen: true }, options);
    if (!xml || !xml.childNodes) {
        return callback({ message: 'No XML', status: -1 });
    }

    var root = xml.childNodes[0];
    var children = root.childNodes;
    var handle = window.requestIdleCallback(function() {
        _deferredAiFeaturesParsing.delete(handle);
        var results = [];
        for (var i = 0; i < children.length; i++) {
            var result = parseChild(children[i]);
            if (result) results.push(result);
        }
        callback(null, results);
    });
    _deferredAiFeaturesParsing.add(handle);


    function parseChild(child) {
        var parser = parsers[child.nodeName];
        if (!parser) return null;

        var uid = osmEntity.id.fromOSM(child.nodeName, child.attributes.id.value);
        if (options.skipSeen) {
            if (_tileCache.seen[uid]) return null;  // avoid reparsing a "seen" entity
            if (_tileCache.origIdTile[uid]) return null;  // avoid double-parsing a split way
            _tileCache.seen[uid] = true;
        }

        // Handle non-deterministic way splitting from Roads Service. Splits
        // are consistent within a single request.
        var origUid;
        if (child.attributes.orig_id) {
            origUid = osmEntity.id.fromOSM(child.nodeName, child.attributes.orig_id.value);
            if (_graph.entities[origUid] ||
                (_tileCache.origIdTile[origUid] && _tileCache.origIdTile[origUid] !== tile.id)) {
                return null;
            }
            _tileCache.origIdTile[origUid] = tile.id;
        }

        var entity = parser(child, uid);
        entity.__fbid__ = child.attributes.id.value;
        entity.__origid__ = origUid;
        return entity;
    }
}


export default {

    init: function() {
        if (!_tileCache) {
            this.reset();
        }

        this.event = utilRebind(this, dispatch, 'on');
    },

    // save the current history state
    checkpoint: function(key) {
        _checkpoints[key] = {
            graph: _graph,
        };
        return this;
    },

    reset: function(key) {
        Array.from(_deferredAiFeaturesParsing).forEach(function(handle) {
            window.cancelIdleCallback(handle);
            _deferredAiFeaturesParsing.delete(handle);
        });
        if (_tileCache && _tileCache.inflight) {
            _forEach(_tileCache.inflight, abortRequest);
        }
        if (key !== undefined && _checkpoints.hasOwnProperty(key)) {
            _graph = _checkpoints[key].graph;
        }
        else {
            _graph = coreGraph();
            _tree = coreTree(_graph);
            _tileCache = { inflight: {}, loaded: {}, seen: {}, origIdTile: {} };
        }

        return this;
    },


    graph: function() {
        return _graph;
    },


    intersects: function(extent) {
        if (!_tileCache) return [];
        return _tree.intersects(extent, _graph);
    },


    merge: function(entities) {
        _graph.rebase(entities, [_graph], false);
        _tree.rebase(entities, false);
    },


    cache: function (obj) {
        function cloneDeep(source) {
            return JSON.parse(JSON.stringify(source));
        }

        if (!arguments.length) {
            return {
                tile: cloneDeep(_tileCache)
            };
        }

        // access cache directly for testing
        if (obj === 'get') {
            return _tileCache;
        }

        _tileCache = obj;
    },


    toggle: function(val) {
        _off = !val;
        return this;
    },


    loadTiles: function(projection, taskExtent) {
        if (_off) return;

        var tiles = tiler.getTiles(projection);

        // abort inflight requests that are no longer needed
        _forEach(_tileCache.inflight, function(v, k) {
            var wanted = tiles.find(function(tile) { return k === tile.id; });
            if (!wanted) {
                abortRequest(v);
                delete _tileCache.inflight[k];
            }
        });

        tiles.forEach(function(tile) {
            if (_tileCache.loaded[tile.id] || _tileCache.inflight[tile.id]) return;

            var controller = new AbortController();
            d3_xml(apiURL(tile.extent, taskExtent), {signal: controller.signal})
                .then(function (dom) {
                    delete _tileCache.inflight[tile.id];
                    if (!dom) return;
                    parseXML(dom, tile, function(err, results) {
                        if (err) return;
                        _graph.rebase(results, [_graph], true);
                        _tree.rebase(results, true);
                        _tileCache.loaded[tile.id] = true;
                        dispatch.call('loadedData');
                    });
                })
                .catch(function() {});
            _tileCache.inflight[tile.id] = controller;
        });
    }
};
