import * as PIXI from 'pixi.js';
import _throttle from 'lodash-es/throttle';

import { dispatch as d3_dispatch } from 'd3-dispatch';

import { services } from '../services';
import { getIconSpriteHelper } from './pixiHelpers';

var _layerEnabled = false;


export function pixiImproveOSM(context, featureCache, dispatch) {

    if (!dispatch) { dispatch = d3_dispatch('change'); }
    var throttledRedraw = _throttle(function () { dispatch.call('change'); }, 1000);
    const minZoom = 12;
    var _visible = false;
    let _textures = {};
    let _didInitTextures = false;
    let _qaService;

    //A mapping of improveOSM rule numbers and their respective tint colors.
    const _ioRuleColorMap = new Map();


    _ioRuleColorMap.set('tr', 0xec1c24); //turn restrictions
    _ioRuleColorMap.set('ow', 0x1e90ff); // oneway restrictions
    _ioRuleColorMap.set('mr-road', 0xb452cd); // missing missing road
    _ioRuleColorMap.set('mr-path', 0xa0522d); // missing path
    _ioRuleColorMap.set('mr-parking', 0xeeee00); // missing parking
    _ioRuleColorMap.set('mr-both', 0xffa500); // missing road + parking


    function initTextures() {
        const balloonMarker = new PIXI.Graphics()
            .lineStyle(1, 0x33333)
            .beginFill(0xffffff)
            .drawPolygon([16,3, 4,3, 1,6, 1,17, 4,20, 7,20, 10,27, 13,20, 16,20, 19,17.033, 19,6])
            .endFill()
            .closePath();


        const renderer = context.pixi.renderer;
        const options = { resolution: 2 };
        _textures.improveOSMMarker = renderer.generateTexture(balloonMarker, options);
        _didInitTextures = true;
    }


    function getService() {
        if (services.improveOSM && !_qaService) {
            _qaService = services.improveOSM;
            _qaService.event.on('loaded', throttledRedraw);
        } else if (!services.improveOSM && _qaService) {
            _qaService = null;
        }

        return _qaService;
    }



    // Show the layer
    function editOn() {
        if (!_visible) {
            _visible = true;
            context.pixi.stage.getChildByName('improveOSM').visible = true;
        }
    }


    // Immediately remove the layer
    function editOff() {
        if (_visible) {
            _visible = false;
            context.pixi.stage.getChildByName('improveOSM').visible = false;
        }
    }


    // Enable the layer.  This shows the image points and transitions them to visible.
    function layerOn() {
        editOn();
        dispatch.call('change');
    }


    // Disable the layer.  This transitions the layer invisible and then hides it.
    function layerOff() {
        throttledRedraw.cancel();
        editOff();
        dispatch.call('change');
    }


    // Update the image markers
    function updateMarkers(layer, projection) {
        if (!_visible || !_layerEnabled) return;
        const k = projection.scale();

        var service = getService();
        const improveOSMEntities = (service ? service.getItems(context.projection) : []);

        improveOSMEntities.forEach(function prepareImages(entity) {
            let feature = featureCache.get(entity.id);

            if (!feature) {   // make point if needed
                const container = new PIXI.Container();
                container.name = 'improveOSM-' + entity.id;
                container.buttonMode = true;
                container.interactive = true;
                container.sortableChildren = true; //Needed because of z-index setting for highlight

                layer.addChild(container);

                let marker = new PIXI.Sprite(_textures.improveOSMMarker);
                marker.anchor.set(0.5, 1);
                marker.name = 'improveOSM-marker';
                let tintColor = _ioRuleColorMap.get(entity.itemType);
                if (tintColor === undefined) tintColor = 0xffffff;
                marker.tint = tintColor;

                container.addChild(marker);

                const picon = entity.icon;

                if (picon) {
                    let icon = getIconSpriteHelper(context, picon);
                    const iconsize = 11;
                    // mathematically 0,-15 is center of marker, move down slightly
                    icon.position.set(0, -16);
                    icon.width = iconsize;
                    icon.height = iconsize;
                    container.addChild(icon);
                }


                feature = {
                    displayObject: container,
                    loc: entity.loc,
                };

                featureCache.set(entity.id, feature);
            }

            if (k === feature.k) return;
            feature.k = k;

            // Reproject and recalculate the bounding box
            const [x, y] = projection.project(feature.loc);
            feature.displayObject.position.set(x, y);
        });


    }


    // Draw the improveOSM layer and schedule loading/updating their markers.
    function drawImproveOSM(layer, projection) {

        if (!_didInitTextures) initTextures();

        var service = getService();


        if (_layerEnabled) {
            if (service && ~~context.map().zoom() >= minZoom) {
                editOn();
                service.loadIssues(context.projection);
                updateMarkers(layer, projection);
            } else {
                editOff();
            }
        }
    }


    // Toggles the layer on and off
    drawImproveOSM.enabled = function(val) {
        if (!arguments.length) return _layerEnabled;

        _layerEnabled = val;
        if (_layerEnabled) {
            layerOn();
        } else {
            layerOff();
        }

        dispatch.call('change');
        return this;
    };


    drawImproveOSM.supported = function() {
        return !!getService();
    };

    return drawImproveOSM;
}
