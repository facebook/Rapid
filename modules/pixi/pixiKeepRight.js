import * as PIXI from 'pixi.js';
import _throttle from 'lodash-es/throttle';

import { select as d3_select } from 'd3-selection';
import { dispatch as d3_dispatch } from 'd3-dispatch';

import { modeBrowse } from '../modes/browse';
import { services } from '../services';
import { getViewfieldContainerHelper } from './pixiHelpers';



var _layerEnabled = false;


export function pixiKeepRight(context, featureCache, dispatch) {

    if (!dispatch) { dispatch = d3_dispatch('change'); }
    var throttledRedraw = _throttle(function () { dispatch.call('change'); }, 1000);
    const minZoom = 12;
    const minMarkerZoom = 16;
    const minViewfieldZoom = 18;
    var _visible = false;
    let _textures = {};
    let _didInitTextures = false;
    let _qaService;

    //A mapping of KeepRight rule numbers and their respective tint colors.
    const _krRuleColorMap = new Map();

    ['20', '40', '210', '270', '310', '320', '350'].forEach(key => {
        _krRuleColorMap.set(key, 0xffff99);
    });

    _krRuleColorMap.set('50', 0xffff99);

    ['60', '70', '90', '100', '110', '150', '220', '380'].forEach(key => {
        _krRuleColorMap.set(key, 0x55dd00);
    });

    _krRuleColorMap.set('130', 0xffaa33);
    _krRuleColorMap.set('170', 0xffff00);

    _krRuleColorMap.set('190', 0xff3333);
    _krRuleColorMap.set('200', 0xfdbf6f);

    _krRuleColorMap.set('160', 0xbb6600);
    _krRuleColorMap.set('230', 0xbb6600);

    _krRuleColorMap.set('280', 0x5f47a0);
    _krRuleColorMap.set('180', 0xaaccee);
    _krRuleColorMap.set('290', 0xaaccee);

    _krRuleColorMap.set('300', 0x009900);
    _krRuleColorMap.set('390', 0x009900);

    ['360', '370', '410'].forEach(key => {
        _krRuleColorMap.set(key, 0xff99bb);
    });

    _krRuleColorMap.set('120', 0xcc3355);
    _krRuleColorMap.set('400', 0xcc3355);

    function initTextures() {
        const lightningBoltMarker = new PIXI.Graphics()
            .lineStyle(1, 0x33333)
            .beginFill(0xffffff)
            .moveTo(15, 6.5)
            .lineTo(10.8, 6.5)
            .bezierCurveTo(12.2, 1.3, 11.7, 0.8, 11.2, 0.8)
            .lineTo(6.2, 0.8)
            .bezierCurveTo(5.8, 0.7, 5.4, 1, 5.4, 1.5)
            .lineTo(4.2, 10.2)
            .bezierCurveTo(4.1, 10.8, 4.6, 11.2, 5, 11.2)
            .lineTo(9.3, 11.2)
            .lineTo(7.6, 18.3)
            .bezierCurveTo(7.5, 18.8, 8, 19.3, 8.5, 19.3)
            .bezierCurveTo(8.8, 19.3, 9.1, 19.1, 9.2, 18.8)
            .lineTo(15.6, 7.8)
            .bezierCurveTo(16, 7.2, 15.6, 6.5, 15, 6.5)
            .endFill()
            .closePath();


        const renderer = context.pixi.renderer;
        const options = { resolution: 2 };
        _textures.keepRightMarker = renderer.generateTexture(lightningBoltMarker, options);
        _didInitTextures = true;
    }


    function getService() {
        if (services.keepRight && !_qaService) {
            _qaService = services.keepRight;
            _qaService.event.on('loaded', throttledRedraw);
        } else if (!services.keepRight && _qaService) {
            _qaService = null;
        }

        return _qaService;
    }



    // Show the layer
    function editOn() {
        if (!_visible) {
            _visible = true;
            context.pixi.stage.getChildByName('keepRight').visible = true;
        }
    }


    // Immediately remove the layer
    function editOff() {
        if (_visible) {
            _visible = false;
            context.pixi.stage.getChildByName('keepRight').visible = false;
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
        const keepRightEntities = (service ? service.getItems(context.projection) : []);

        keepRightEntities.forEach(function prepareImages(entity) {
            let feature = featureCache.get(entity.id);

            if (!feature) {   // make point if needed
                const container = new PIXI.Container();
                container.name = 'keepRight-' + entity.id;
                container.buttonMode = true;
                container.interactive = true;
                container.sortableChildren = true; //Needed because of z-index setting for highlight

                layer.addChild(container);

                let marker = new PIXI.Sprite(_textures.keepRightMarker);
                marker.anchor.set(0.5, 0.5);
                marker.name = 'keepRight-marker';
                marker.anchor.set(0.5, 0.5);
                let tintColor = _krRuleColorMap.get(entity.parentIssueType);
                if (tintColor === undefined) tintColor = 0xffffff;
                marker.tint = tintColor;

                container.addChild(marker);

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


    // Draw the keepRight layer and schedule loading/updating their markers.
    function drawKeepRight(layer, projection) {

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
    drawKeepRight.enabled = function(val) {
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


    drawKeepRight.supported = function() {
        return !!getService();
    };

    return drawKeepRight;
}
