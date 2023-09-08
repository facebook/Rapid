import { geomViewportNudge, vecSubtract } from '@rapid-sdk/math';

import { actionNoop } from '../actions/noop';


export function modeDragNote(context) {
    const editor = context.systems.editor;

    var mode = {
        id: 'drag-note',
        button: 'browse'
    };

    const behavior = context.behaviors.drag
      .on('start', start)
      .on('move', move)
      .on('end', end);

    var _nudgeInterval;
    var _lastLoc;
    var _note;    // most current note.. dragged note may have stale datum.


    function startNudge(d3_event, nudge) {
        if (_nudgeInterval) window.clearInterval(_nudgeInterval);
        _nudgeInterval = window.setInterval(function() {
            context.systems.map.pan(nudge);
            doMove(d3_event, nudge);
        }, 50);
    }


    function stopNudge() {
        if (_nudgeInterval) {
            window.clearInterval(_nudgeInterval);
            _nudgeInterval = null;
        }
    }


    function origin(note) {
        return context.projection.project(note.loc);
    }


    function start(d3_event, note) {
        _note = note;
        var osm = context.services.osm;

        if (osm) {
            // Get latest note from cache.. The marker may have a stale datum bound to it
            // and dragging it around can sometimes delete the users note comment.
            _note = osm.getNote(_note.id);
        }
        if (!_note.id) return;

        context.surface().selectAll('.note-' + _note.id)
            .classed('active', true);

        editor.perform(actionNoop());
        context.enter(mode);
        // context.selectedNoteID(_note.id);
    }


    function move(d3_event, entity, point) {
        d3_event.stopPropagation();
        _lastLoc = context.projection.invert(point);

        doMove(d3_event);
        var nudge = geomViewportNudge(point, context.systems.map.dimensions);
        if (nudge) {
            startNudge(d3_event, nudge);
        } else {
            stopNudge();
        }
    }


    function doMove(d3_event, nudge) {
        nudge = nudge || [0, 0];

        var currPoint = (d3_event && d3_event.point) || context.projection.project(_lastLoc);
        var currMouse = vecSubtract(currPoint, nudge);
        var loc = context.projection.invert(currMouse);

        _note = _note.move(loc);

        var osm = context.services.osm;
        if (osm) {
            osm.replaceNote(_note);  // update note cache
        }

        editor.replace(actionNoop());   // trigger redraw
    }


    function end() {
        editor.replace(actionNoop());   // trigger redraw

        const selectedData = new Map().set(_note.id, _note);
        context.enter('select', selectedData);
    }



    mode.enter = function() {
      context.enableBehaviors(['hover', 'drag', 'map-interaction']);
      return true;
    };


    mode.exit = function() {
        context.systems.ui.sidebar.hover.cancel();

        context.surface()
            .selectAll('.active')
            .classed('active', false);

        stopNudge();
    };

    // mode.behavior = drag;

    return mode;
}
