import * as PIXI from 'pixi.js';
import _throttle from 'lodash-es/throttle';

import { select as d3_select } from 'd3-selection';
import { dispatch as d3_dispatch } from 'd3-dispatch';

import { modeBrowse } from '../modes/browse';
import { services } from '../services';
import { getMapillarySignIconSpriteHelper } from './helpers';

import _ from 'lodash';

var _mapillaryEnabled = false;

export function PixiMapillarySigns(context, featureCache, dispatch) {

    if (!dispatch) { dispatch = d3_dispatch('change'); }
    var throttledRedraw = _throttle(function () { dispatch.call('change'); }, 1000);
    const minZoom = 12;
    var _mapillaryVisible = false;
    let _mapillary;

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
            context.pixi.stage.getChildByName('mapillary-signs').visible = true;
        }
    }


    // Immediately remove the images
    function editOff() {
        if (_mapillaryVisible) {
            _mapillaryVisible = false;
            context.pixi.stage.getChildByName('mapillary-signs').visible = false;
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
        var fromDate = context.photos().fromDate();
        var toDate = context.photos().toDate();

        if (fromDate) {
            var fromTimestamp = new Date(fromDate).getTime();
            detectedFeatures = detectedFeatures.filter(function(feature) {
                return new Date(feature.last_seen_at).getTime() >= fromTimestamp;
            });
        }
        if (toDate) {
            var toTimestamp = new Date(toDate).getTime();
            detectedFeatures = detectedFeatures.filter(function(feature) {
                return new Date(feature.first_seen_at).getTime() <= toTimestamp;
            });
        }

        return detectedFeatures;
    }



    // Update the feature markers
    function updateFeatures(layer, projection) {
        if (!_mapillaryVisible || !_mapillaryEnabled) return;
        if (!context._mapillarySignSheet) return;

        const k = projection.scale();

        const service = getService();
        const unfilteredFeatures = (service ? service.signs(context.projection) : []);
        const mapFeatures = filterData(unfilteredFeatures);

        mapFeatures.forEach(function prepareImages(sign) {
            let feature = featureCache.get(sign.id);

            if (!feature) {   // make point if needed
                let icon = getMapillarySignIconSpriteHelper(context, sign.value);
                const iconSize = 24;
                icon.width = iconSize;
                icon.interactive = true;
                icon.buttonMode = true;
                icon.height = iconSize;
                icon.name = sign.id;
                icon.position.set(0, 0);
                layer.addChild(icon);

                feature = {
                    displayObject: icon,
                    loc: sign.loc,
                };

                featureCache.set(sign.id, feature);
            }

            if (k === feature.k) return;
            feature.k = k;

            // Reproject and recalculate the bounding box
            const [x, y] = projection.project(feature.loc);
            feature.displayObject.position.set(x, y);
        });
    }


    // Draw the mapillary objects layer and schedule loading/updating their markers.
    function drawSigns(layer, projection) {
        var service = getService();


        if (_mapillaryEnabled) {
            if (service && ~~context.map().zoom() >= minZoom) {
                editOn();
                updateFeatures(layer, projection);
                service.loadSigns(context.projection);
                service.showSignDetections(true);
            } else {
                editOff();
            }
        } else if (service) {
            service.showSignDetections(false);
        }
    }


    // Toggles the layer on and off
    drawSigns.enabled = function(val) {
        if (!arguments.length) return _mapillaryEnabled;

        _mapillaryEnabled = val;
        if (_mapillaryEnabled) {
            layerOn();
            context.photos().on('change.mapillary_signs', updateFeatures);

        } else {
            layerOff();
            context.photos().on('change.mapillary_signs', null);
        }

        dispatch.call('change');
        return this;
    };


    drawSigns.supported = function() {
        return !!getService();
    };

    return drawSigns;
}
