import _forEach from 'lodash-es/forEach';

import { dispatch as d3_dispatch } from 'd3-dispatch';
import { xml as d3_xml } from 'd3-fetch';

import { coreGraph, coreTree } from '../core';
import { osmEntity, osmNode, osmWay } from '../osm';
import { utilRebind, utilStringQs, utilTiler } from '../util';

// constants
var APIROOT = 'https://mapwith.ai/maps/ml_roads';
var TILEZOOM = 16;
var tiler = utilTiler().zoomExtent([TILEZOOM, TILEZOOM]);
var dispatch = d3_dispatch('loadedData');

var _datasets = {};
var _checkpoints = {};
var _deferredAiFeaturesParsing = new Set();
var _off;


function abortRequest(i) {
    i.abort();
}


function tileURL(dataset, extent, taskExtent) {
    // Conflated datasets have a different ID, so they get stored in their own graph/tree
    var isConflated = /-conflated$/.test(dataset.id);
    var datasetID = dataset.id.replace('-conflated', '');

    var qs = {
        conflate_with_osm: isConflated,
        theme: 'ml_road_vector',
        collaborator: 'fbid',
        token: 'ASZUVdYpCkd3M6ZrzjXdQzHulqRMnxdlkeBJWEKOeTUoY_Gwm9fuEd2YObLrClgDB_xfavizBsh0oDfTWTF7Zb4C',
        hash: 'ASYM8LPNy8k1XoJiI7A'
    };

    if (datasetID === 'fbRoads') {
        qs.result_type = 'road_vector_xml';

    } else if (datasetID === 'msBuildings') {
        qs.result_type = 'road_building_vector_xml';
        qs.building_source = 'microsoft';

    } else {
        qs.result_type = 'osm_xml';
        qs.sources = 'esri_building.' + datasetID;
    }

    // fb_ml_road_url: if set, get road data from this url
    // var fb_ml_road_url = utilStringQs(window.location.hash).fb_ml_road_url;

    qs.bbox = extent.toParam();

    // var result = (fb_ml_road_url ? fb_ml_road_url : API_URL) + '&bbox=' + ;
    if (taskExtent) qs.crop_bbox = taskExtent.toParam();

    // TODO: FIX
    // var custom_ml_road_tags = utilStringQs(window.location.hash).fb_ml_road_tags;
    // if (custom_ml_road_tags) {
    //   custom_ml_road_tags.split(',').forEach(function (tag) {
    //     result += '&allow_tags[]=' + tag;
    //   });
    // }

    return APIROOT + '?' + utilQsString(qs, true);  // true = noencode


    // This utilQsString does not sort the keys, because the fbml service needs them to be ordered a certain way.
    function utilQsString(obj, noencode) {
        // encode everything except special characters used in certain hash parameters:
        // "/" in map states, ":", ",", {" and "}" in background
        function softEncode(s) {
            return encodeURIComponent(s).replace(/(%2F|%3A|%2C|%7B|%7D)/g, decodeURIComponent);
        }

        return Object.keys(obj).map(function(key) {  // NO SORT
            return encodeURIComponent(key) + '=' + (
                noencode ? softEncode(obj[key]) : encodeURIComponent(obj[key]));
        }).join('&');
    }

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


function parseXML(dataset, xml, tile, callback, options) {
    options = Object.assign({ skipSeen: true }, options);
    if (!xml || !xml.childNodes) {
        return callback({ message: 'No XML', status: -1 });
    }

    var graph = dataset.graph;
    var cache = dataset.cache;

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
            if (cache.seen[uid]) return null;  // avoid reparsing a "seen" entity
            if (cache.origIdTile[uid]) return null;  // avoid double-parsing a split way
            cache.seen[uid] = true;
        }

        // Handle non-deterministic way splitting from Roads Service. Splits
        // are consistent within a single request.
        var origUid;
        if (child.attributes.orig_id) {
            origUid = osmEntity.id.fromOSM(child.nodeName, child.attributes.orig_id.value);
            if (graph.entities[origUid] ||
                (cache.origIdTile[origUid] && cache.origIdTile[origUid] !== tile.id)) {
                return null;
            }
            cache.origIdTile[origUid] = tile.id;
        }

        var entity = parser(child, uid);
        var meta = {
            __fbid__: child.attributes.id.value,
            __origid__: origUid,
            __service__: 'fbml',
            __datasetid__: dataset.id
        };
        return Object.assign(entity, meta);
    }
}


export default {

    init: function() {
        this.event = utilRebind(this, dispatch, 'on');
    },

    // save the current history state
    checkpoint: function(key) {
//todo: fix
        // _checkpoints[key] = {
        //     graph: _graph,
        // };
        return this;
    },

    reset: function(key) {
        Array.from(_deferredAiFeaturesParsing).forEach(function(handle) {
            window.cancelIdleCallback(handle);
            _deferredAiFeaturesParsing.delete(handle);
        });

        Object.values(_datasets).forEach(function(ds) {
            if (ds.cache.inflight) {
                Object.values(ds.cache.inflight).forEach(abortRequest);
            }
            ds.graph = coreGraph();
            ds.tree = coreTree(ds.graph);
            ds.cache = { inflight: {}, loaded: {}, seen: {}, origIdTile: {} };
        });

//todo: fix
        // if (key !== undefined && _checkpoints.hasOwnProperty(key)) {
        //     _graph = _checkpoints[key].graph;
        // }

        return this;
    },


    graph: function (datasetID) {
        var ds = _datasets[datasetID];
        return ds && ds.graph;
    },


    intersects: function (datasetID, extent) {
        var ds = _datasets[datasetID];
        if (!ds || !ds.tree || !ds.graph) return [];
        return ds.tree.intersects(extent, ds.graph);
    },


    merge: function(datasetID, entities) {
        var ds = _datasets[datasetID];
        if (!ds || !ds.tree || !ds.graph) return;
        ds.graph.rebase(entities, [ds.graph], false);
        ds.tree.rebase(entities, false);
    },


    cache: function (datasetID, obj) {
        var ds = _datasets[datasetID];
        if (!ds || !ds.cache) return;

        function cloneDeep(source) {
            return JSON.parse(JSON.stringify(source));
        }

        if (!arguments.length) {
            return {
                tile: cloneDeep(ds.cache)
            };
        }

        // access cache directly for testing
        if (obj === 'get') {
            return ds.cache;
        }

        ds.cache = obj;
    },


    toggle: function(val) {
        _off = !val;
        return this;
    },


    loadTiles: function(datasetID, projection, taskExtent) {
        if (_off) return;

        var ds = _datasets[datasetID];
        var graph, tree, cache;
        if (ds) {
            graph = ds.graph;
            tree = ds.tree;
            cache = ds.cache;
        } else {
            // as tile requests arrive, setup the resources needed to hold the results
            graph = coreGraph();
            tree = coreTree(graph);
            cache = { inflight: {}, loaded: {}, seen: {}, origIdTile: {} };
            ds = { id: datasetID, graph: graph, tree: tree, cache: cache };
            _datasets[datasetID] = ds;
        }


        var tiles = tiler.getTiles(projection);

        // abort inflight requests that are no longer needed
        _forEach(cache.inflight, function(v, k) {
            var wanted = tiles.find(function(tile) { return k === tile.id; });
            if (!wanted) {
                abortRequest(v);
                delete cache.inflight[k];
            }
        });

        tiles.forEach(function(tile) {
            if (cache.loaded[tile.id] || cache.inflight[tile.id]) return;

            var controller = new AbortController();
            d3_xml(tileURL(ds, tile.extent, taskExtent), { signal: controller.signal })
                .then(function (dom) {
                    delete cache.inflight[tile.id];
                    if (!dom) return;
                    parseXML(ds, dom, tile, function(err, results) {
                        if (err) return;
                        graph.rebase(results, [graph], true);
                        tree.rebase(results, true);
                        cache.loaded[tile.id] = true;
                        dispatch.call('loadedData');
                    });
                })
                .catch(function() {});

            cache.inflight[tile.id] = controller;
        });
    }
};
