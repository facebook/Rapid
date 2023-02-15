import { AbstractMode } from './AbstractMode';
import { services } from '../services';
import { osmNote, QAItem } from '../osm';
import { select as d3_select } from 'd3-selection';

import { uiDataEditor } from '../ui/data_editor';
import { uiImproveOsmEditor } from '../ui/improveOSM_editor';
import { uiKeepRightEditor } from '../ui/keepRight_editor';
import { uiNoteEditor } from '../ui/note_editor';
import { uiOsmoseEditor } from '../ui/osmose_editor';
import { uiRapidFeatureInspector } from '../ui/rapid_feature_inspector';
import { utilKeybinding } from '../util';

const DEBUG = false;


/**
 * `ModeSelect`
 * In this mode, the user has selected one or more things.
 * - `selectedData` contains the information about what is selected.
 * - The sidebar shows something depending on what the selection contains.
 * - We also can set up the "operations" allowed (right click edit menu)
 */
export class ModeSelect extends AbstractMode {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'select';
    this.keybinding = null;
  }


  /**
   * enter
   * Expects a `selection` property in the options argument as a `Map(datumID -> datum)`
   *
   * @param  `options`  Optional `Object` of options passed to the new mode
   */
  enter(options = {}) {
    const selection = options.selection;
    if (!(selection instanceof Map)) return false;
    if (!selection.size) return false;
    const [[datumID, datum]] = selection.entries();   // the first thing in the selection

    if (DEBUG) {
      console.log(`ModeSelect: entering, selected ${datumID}`);  // eslint-disable-line no-console
    }

    this._selectedData = selection;
    this._active = true;

    const context = this.context;
    context.enableBehaviors(['hover', 'select', 'drag', 'map-interaction', 'lasso', 'paste']);

    const sidebar = context.ui().sidebar;
    let sidebarContent = null;

 // The update handlers feel like they should live with the noteEditor/errorEditor, not here
    // Selected a note...
    if (datum instanceof osmNote) {
      sidebarContent = uiNoteEditor(context).note(datum);
      sidebarContent
        .on('change', () => {
          context.map().immediateRedraw();  // force a redraw (there is no history change that would otherwise do this)
          if (!services.osm) return;
          const note = services.osm.getNote(datumID);
          if (!(note instanceof osmNote)) return;   // or - go to browse mode
          context.ui().sidebar.show(sidebarContent.note(note));
          this._selectedData.set(datumID, note);  // update selectedData after a change happens?
        });

    } else if (datum instanceof QAItem && datum.service === 'improveOSM') {
      sidebarContent = uiImproveOsmEditor(context).error(datum);
      sidebarContent
        .on('change', () => {
          context.map().immediateRedraw();  // force a redraw (there is no history change that would otherwise do this)
          if (!services.improveOSM) return;
          const error = services.improveOSM.getError(datumID);
          if (!(error instanceof QAItem)) return;  // or - go to browse mode?
          context.ui().sidebar.show(sidebarContent.error(error));
          this._selectedData.set(datumID, error);  // update selectedData after a change happens?
        });

    } else if (datum instanceof QAItem && datum.service === 'keepRight') {
      sidebarContent = uiKeepRightEditor(context).error(datum);
      sidebarContent
        .on('change', () => {
          context.map().immediateRedraw();  // force a redraw (there is no history change that would otherwise do this)
          if (!services.keepRight) return;
          const error = services.keepRight.getError(datumID);
          if (!(error instanceof QAItem)) return;  // or - go to browse mode?
          context.ui().sidebar.show(sidebarContent.error(error));
          this._selectedData.set(datumID, error);  // update selectedData after a change happens?
        });

    } else if (datum instanceof QAItem && datum.service === 'osmose') {
      sidebarContent = uiOsmoseEditor(context).error(datum);
      sidebarContent
        .on('change', () => {
          context.map().immediateRedraw();  // force a redraw (there is no history change that would otherwise do this)
          if (!services.osmose) return;
          const error = services.osmose.getError(datumID);
          if (!(error instanceof QAItem)) return;  // or - go to browse mode?
          context.ui().sidebar.show(sidebarContent.error(error));
          this._selectedData.set(datumID, error);  // update selectedData after a change happens?
        });

    // Selected custom data (e.g. gpx track)...
    } else if (datum.__featurehash__) {
      const dataEditor = uiDataEditor(context).datum(datum);
      sidebarContent = dataEditor;

    // Selected RapiD feature...
    } else if (datum.__fbid__) {
      this.keybinding = utilKeybinding('select-ai-features');
      const rapidInspector = uiRapidFeatureInspector(context, this.keybinding).datum(datum);
      sidebarContent = rapidInspector;
    }


    // Todo: build a sidebar UI for:
    //  multi selections - (support merge between types) or
    //  selections that are unrecognizable?

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

    if (this.keybinding) {
      d3_select(document)
      .call(this.keybinding.unbind);
      this.keybinding = null;
    }

    if (DEBUG) {
      console.log('ModeSelect: exiting');  // eslint-disable-line no-console
    }

    this._selectedData.clear();
    this.context.ui().sidebar.hide();
  }

}

