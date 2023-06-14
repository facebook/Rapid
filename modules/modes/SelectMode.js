import { select as d3_select } from 'd3-selection';
import { geoBounds as d3_geoBounds } from 'd3-geo';
import { Extent } from '@rapid-sdk/math';

import { AbstractMode } from './AbstractMode';
import { osmNote, QAItem } from '../osm';
import { uiDataEditor } from '../ui/data_editor';
import { uiImproveOsmEditor } from '../ui/improveOSM_editor';
import { uiKeepRightEditor } from '../ui/keepRight_editor';
import { uiNoteEditor } from '../ui/note_editor';
import { uiOsmoseEditor } from '../ui/osmose_editor';
import { uiRapidFeatureInspector } from '../ui/rapid_feature_inspector';
import { utilKeybinding } from '../util';

const DEBUG = false;


/**
 * `SelectMode`
 * In this mode, the user has selected one or more things.
 * - `selectedData` contains the information about what is selected.
 * - The sidebar shows something depending on what the selection contains.
 * - We also can set up the "operations" allowed (right click edit menu)
 */
export class SelectMode extends AbstractMode {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'select';

    this.keybinding = null;
    this.extent = null;
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
      console.log(`SelectMode: entering, selected ${datumID}`);  // eslint-disable-line no-console
    }

    this._selectedData = selection;
    this._active = true;

    const context = this.context;
    context.enableBehaviors(['hover', 'select', 'drag', 'map-interaction', 'lasso', 'paste']);

    const sidebar = context.ui().sidebar;
    let sidebarContent = null;

    // Compute the total extent of selected items
    this.extent = new Extent();

    for (const datum of selection.values()) {
      let other;

      if (datum.loc) {   // OSM Note or QA Item
        other = new Extent(datum.loc);

      } else if (datum.__featurehash__) {   // Custom GeoJSON feature
        const bounds = d3_geoBounds(datum);
        other = new Extent(bounds[0], bounds[1]);

      } else if (datum.__fbid__) {  // Rapid feature
        const service = context.services.get(datum.__service__);
        if (!service) continue;
        const graph = service.graph(datum.__datasetid__);
        if (!graph) continue;
        other = datum.extent(graph);
      }

      if (other) {
        this.extent = this.extent.extend(other);
      }
    }


 // The update handlers feel like they should live with the noteEditor/errorEditor, not here
    // Selected a note...
    if (datum instanceof osmNote) {
      sidebarContent = uiNoteEditor(context).note(datum);
      sidebarContent
        .on('change', () => {
          context.mapSystem().immediateRedraw();  // force a redraw (there is no history change that would otherwise do this)
          const osm = context.services.get('osm');
          const note = osm?.getNote(datumID);
          if (!(note instanceof osmNote)) return;   // or - go to browse mode
          context.ui().sidebar.show(sidebarContent.note(note));
          this._selectedData.set(datumID, note);  // update selectedData after a change happens?
        });

    } else if (datum instanceof QAItem && datum.service === 'improveOSM') {
      sidebarContent = uiImproveOsmEditor(context).error(datum);
      sidebarContent
        .on('change', () => {
          context.mapSystem().immediateRedraw();  // force a redraw (there is no history change that would otherwise do this)
          const improveosm = context.services.get('improveOSM');
          const error = improveosm?.getError(datumID);
          if (!(error instanceof QAItem)) return;  // or - go to browse mode?
          context.ui().sidebar.show(sidebarContent.error(error));
          this._selectedData.set(datumID, error);  // update selectedData after a change happens?
        });

    } else if (datum instanceof QAItem && datum.service === 'keepRight') {
      sidebarContent = uiKeepRightEditor(context).error(datum);
      sidebarContent
        .on('change', () => {
          context.mapSystem().immediateRedraw();  // force a redraw (there is no history change that would otherwise do this)
          const keepright = context.services.get('keepRight');
          const error = keepright?.getError(datumID);
          if (!(error instanceof QAItem)) return;  // or - go to browse mode?
          context.ui().sidebar.show(sidebarContent.error(error));
          this._selectedData.set(datumID, error);  // update selectedData after a change happens?
        });

    } else if (datum instanceof QAItem && datum.service === 'osmose') {
      sidebarContent = uiOsmoseEditor(context).error(datum);
      sidebarContent
        .on('change', () => {
          context.mapSystem().immediateRedraw();  // force a redraw (there is no history change that would otherwise do this)
          const osmose = context.services.get('osmose');
          const error = osmose?.getError(datumID);
          if (!(error instanceof QAItem)) return;  // or - go to browse mode?
          context.ui().sidebar.show(sidebarContent.error(error));
          this._selectedData.set(datumID, error);  // update selectedData after a change happens?
        });

    // Selected custom data (e.g. gpx track)...
    } else if (datum.__featurehash__) {
      const dataEditor = uiDataEditor(context).datum(datum);
      sidebarContent = dataEditor;

    // Selected Rapid feature...
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

    this.extent = null;

    if (this.keybinding) {
      d3_select(document).call(this.keybinding.unbind);
      this.keybinding = null;
    }

    if (DEBUG) {
      console.log('SelectMode: exiting');  // eslint-disable-line no-console
    }

    this._selectedData.clear();
    this.context.ui().sidebar.hide();
  }

}

