import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';
import { utilArrayDifference } from '@id-sdk/util';

import { pixiOsm } from './osm';
import { pixiRapidFeatures } from './pixiRapidFeatures';
import { utilRebind } from '../util';
import { utilGetDimensions, utilSetDimensions } from '../util/dimensions';
import * as PIXI from 'pixi.js';
import { pixiNotes, pixiMapillaryImages, pixiStreetsideImages,  pixiKartaImages, pixiMapillaryMapFeatures, pixiMapillarySigns, pixiKeepRight, pixiImproveOSM, pixiOsmose} from './index';

export function pixiLayers(context, projection, featureCache) {
    var dispatch = d3_dispatch('change');
    var svg = d3_select(null);
    var _layers = [
        { id: 'rapid', layer: pixiRapidFeatures(context, featureCache, dispatch)},
        { id: 'osm', layer: pixiOsm(projection, context, dispatch) },
        { id: 'notes', layer: pixiNotes(context, featureCache, dispatch)},
        { id: 'mapillary', layer: pixiMapillaryImages(context, featureCache, dispatch)},
        { id: 'streetside', layer: pixiStreetsideImages(context, featureCache, dispatch)},
        { id: 'openstreetcam', layer: pixiKartaImages(context, featureCache, dispatch) },
        { id: 'mapillary-map-features',  layer: pixiMapillaryMapFeatures(context, featureCache, dispatch) },
        { id: 'mapillary-signs',  layer: pixiMapillarySigns(context, featureCache, dispatch) },
        { id: 'keepRight', layer: pixiKeepRight(context, featureCache, dispatch) },
        { id: 'improveOSM', layer: pixiImproveOSM(context, featureCache, dispatch)  },
        { id: 'osmose', layer: pixiOsmose(context, featureCache, dispatch)  },
    ];

    let _initialized = false;
    function getLayerPixiContainer(layer) {
        return context.pixi.stage.getChildByName(layer.id);
    }

    function drawLayers(selection) {

        if (!_initialized) {
            _initialized = true;
            _layers.forEach(layer => {
                if (layer.id === 'osm') return;
                const newLayerContainer = new PIXI.Container();
                newLayerContainer.name = layer.id;
                context.pixi.stage.addChild(newLayerContainer);
            });
        }

        _layers.forEach(layerEntry => {
            if (layerEntry.id === 'osm') return;
            layerEntry.layer(getLayerPixiContainer(layerEntry), projection);
        });
    }


    drawLayers.all = function() {
        return _layers;
    };


    drawLayers.layer = function(id) {
        var obj = _layers.find(function(o) { return o.id === id; });
        return obj && obj.layer;
    };


    drawLayers.only = function(what) {
        var arr = [].concat(what);
        var all = _layers.map(function(layer) { return layer.id; });
        return drawLayers.remove(utilArrayDifference(all, arr));
    };


    drawLayers.remove = function(what) {
        var arr = [].concat(what);
        arr.forEach(function(id) {
            _layers = _layers.filter(function(o) { return o.id !== id; });
        });
        dispatch.call('change');
        return this;
    };


    drawLayers.add = function(what) {
        var arr = [].concat(what);
        arr.forEach(function(obj) {
            if ('id' in obj && 'layer' in obj) {
                _layers.push(obj);
            }
        });
        dispatch.call('change');
        return this;
    };


    drawLayers.dimensions = function(val) {
        if (!arguments.length) return utilGetDimensions(svg);
        utilSetDimensions(svg, val);
        return this;
    };


    return utilRebind(drawLayers, dispatch, 'on');
}
