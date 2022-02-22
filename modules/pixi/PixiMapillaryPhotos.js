import * as PIXI from 'pixi.js';
import _throttle from 'lodash-es/throttle';

import { select as d3_select } from 'd3-selection';
import { dispatch as d3_dispatch } from 'd3-dispatch';

import { modeBrowse } from '../modes/browse';
import { services } from '../services';
import { getViewfieldContainerHelper } from './helpers';



var _mapillaryEnabled = false;
var _osmService;

const mapillary_green = 0x55ff22;

export function PixiMapillaryPhotos(context, featureCache, dispatch) {

    if (!dispatch) { dispatch = d3_dispatch('change'); }
    var throttledRedraw = _throttle(function () { dispatch.call('change'); }, 1000);
    const minZoom = 12;
    const minMarkerZoom = 16;
    const minViewfieldZoom = 18;
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
            _mapillary.event.on('loadedImages', throttledRedraw);
        } else if (!services.mapillary && _mapillary) {
            _mapillary = null;
        }

        return _mapillary;
    }



    // Show the mapillary images and their tracks
    function editOn() {
        if (!_mapillaryVisible) {
            _mapillaryVisible = true;
            context.pixi.stage.getChildByName('mapillary').visible = true;
        }
    }


    // Immediately remove the images
    function editOff() {
        if (_mapillaryVisible) {
            _mapillaryVisible = false;
            context.pixi.stage.getChildByName('mapillary').visible = false;
        }
    }


    // Enable the layer.  This shows the image points and transitions them to visible.
    function layerOn() {
        editOn();
        dispatch.call('change');
    }


    // Disable the layer.  This transitions the layer invisible and then hides the images.
    function layerOff() {
        throttledRedraw.cancel();
        editOff();
        dispatch.call('change');
    }


    // Update the image markers
    function updateImages(layer, projection) {
        if (!_mapillaryVisible || !_mapillaryEnabled) return;
        const k = projection.scale();

        var service = getService();
        const imageEntities = (service ? service.images(context.projection) : []);
        const sequenceEntities = (service ? service.sequences(context.projection) : []);

    sequenceEntities.forEach(function prepareImages(sequence) {
            let feature = featureCache.get(sequence.id);

            if (!feature) {   // make point if needed
                const container = new PIXI.Container();
                container.name = 'sequence-' + sequence.id;
                container.buttonMode = true;
                container.interactive = true;
                container.sortableChildren = true; //Needed because of z-index setting for highlight

                let line = new PIXI.Graphics();
                container.addChild(line);
                layer.addChild(container);

                feature = {
                    displayObject: container,
                    coords: sequence.geometry.coordinates,
                    graphics: line,
                };

                featureCache.set(sequence.id, feature);
            }

            if (k === feature.k) return;
            feature.k = k;

            let points = [];

            feature.coords.forEach(coord => {
                const [x, y] = projection.project(coord);
                points.push([x, y]);
            });

        let g = feature.graphics.clear();
        g.lineStyle({
            color: mapillary_green,
            width: 4
        });
          points.forEach(([x, y], i) => {
            if (i === 0) {
              g.moveTo(x, y);
            } else {
              g.lineTo(x, y);
            }
          });
        });

        imageEntities.forEach(function prepareImages(image) {
            let feature = featureCache.get(image.id);

            if (!feature) {   // make point if needed
                const container = new PIXI.Container();
                container.name = 'image-' + image.id;
                container.buttonMode = true;
                container.interactive = true;
                container.sortableChildren = true; //Needed because of z-index setting for highlight

                layer.addChild(container);

                if (context.map().zoom() >= minViewfieldZoom) {
                    //Get the capture angle, if any, and attach a viewfield to the point.
                    if (image.ca) {
                        const vfContainer = getViewfieldContainerHelper(context, [image.ca], mapillary_green);
                        container.addChild(vfContainer);
                    }
                }

                let viewField = new PIXI.Sprite(_textures.circle);
                viewField.anchor.set(0.5, 0.5);
                viewField.name = 'image-marker';
                viewField.anchor.set(0.5, 0.5);

                container.addChild(viewField);

                feature = {
                    displayObject: container,
                    loc: image.loc,
                };

                featureCache.set(image.id, feature);
            }

            if (k === feature.k) return;
            feature.k = k;

            // Reproject and recalculate the bounding box
            const [x, y] = projection.project(feature.loc);
            feature.displayObject.position.set(x, y);
        });


    }


    // Draw the mapillary images layer and schedule loading/updating their markers.
    function drawImages(layer, projection) {

        if (!_didInitTextures) initMapillaryTextures();

        var service = getService();


        if (_mapillaryEnabled) {
            if (service && ~~context.map().zoom() >= minZoom) {
                editOn();
                service.loadImages(context.projection);
                updateImages(layer, projection);
            } else {
                editOff();
            }
        }
    }


    // Toggles the layer on and off
    drawImages.enabled = function(val) {
        if (!arguments.length) return _mapillaryEnabled;

        _mapillaryEnabled = val;
        if (_mapillaryEnabled) {
            layerOn();
        } else {
            layerOff();
        }

        dispatch.call('change');
        return this;
    };


    drawImages.supported = function() {
        return !!getService();
    };

    return drawImages;
}
