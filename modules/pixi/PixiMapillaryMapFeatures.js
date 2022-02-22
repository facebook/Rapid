import * as PIXI from 'pixi.js';
import _throttle from 'lodash-es/throttle';

import { select as d3_select } from 'd3-selection';
import { dispatch as d3_dispatch } from 'd3-dispatch';

import { modeBrowse } from '../modes/browse';
import { services } from '../services';
import { getMapillaryIconSpriteHelper } from './helpers';

import _ from 'lodash';


var _mapillaryEnabled = false;
var _osmService;

const mapillary_green = 0x55ff22;

export function PixiMapillaryMapFeatures(context, featureCache, dispatch) {

    if (!dispatch) { dispatch = d3_dispatch('change'); }
    var throttledRedraw = _throttle(function () { dispatch.call('change'); }, 1000);
    const minZoom = 12;
    var _mapillaryVisible = false;
    let _textures = {};
    let _didInitTextures = false;
    let _mapillary;

    function initMapillaryTextures() {
        const circle = new PIXI.Graphics()
            .lineStyle({width: 1, color:0x555555})
            .beginFill(mapillary_green)
            .drawCircle(6, 6, 6)
            .endFill();



        const renderer = context.pixi.renderer;
        const options = { resolution: 2 };
        _textures.circle = renderer.generateTexture(circle, options);
        _didInitTextures = true;
    }


    function getService() {
        if (services.mapillary && !_mapillary) {
            _mapillary = services.mapillary;
            _mapillary.event.on('loadedMapFeatures', throttledRedraw);
        } else if (!services.mapillary && _mapillary) {
            _mapillary = null;
        }

        return _mapillary;
    }



    // Show the mapillary images and their tracks
    function editOn() {
        if (!_mapillaryVisible) {
            _mapillaryVisible = true;
            context.pixi.stage.getChildByName('mapillary-map-features').visible = true;
        }
    }


    // Immediately remove the images
    function editOff() {
        if (_mapillaryVisible) {
            _mapillaryVisible = false;
            context.pixi.stage.getChildByName('mapillary-map-features').visible = false;
        }
    }


    // Enable the layer.  This shows the map features and transitions them to visible.
    function layerOn() {
        editOn();
        dispatch.call('change');
    }


    // Disable the layer.  This transitions the layer invisible and then hides the features.
    function layerOff() {
        throttledRedraw.cancel();
        editOff();
        dispatch.call('change');
    }


    function filterData(detectedFeatures) {
        const fromDate = context.photos().fromDate();
        const toDate = context.photos().toDate();

        if (fromDate) {
            detectedFeatures = detectedFeatures.filter(function(feature) {
                return new Date(feature.last_seen_at).getTime() >= new Date(fromDate).getTime();
            });
        }
        if (toDate) {
            detectedFeatures = detectedFeatures.filter(function(feature) {
                return new Date(feature.first_seen_at).getTime() <= new Date(toDate).getTime();
            });
        }

        return detectedFeatures;
    }


    // Update the feature markers
    function updateFeatures(layer, projection) {
        if (!_mapillaryVisible || !_mapillaryEnabled) return;
        if (!context._mapillarySheet) return;

        const k = projection.scale();

        const service = getService();
        const unfilteredFeatures = (service ? service.mapFeatures(context.projection) : []);
        const mapFeatures = filterData(unfilteredFeatures);

        mapFeatures.forEach(function prepareImages(mapObject) {
            let feature = featureCache.get(mapObject.id);

            if (!feature) {   // make point if needed
                let icon = getMapillaryIconSpriteHelper(context, mapObject.value);
                const iconSize = 24;
                icon.width = iconSize;
                icon.interactive = true;
                icon.buttonMode = true;
                icon.height = iconSize;
                icon.name = mapObject.id;
                icon.position.set(0, 0);
                layer.addChild(icon);

                feature = {
                    displayObject: icon,
                    loc: mapObject.loc,
                };

                featureCache.set(mapObject.id, feature);
            }

            if (k === feature.k) return;
            feature.k = k;

            // Reproject and recalculate the bounding box
            const [x, y] = projection.project(feature.loc);
            feature.displayObject.position.set(x, y);
        });
    }


    // Draw the mapillary objects layer and schedule loading/updating their markers.
    function drawObjects(layer, projection) {

        if (!_didInitTextures) initMapillaryTextures();

        var service = getService();


        if (_mapillaryEnabled) {
            if (service && ~~context.map().zoom() >= minZoom) {
                editOn();
                updateFeatures(layer, projection);
                service.loadMapFeatures(context.projection);
                service.showFeatureDetections(true);
            } else {
                editOff();
            }
        } else if (service) {
            service.showFeatureDetections(false);
        }
    }


    // Toggles the layer on and off
    drawObjects.enabled = function(val) {
        if (!arguments.length) return _mapillaryEnabled;

        _mapillaryEnabled = val;
        if (_mapillaryEnabled) {
            layerOn();
            context.photos().on('change.mapillary_map_features', updateFeatures);

        } else {
            layerOff();
            context.photos().on('change.mapillary_map_features', null);
        }

        dispatch.call('change');
        return this;
    };


    drawObjects.supported = function() {
        return !!getService();
    };

    return drawObjects;
}
