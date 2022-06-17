import { AbstractMode } from './AbstractMode';
import { services } from '../services';
import { osmNote } from '../osm';
import { uiNoteEditor } from '../ui/note_editor';

const DEBUG = false;


/**
 * `ModeSelectNote`
 */
export class ModeSelectNote extends AbstractMode {

  /**
   * @constructor
   * @param  `context`  Global shared context for iD
   */
  constructor(context) {
    super(context);
    this.id = 'select-note';
  }


  /**
   * enter
   * FOR NOW: The selection here is expected to contain a single OSM note.
   * @param   `selectedData`  `Map(dataID -> data)`
   */
  enter(selectedData) {

// FOR NOW
if (!(selectedData instanceof Map)) return false;
if (selectedData.size !== 1) return false;
const [[noteID, note]] = selectedData.entries();
if (!(note instanceof osmNote)) return false;

    if (DEBUG) {
      console.log('ModeSelectNote: entering');  // eslint-disable-line no-console
    }

    this.selectedData = selectedData;
    this._active = true;
    const context = this._context;
    context.enableBehaviors(['hover', 'select', 'drag']);

// some of this feels like it should live with the noteEditor, not here
    const noteEditor = uiNoteEditor(context)
      .on('change', () => {
        // force a redraw (there is no history change that would otherwise do this)
        context.map().immediateRedraw();
        const note = this._getNote(noteID);

// verify and update selectedData?
if (!(note instanceof osmNote)) return false;  // back to browse mode if the note is gone?
this.selectedData.set(noteID, note);

        context.ui().sidebar.show(noteEditor.note(note));
      });

    const sidebar = context.ui().sidebar;
    sidebar.show(noteEditor.note(note)); //.newNote(_newFeature));
    // Expand the sidebar, avoid obscuring the note if needed
    sidebar.expand(sidebar.intersects(note.extent()));

    return true;
  }


  /**
   * exit
   */
  exit() {
    if (!this._active) return;
    this._active = false;

    if (DEBUG) {
      console.log('ModeSelectNote: exiting');  // eslint-disable-line no-console
    }

    const context = this._context;
    context.ui().sidebar.hide();
  }


  /** _getNote
   * Lookup the note for the given noteID
   * @param   `noteID`  The note ID to lookup
   * @return  Note `Object`
   */
  _getNote(noteID) {
    if (services.osm) {
      return services.osm.getNote(noteID);
    } else {
      return null;
    }
  }

}



//////////////////////////

//
//
//import { select as d3_select } from 'd3-selection';
//
//import { t } from '../core/localizer';
//// import { behaviorLasso } from '../behaviors/lasso';
//// import { BehaviorSelect } from '../behaviors/BehaviorSelect';
//import { modeDragNode } from './drag_node';
//import { modeDragNote } from './drag_note';
//import { services } from '../services';
//import { uiNoteEditor } from '../ui/note_editor';
//import { utilKeybinding } from '../util';
//
//
//export function modeSelectNote(context, selectedNoteID) {
//    var mode = {
//        id: 'select-note',
//        button: 'browse'
//    };
//
//    var _keybinding = utilKeybinding('select-note');
//    var _noteEditor = uiNoteEditor(context)
//        .on('change', function() {
//            context.map().immediateRedraw();
//            var note = checkSelectedID();
//            if (!note) return;
//            context.ui().sidebar
//                .show(_noteEditor.note(note));
//        });
//
//    // var _behaviors = [
//    //     new BehaviorSelect(context),
//    //     behaviorLasso(context),
//    //     modeDragNode(context).behavior,
//    //     // modeDragNote(context).behavior
//    // ];
//
//    var _newFeature = false;
//
//
//    function checkSelectedID() {
//        if (!services.osm) return;
//        var note = services.osm.getNote(selectedNoteID);
//        if (!note) {
//            context.enter('browse');
//        }
//        return note;
//    }
//
//
//    // class the note as selected, or return to browse mode if the note is gone
//    function selectNote(d3_event, drawn) {
//        if (!checkSelectedID()) return;
//
//        var selection = context.surface().selectAll('.layer-notes .note-' + selectedNoteID);
//
//        if (selection.empty()) {
//            // Return to browse mode if selected DOM elements have
//            // disappeared because the user moved them out of view..
//            var source = d3_event && d3_event.type === 'zoom' && d3_event.sourceEvent;
//            if (drawn && source && (source.type === 'pointermove' || source.type === 'mousemove' || source.type === 'touchmove')) {
//                context.enter('browse');
//            }
//
//        } else {
//            selection
//                .classed('selected', true);
//
//            context.selectedNoteID(selectedNoteID);
//        }
//    }
//
//
//    function esc() {
//        if (context.container().select('.combobox').size()) return;
//        context.enter('browse');
//    }
//
//
//    mode.zoomToSelected = function() {
//        if (!services.osm) return;
//        var note = services.osm.getNote(selectedNoteID);
//        if (note) {
//            context.map().centerZoomEase(note.loc, 20);
//        }
//    };
//
//
//    mode.newFeature = function(val) {
//        if (!arguments.length) return _newFeature;
//        _newFeature = val;
//        return mode;
//    };
//
//
//    mode.enter = function() {
//        var note = checkSelectedID();
//        if (!note) return;
//
//        // _behaviors.forEach(context.install);
//
//        _keybinding
//            .on(t('inspector.zoom_to.key'), mode.zoomToSelected)
//            .on('⎋', esc, true);
//
//        d3_select(document)
//            .call(_keybinding);
//
//        selectNote();
//
//        var sidebar = context.ui().sidebar;
//        sidebar.show(_noteEditor.note(note).newNote(_newFeature));
//
//        // expand the sidebar, avoid obscuring the note if needed
//        sidebar.expand(sidebar.intersects(note.extent()));
//
//        context.map()
//            .on('drawn.select', selectNote);
//    };
//
//
//    mode.exit = function() {
//        // _behaviors.forEach(context.uninstall);
//
//        d3_select(document)
//            .call(_keybinding.unbind);
//
//        context.map()
//            .on('drawn.select', null);
//
//        context.ui().sidebar
//            .hide();
//
//        context.selectedNoteID(null);
//    };
//
//
//    return mode;
//}
