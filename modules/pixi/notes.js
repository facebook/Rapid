import * as PIXI from 'pixi.js';
import _throttle from 'lodash-es/throttle';

import { select as d3_select } from 'd3-selection';
import { dispatch as d3_dispatch } from 'd3-dispatch';

import { modeBrowse } from '../modes/browse';
import { services } from '../services';


var _notesEnabled = false;
var _osmService;

export function pixiNotes(context, featureCache, dispatch) {

    if (!dispatch) { dispatch = d3_dispatch('change'); }
    var throttledRedraw = _throttle(function () { dispatch.call('change'); }, 1000);
    var minZoom = 12;
    var _notesVisible = false;
    let _textures = {};
    let _didInit = false;

    function initNotesTextures() {
        const marker = new PIXI.Graphics()
            .lineStyle(1, 0x444444)
            .beginFill(0xffffff, 1)
            .moveTo(17.5, 0)
            .lineTo(15, 0)
            .bezierCurveTo(-1.37, 0, -2.5, 1.12, -2.5, -2.5)
            .lineTo(0, 11.25)
            .bezierCurveTo(0, 1.37, 1.12, 2.5, 2.5, 2.5)
            .lineTo(3.75, 0)
            .lineTo(0, 3.28)
            .bezierCurveTo(0, 0.38, 0.43, 0.6, 0.75, 0.37)
            .lineTo(4.87, -3.65)
            .lineTo(5.62, 0)
            .bezierCurveTo(1.37, 0, 2.5, -1.12, 2.5, -2.5)
            .lineTo(0, -11.25)
            .bezierCurveTo(0, -1.37, -1.12, -2.5, -2.5, -2.5)
            .closePath()
            .endFill();

        const ellipse = new PIXI.Graphics()
            .lineStyle(1, 0x444444)
            .beginFill(0xffffff, 1)
            .drawEllipse(0.5, 1, 6.5, 3)
            .endFill();

        const renderer = context.pixi.renderer;
        const options = { resolution: 2 };
        _textures.marker = renderer.generateTexture(marker, options);
        _textures.oval = renderer.generateTexture(ellipse, options);
        _didInit = true;

    }


    // Loosely-coupled osm service for fetching notes.
    function getService() {
        if (services.osm && !_osmService) {
            _osmService = services.osm;
            _osmService.on('loadedNotes', throttledRedraw);
        } else if (!services.osm && _osmService) {
            _osmService = null;
        }

        return _osmService;
    }


    // Show the notes
    function editOn() {
        if (!_notesVisible) {
            _notesVisible = true;
            context.pixi.stage.getChildByName('notes').visible = true;
        }
    }


    // Immediately remove the notes and their touch targets
    function editOff() {
        if (_notesVisible) {
            _notesVisible = false;
            context.pixi.stage.getChildByName('notes').visible = false;
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


    // Update the note markers
    function updateMarkers(layer, projection) {
        if (!_notesVisible || !_notesEnabled) return;

        var service = getService();
        var selectedID = context.selectedNoteID();
        var data = (service ? service.notes(projection) : []);










        function sortY(a, b) {
            if (a.id === selectedID) return 1;
            if (b.id === selectedID) return -1;
            return b.loc[1] - a.loc[1];
        }
    }


    // Draw the notes layer and schedule loading notes and updating markers.
    function drawNotes(layer, projection) {

        if (!_didInit) initNotesTextures();

        var service = getService();


        if (_notesEnabled) {
            if (service && ~~context.map().zoom() >= minZoom) {
                editOn();
                service.loadNotes(projection);
                updateMarkers(layer, projection);
            } else {
                editOff();
            }
        }
    }


    // Toggles the layer on and off
    drawNotes.enabled = function(val) {
        if (!arguments.length) return _notesEnabled;

        _notesEnabled = val;
        if (_notesEnabled) {
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


    return drawNotes;
}
