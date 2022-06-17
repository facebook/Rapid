import { AbstractMode } from './AbstractMode';
import { services } from '../services';
import { osmNote } from '../osm';

import { uiDataEditor } from '../ui/data_editor';
import { uiNoteEditor } from '../ui/note_editor';
import { uiRapidFeatureInspector } from '../ui/rapid_feature_inspector';

const DEBUG = true;


/**
 * `ModeSelect`
 * In this mode, users have one or more things selected.
 * The sidebar shows something depending on what the selection contains.
 */
export class ModeSelect extends AbstractMode {

  /**
   * @constructor
   * @param  `context`  Global shared context for iD
   */
  constructor(context) {
    super(context);
    this.id = 'select';
  }


  /**
   * enter
   * @param   `selectedData`  `Map(dataID -> data)`
   */
  enter(selectedData) {
    if (!(selectedData instanceof Map)) return false;
    if (!selectedData.size) return false;
    const [[datumID, datum]] = selectedData.entries();   // the first thing in the selection

    if (DEBUG) {
      console.log(`ModeSelect: entering, selected ${datumID}`);  // eslint-disable-line no-console
    }

    this.selectedData = selectedData;
    this._active = true;

    const context = this._context;
    context.enableBehaviors(['hover', 'select', 'drag']);

    const sidebar = context.ui().sidebar;
    let sidebarContent = null;

    // Selected a note...
    if (datum instanceof osmNote) {
      const noteEditor = uiNoteEditor(context).note(datum);
      sidebarContent = noteEditor;

      // This feels like it should live with the noteEditor, not here
      noteEditor
        .on('change', () => {
          // force a redraw (there is no history change that would otherwise do this)
          context.map().immediateRedraw();
          if (!services.osm) return;
          const note = services.osm.getNote(datumID);
          if (!(note instanceof osmNote)) return;
          context.ui().sidebar.show(noteEditor.note(note));
          // not sure whether we should update selectedData after a change happens?
          this.selectedData.set(datumID, note);
        });

    // Selected custom data (e.g. gpx track)...
    } else if (datum.__featurehash__) {
      const dataEditor = uiDataEditor(context).datum(datum);
      sidebarContent = dataEditor;

    // Selected RapiD feature...
    } else if (datum.__fbid__) {
      const rapidInspector = uiRapidFeatureInspector(context).datum(datum); //, keybinding);
      sidebarContent = rapidInspector;
    }

    // need to bail out if selected thing is unrecognizable

    // setup the sidebar
    if (sidebarContent) {
      sidebar.show(sidebarContent); //.newNote(_newFeature));
      // Attempt to expand the sidebar, avoid obscuring the selected thing if we can..
      // For this to work the datum must have an extent already
      // sidebar.expand(sidebar.intersects(datum.extent()));
    }

    return true;
  }


  /**
   * exit
   */
  exit() {
    if (!this._active) return;
    this._active = false;

    if (DEBUG) {
      console.log('ModeSelect: exiting');  // eslint-disable-line no-console
    }

    const context = this._context;
    context.ui().sidebar.hide();
  }

}

