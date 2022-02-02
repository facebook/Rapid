import * as PIXI from 'pixi.js';
import _throttle from 'lodash-es/throttle';

import { select as d3_select } from 'd3-selection';
import { dispatch as d3_dispatch } from 'd3-dispatch';

import { modeBrowse } from '../modes/browse';
import { services } from '../services';
import { getViewfieldContainerHelper } from './pixiHelpers';

import { modeSelectNote } from '../modes/select_note';


var _kartaEnabled = false;
var _osmService;

const karta_blue = 0x20c4ff;

export function pixiKartaImages(context, featureCache, dispatch) {

    if (!dispatch) { dispatch = d3_dispatch('change'); }
    var throttledRedraw = _throttle(function () { dispatch.call('change'); }, 1000);
    const minZoom = 12;
    const minMarkerZoom = 16;
    const minViewfieldZoom = 18;
    var _kartaVisible = false;
    let _textures = {};
    let _didInitTextures = false;
    let _karta;

    function initTextures() {
        const circle = new PIXI.Graphics()
            .lineStyle({width: 1, color:0x222222})
            .beginFill(karta_blue)
            .drawCircle(6, 6, 6)
            .endFill();


        const renderer = context.pixi.renderer;
        const options = { resolution: 2 };
        _textures.circle = renderer.generateTexture(circle, options);
        _didInitTextures = true;
    }


    function getService() {
        if (services.openstreetcam && !_karta) {
            _karta = services.openstreetcam;
            _karta.event.on('loadedImages', throttledRedraw);
        } else if (!services.openstreetcam && _karta) {
            _karta = null;
        }

        return _karta;
    }



    // Show the openstreetcam images
    function editOn() {
        if (!_kartaVisible) {
            _kartaVisible = true;
            context.pixi.stage.getChildByName('openstreetcam').visible = true;
        }
    }


    // Immediately remove the images
    function editOff() {
        if (_kartaVisible) {
            _kartaVisible = false;
            context.pixi.stage.getChildByName('openstreetcam').visible = false;
        }
    }


    // Enable the layer.  This shows the notes and transitions them to visible.
    function layerOn() {
        editOn();
        dispatch.call('change');
    }


    // Disable the layer.  This transitions the layer invisible and then hides the notes.
    function layerOff() {
        throttledRedraw.cancel();
        editOff();
        dispatch.call('change');
    }

    function filterImages(images) {
        var fromDate = context.photos().fromDate();
        var toDate = context.photos().toDate();
        var usernames = context.photos().usernames();

        if (fromDate) {
            var fromTimestamp = new Date(fromDate).getTime();
            images = images.filter(function(item) {
                return new Date(item.captured_at).getTime() >= fromTimestamp;
            });
        }
        if (toDate) {
            var toTimestamp = new Date(toDate).getTime();
            images = images.filter(function(item) {
                return new Date(item.captured_at).getTime() <= toTimestamp;
            });
        }
        if (usernames) {
            images = images.filter(function(item) {
                return usernames.indexOf(item.captured_by) !== -1;
            });
        }

        return images;
    }

    function filterSequences(sequences) {
        var fromDate = context.photos().fromDate();
        var toDate = context.photos().toDate();
        var usernames = context.photos().usernames();

        if (fromDate) {
            var fromTimestamp = new Date(fromDate).getTime();
            sequences = sequences.filter(function(image) {
                return new Date(image.properties.captured_at).getTime() >= fromTimestamp;
            });
        }
        if (toDate) {
            var toTimestamp = new Date(toDate).getTime();
            sequences = sequences.filter(function(image) {
                return new Date(image.properties.captured_at).getTime() <= toTimestamp;
            });
        }
        if (usernames) {
            sequences = sequences.filter(function(image) {
                return usernames.indexOf(image.properties.captured_by) !== -1;
            });
        }

        return sequences;
    }


    // Update the note markers
    function updateImages(layer, projection) {
        if (!_kartaVisible || !_kartaEnabled) return;
        const k = projection.scale();

        const z = ~~context.map().zoom();
        const showMarkers = (z >= minMarkerZoom);
        const showViewfields = (z >= minViewfieldZoom);

        var service = getService();
        const images = (service && showMarkers ? service.images(context.projection) : []);
        const sequences = (service ? service.sequences(context.projection) : []);

        let sequenceEntities = filterSequences(sequences);
        let imageEntities = filterImages(images);

         sequenceEntities.forEach(function prepareImages(sequence) {
            let feature = featureCache.get('sequence' + sequence.properties.key);

            if (!feature) {   // make point if needed
                const container = new PIXI.Container();
                container.name = 'sequence-' + sequence.properties.key;
                container.buttonMode = true;
                container.interactive = true;
                container.sortableChildren = true; //Needed because of z-index setting for highlight

                let line = new PIXI.Graphics();
                container.addChild(line);
                layer.addChild(container);

                feature = {
                    displayObject: container,
                    coords: sequence.coordinates,
                    graphics: line,
                };

                featureCache.set('sequence' + sequence.properties.key, feature);
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
            color: karta_blue,
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
            let feature = featureCache.get(image.key);

            if (!feature) {   // make point if needed
                const container = new PIXI.Container();
                container.name = 'image-' + image.key;
                container.buttonMode = true;
                container.interactive = true;
                container.sortableChildren = true; //Needed because of z-index setting for highlight

                layer.addChild(container);

                //Get the capture angle, if any, and attach a viewfield to the point.
                if (image.ca) {
                    const vfContainer = getViewfieldContainerHelper(context, [image.ca], karta_blue);
                    container.addChild(vfContainer);
                }

                let viewField = new PIXI.Sprite(_textures.circle);
                viewField.anchor.set(0.5, 0.5);
                viewField.name = 'image-marker';
                viewField.anchor.set(0.5, 0.5);
                viewField.visible = showViewfields;

                container.addChild(viewField);

                feature = {
                    displayObject: container,
                    loc: image.loc,
                    viewfield: viewField,
                };

                featureCache.set(image.key, feature);
            }

            if (k === feature.k) return;
            feature.k = k;

            // Reproject and recalculate the bounding box
            const [x, y] = projection.project(feature.loc);
            feature.displayObject.position.set(x, y);
            feature.viewfield.visible = showViewfields;
        });


    }


    // Draw the mapillary images layer and schedule loading/updating their markers.
    function drawImages(layer, projection) {

        if (!_didInitTextures) initTextures();

        var service = getService();


        if (_kartaEnabled) {
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
        if (!arguments.length) return _kartaEnabled;

        _kartaEnabled = val;
        if (_kartaEnabled) {
            layerOn();
        } else {
            layerOff();
            if (context.selectedNoteID()) {
                context.enter(modeBrowse(context));
            }
        }

        dispatch.call('change');
        return this;
    };


    drawImages.supported = function() {
        return !!getService();
    };

    return drawImages;
}
