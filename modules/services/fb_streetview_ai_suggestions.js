import _forEach from 'lodash-es/forEach';

import { dispatch as d3_dispatch } from 'd3-dispatch';
import { xml as d3_xml } from 'd3-fetch';

import { coreGraph, coreTree } from '../core';
import { osmEntity, osmNode, osmWay, osmRelation } from '../osm';
import { utilRebind, utilStringQs, utilTiler } from '../util';

// TODO: extract common logic shared with fb_ai_features.js into util files.

// constants
var APIROOT = 'https://www.mapwith.ai/maps/ml_roads';
var TILEZOOM = 16;
var tiler = utilTiler().zoomExtent([TILEZOOM, TILEZOOM]);
var dispatch = d3_dispatch('loadedData');

var _datasets = {};
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
        result_type: 'extended_osc',
        conflate_with_osm: isConflated,
        theme: 'streetview_ai_suggestion',
        collaborator: 'rapid',
        token: 'ASbYX8wITNCWnU1XMF1V-d2_iRiBMKmW2nT85IhjS4TOQXie-YJMCOGppe-DiCxUSfQ4hG4MDxyfXIprF5YO3QNR',
        hash: 'ASaPD6M5i29Nf8jGGb0',
        ext: 1918681607
    };

    if (datasetID === 'fbSidewalks') {
        qs.sources = 'fb_sidewalk';
    }

    qs.bbox = extent.toParam();

    if (taskExtent) qs.crop_bbox = taskExtent.toParam();

    // Note: `fb_ml_road_url` and `fb_ml_road_tags` query params are mostly used for debug purposes.
    var customUrlRoot = utilStringQs(window.location.hash).fb_ml_road_url;
    var customRoadTags = utilStringQs(window.location.hash).fb_ml_road_tags;

    var urlRoot = customUrlRoot || APIROOT;
    var url = urlRoot + '?' + utilQsString(qs, true);  // true = noencode

    if (customRoadTags) {
      customRoadTags.split(',').forEach(function (tag) {
        url += '&allow_tags[]=' + tag;
      });
    }

    return url;


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
        var k = (attrs.k.value || '').trim();
        var v = (attrs.v.value || '').trim();
        if (k && v) {
            tags[k] = v;
        }
    }

    return tags;
}


function getVisible(attrs) {
    return (!attrs.visible || attrs.visible.value !== 'false');
}


function getMembers(obj) {
    var elems = obj.getElementsByTagName('member');
    var members = new Array(elems.length);
    for (var i = 0, l = elems.length; i < l; i++) {
        var attrs = elems[i].attributes;
        members[i] = {
            id: attrs.type.value[0] + attrs.ref.value,
            type: attrs.type.value,
            role: attrs.role.value
        };
    }
    return members;
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
            suggestionId: obj.getAttribute("suggestion-id"),
            visible: getVisible(attrs),
            tags: getTags(obj),
            nodes: getNodes(obj),
        });
    },

    relation: function relationData(obj, uid) {
        var attrs = obj.attributes;
        return new osmRelation({
            id: uid,
            suggestionId: obj.getAttribute("suggestion-id"),
            visible: getVisible(attrs),
            tags: getTags(obj),
            members: getMembers(obj)
        });
    },
};


// parse <osm-road> element inside <sidewalk-suggestion>
function parseOsmRoadMeta(xmlEle) {
    var osmRoadMeta = {};
    osmRoadMeta.wid = osmEntity.id.fromOSM("way", xmlEle.getAttribute("way-id"));
    osmRoadMeta.version = xmlEle.getAttribute("version");
    osmRoadMeta.sidewalk_tag = xmlEle.getAttribute("sidewalk-tag");

    var nodeEles = xmlEle.getElementsByTagName("nd");
    var nodes = new Array(nodeEles.length);
    for (var i = 0; i < nodeEles.length; i++) {
        var n = nodeEles[i];
        nodes[i] = {
            nid: osmEntity.id.fromOSM("node", n.getAttribute("ref")),
            version: n.getAttribute("version"),
            lat: parseFloat(n.getAttribute("lat")),
            lon: parseFloat(n.getAttribute("lon"))
        };
    }
    osmRoadMeta.nodes = nodes;
    return osmRoadMeta;
}


// parse <steet-view-image-set> element inside <sidewalk-suggestion>
function parseStreetViewImageSet(xmlEle) {
    var streetViewImageSet = {};
    streetViewImageSet.id = xmlEle.getAttribute("id");
    streetViewImageSet.cameraPointingDirection = xmlEle.getAttribute("camera-pointing-direction");
    streetViewImageSet.relativeSideToRoad = xmlEle.getAttribute("relative-side-to-road");

    var imageEles = xmlEle.getElementsByTagName("street-view-image");
    var images = new Array(imageEles.length);
    for (var i = 0; i < imageEles.length; i++) {
        var img = imageEles[i];
        images[i] = {
            key: img.getAttribute("key"),
            url: img.getAttribute("url"),
            sidewalkSide: img.getAttribute("sidewalk-side"),
            lat: parseFloat(img.getAttribute("lat")),
            lon: parseFloat(img.getAttribute('lon')),
            ca: parseFloat(img.getAttribute('ca'))
        };
    }
    streetViewImageSet.images = images;
    return streetViewImageSet;
}

function parseCrosswalkSuggestion(xmlEle, cubitorContext) {
    console.log('Inside crosswalk parser');
    var id = xmlEle.getAttribute("id");
    // TODO: respect new data in both <create> entities and <cubitor-context> later.
    if (cubitorContext[id]) return;

    var suggestion = {id: id};

    // we'll support other feature types like crosswalk and speed limit in the future
    suggestion.featureType = "crosswalk";

    // whether it's suggestion for geometry or tag change
    suggestion.suggestionType = xmlEle.getAttribute("type");

    xmlEle.childNodes.forEach(function (ele) {
        if (ele.nodeName === "osm-road") {
            suggestion.osmRoadMeta = parseOsmRoadMeta(ele);
        } else if (ele.nodeName === "street-view-image-set") {
            suggestion.streetViewImageSet = parseStreetViewImageSet(ele);
        }
    });
    cubitorContext[suggestion.id] = suggestion;
}


// parse <sidewalk-suggestion>
function parseSidewalkSuggestion(xmlEle, cubitorContext) {
    var id = xmlEle.getAttribute("id");
    // TODO: respect new data in both <create> entities and <cubitor-context> later.
    if (cubitorContext[id]) return;

    var suggestion = {id: id};

    // we'll support other feature types like crosswalk and speed limit in the future
    suggestion.featureType = "sidewalk";

    // whether it's suggestion for geometry or tag change
    suggestion.suggestionType = xmlEle.getAttribute("type");

    xmlEle.childNodes.forEach(function (ele) {
        if (ele.nodeName === "osm-road") {
            suggestion.osmRoadMeta = parseOsmRoadMeta(ele);
        } else if (ele.nodeName === "street-view-image-set") {
            suggestion.streetViewImageSet = parseStreetViewImageSet(ele);
        }
    });
    cubitorContext[suggestion.id] = suggestion;
}


var cubitorParsers = {
    "sidewalk-suggestion": parseSidewalkSuggestion,
    "crosswalk-suggestion": parseCrosswalkSuggestion
};


/** Example XML elements:
<osmChange version="0.6" generator="cubitor sidewalk suggestion generator">
    <create>
        <node id="-1" version="1" lat="42.3619829" lon="-71.1304393"/>
        ...
        <way id="-1001" version="1" suggestion-id="-10001">
            <nd ref="-1"/>
            ...
            <tag k="highway" v="footway"/>
            <tag k="footway" v="sidewalk"/>
        </way>
        <way id="-1002" version="1" suggestion-id="-10001">
            <nd ref="-21"/>
            ...
            <tag k="highway" v="footway"/>
            <tag k="footway" v="sidewalk"/>
        </way>
        <relation id="-1003" contain-new-sidewalk="true" suggestion-id="-10001">
            <tag k="type" v="street"/>
            <member type="way" id="563498857" role="road"/>
            <member type="way" id="-1001" role="sidewalk" side="left"/>
            <member type="way" id="-1002" role="sidewalk" side="right"/>
        </relation>
    </create>
    <cubitor-context>
        <sidewalk-suggestion id="-10001" type="geometry">
            <osm-road way-id="563498857" version="6" sidewalk-tag="both">
                <nd ref="2667690924" version="4" lat="42.3619829" lon="-71.1304093"/>
                ...
            </osm-road>
        </sidewalk-suggestion>
        <sidewalk-suggestion id="-10002" type="geometry">
            <osm-road way-id="426454632" version="2" sidewalk-tag="no">
                <nd ref="4257761648" version="1" lat="42.3064665" lon="-71.0845224"/>
                ...
            </osm-road>
            <steet-view-image-set id="-11001" camera-pointing-direction="same-as-road-nodes" relative-side-to-road="right">
                <steet-view-image key="ejYlvv3qya2qcFO0jI3YEg" url="..." sidewalk-side="right" lat="42.3063907" lon="-71.0845143"/>
                ...
            </steet-view-image-set>
        </sidewalk-suggestion>
    </cubitor-context>
</osmChange>

See a full XML example at
https://www.mapwith.ai/maps/ml_roads?bbox=100.437011719%2C13.9086914062%2C100.458984375%2C13.9306640625
&result_type=extended_osc&sources=fb_sidewalk&theme=streetview_ai_suggestion&collaborator=rapid
&token=ASbYX8wITNCWnU1XMF1V-d2_iRiBMKmW2nT85IhjS4TOQXie-YJMCOGppe-DiCxUSfQ4hG4MDxyfXIprF5YO3QNR&ext=1918681607
&hash=ASaPD6M5i29Nf8jGGb0
 */
function parseXML(dataset, xml, callback, options) {
    options = Object.assign({ skipSeen: true }, options);
    if (!xml || !xml.childNodes) {
        return callback({ message: 'No XML', status: -1 });
    }

    var cache = dataset.cache;
    var cubitorContext = dataset.cubitorContext;

    var root = xml.childNodes[0];
    var topLevelChildren = root.childNodes;  // <create> or <cubitor-context>
    var handle = window.requestIdleCallback(function() {
        _deferredAiFeaturesParsing.delete(handle);
        var osmEntities = [];
        for (var i = 0; i < topLevelChildren.length; i++) {
            var tlc = topLevelChildren[i];
            if (tlc.nodeName === "create") {
                var children = tlc.childNodes;
                for (var j = 0; j < children.length; j++) {
                    var entity = parseChild(children[j]);
                    if (entity) osmEntities.push(entity);
                }
            } else if (tlc.nodeName === "cubitor-context") {
                var children = tlc.childNodes;
                for (var j = 0; j < children.length; j++) {
                    var ele = children[j];
                    parseCubitorContextChild(ele, cubitorContext);
                }
            }
        }

        // associate suggestion context with osm entities
        osmEntities.forEach(entity => {
            if(entity.suggestionId && cubitorContext[entity.suggestionId]) {
                entity.suggestionContext = cubitorContext[entity.suggestionId];
            }
        });
        callback(null, osmEntities);
    });


    function parseChild(child) {
        var parser = parsers[child.nodeName];
        if (!parser) return null;

        var uid = osmEntity.id.fromOSM(child.nodeName, child.attributes.id.value);
        if (options.skipSeen) {
            if (cache.seen[uid]) return null;  // avoid reparsing a "seen" entity
            cache.seen[uid] = true;
        }

        var entity = parser(child, uid);
        var meta = {
            __fbid__: child.attributes.id.value,
            __origid__: undefined,
            __service__: 'fbml_streetview',
            __datasetid__: dataset.id
        };
        return Object.assign(entity, meta);
    }


    function parseCubitorContextChild(child, cubitorContext) {
        var parser = cubitorParsers[child.nodeName];
        if (!parser) return;

        parser(child, cubitorContext);
    }
}


export default {

    init: function() {
        this.event = utilRebind(this, dispatch, 'on');
    },

    reset: function() {
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
            ds.cubitorContext = {};
            ds.cache = { inflight: {}, loaded: {}, seen: {}};
        });

        return this;
    },


    graph: function (datasetID) {
        var ds = _datasets[datasetID];
        return ds && ds.graph;
    },


    cubitorContext: function (datasetID) {
        var ds = _datasets[datasetID];
        return ds && ds.cubitorContext;
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
            cubitorContext = {};
            cache = { inflight: {}, loaded: {}, seen: {}};
            ds = { id: datasetID, graph: graph, tree: tree, cubitorContext: cubitorContext, cache: cache };
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
            // At this stage (prototype development for sidewalk workflow), backend returns the
            // same dummy result for every tile, so as long as cache has anything loaded or inflight,
            // we can just return to avoid reloading the same data repeatedly.
            // TODO: change early return logic once backend starts to return real results.
            // if (cache.loaded[tile.id] || cache.inflight[tile.id]) return;
            if (Object.keys(cache.loaded).length > 0 || Object.keys(cache.inflight).length > 0) return;

            var controller = new AbortController();
            d3_xml(tileURL(ds, tile.extent, taskExtent), { signal: controller.signal })
                .then(function (dom) {
                    delete cache.inflight[tile.id];
                    if (!dom) return;
                    parseXML(ds, dom, function(err, results) {
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
