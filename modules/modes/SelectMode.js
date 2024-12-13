import { geoBounds } from 'd3-geo';
import { Extent } from '@rapid-sdk/math';

import { AbstractMode } from './AbstractMode.js';
import { QAItem } from '../osm/index.js';
import { uiOsmoseEditor } from '../ui/osmose_editor.js';
import { uiDataEditor } from '../ui/data_editor.js';
import { uiDetectionInspector } from '../ui/detection_inspector.js';
import { uiKeepRightEditor } from '../ui/keepRight_editor.js';
import { uiNoteEditor } from '../ui/note_editor.js';
import { uiMapRouletteEditor } from '../ui/maproulette_editor.js';
import { uiMapRouletteMenu } from '../ui/maproulette_menu.js';

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
    const gfx = context.systems.gfx;
    const photos = context.systems.photos;
    const scene = gfx.scene;
    const Sidebar = context.systems.ui.Sidebar;

    context.enableBehaviors(['hover', 'select', 'drag', 'mapInteraction', 'lasso', 'paste']);

    // Compute the total extent of selected items
    this.extent = new Extent();
    for (const datum of selection.values()) {
      let other;

      if (datum.loc) {   // OSM Note or QA Item
        other = new Extent(datum.loc);

      } else if (datum.__featurehash__) {   // Custom GeoJSON feature
        const bounds = geoBounds(datum);
        other = new Extent(bounds[0], bounds[1]);

      } else if (datum.__fbid__) {  // Rapid feature
        const service = context.services[datum.__service__];
        if (!service) continue;
        const graph = service.graph(datum.__datasetid__);
        if (!graph) continue;
        other = datum.extent(graph);
      }

      if (other) {
        this.extent = this.extent.extend(other);
      }
    }

    // Handle select style class
    scene.clearClass('select');
    for (const datum of selection.values()) {
      let layerID = null;

      // hacky - improve?
      if (datum instanceof QAItem) {       // in most cases the `service` is the layerID
        const serviceID = datum.service;   // 'keepright', 'osmose', etc.
        layerID = serviceID === 'osm' ? 'notes' : serviceID;
        if (layerID === 'osm') layerID = 'notes';
      } else if (datum.__fbid__) {      // a Rapid feature
        layerID = 'rapid';
      } else if (datum.overture) {  // Overture data
        layerID = 'rapid';
      } else if (datum.__featurehash__) {  // custom data
        layerID = 'custom-data';
      } else if (datum.type === 'detection') {   // A detection (object or sign)
        if (datum.service === 'mapillary' && datum.object_type === 'point') {
          layerID = 'mapillary-detections';
        } else if (datum.service === 'mapillary' && datum.object_type === 'traffic_sign') {
          layerID = 'mapillary-signs';
        }
      }

      if (layerID) {
        scene.setClass('select', layerID, datumID);
      }
    }


    // What was selected?
    Sidebar.reset();
 // The update handlers feel like they should live with the sidebar content components, not here
    let sidebarContent = null;
    // Selected a note...
    if (datum instanceof QAItem && datum.service === 'osm') {
      sidebarContent = uiNoteEditor(context).note(datum);
      sidebarContent
        .on('change', () => {
          gfx.immediateRedraw();  // force a redraw (there is no history change that would otherwise do this)
          const osm = context.services.osm;
          const note = osm?.getNote(datumID);
          if (!(note instanceof QAItem)) return;   // or - go to browse mode
          Sidebar.show(sidebarContent.note(note));
          this._selectedData.set(datumID, note);  // update selectedData after a change happens?
        });

    } else if (datum instanceof QAItem && datum.service === 'keepRight') {
      sidebarContent = uiKeepRightEditor(context).error(datum);
      sidebarContent
        .on('change', () => {
          gfx.immediateRedraw();  // force a redraw (there is no history change that would otherwise do this)
          const keepright = context.services.keepRight;
          const error = keepright?.getError(datumID);
          if (!(error instanceof QAItem)) return;  // or - go to browse mode?
          Sidebar.show(sidebarContent.error(error));
          this._selectedData.set(datumID, error);  // update selectedData after a change happens?
        });

    } else if (datum instanceof QAItem && datum.service === 'osmose') {
      sidebarContent = uiOsmoseEditor(context).error(datum);
      sidebarContent
        .on('change', () => {
          gfx.immediateRedraw();  // force a redraw (there is no history change that would otherwise do this)
          const osmose = context.services.osmose;
          const error = osmose?.getError(datumID);
          if (!(error instanceof QAItem)) return;  // or - go to browse mode?
          Sidebar.show(sidebarContent.error(error));
          this._selectedData.set(datumID, error);  // update selectedData after a change happens?
        });

    } else if (datum instanceof QAItem && datum.service === 'maproulette') {
      sidebarContent = uiMapRouletteEditor(context).error(datum);
      let uiSystem = this.context.systems.ui;
      uiSystem.MapRouletteMenu.error(datum);
      sidebarContent
        .on('change', () => {
          gfx.immediateRedraw();  // force a redraw (there is no history change that would otherwise do this)
          const maproulette = context.services.maproulette;
          const error = maproulette?.getError(datumID);
          if (!(error instanceof QAItem)) return;  // or - go to browse mode?
          Sidebar.show(sidebarContent.error(error));
          this._selectedData.set(datumID, error);  // update selectedData after a change happens?
        });

    } else if (datum.type === 'detection') {
      sidebarContent = uiDetectionInspector(context).datum(datum);
      const serviceID = datum.service;
      const type = (datum.object_type === 'traffic_sign') ? 'signs' : 'detections';
      const layerID = `${serviceID}-${type}`;    // e.g. 'mapillary-signs' or 'mapillary-detections'
      photos.selectDetection(layerID, datum.id);

    // Selected custom data (e.g. gpx track)...
    } else if (datum.__featurehash__) {
      sidebarContent = uiDataEditor(context).datum(datum);

    // Selected Overture feature...
    } else if (datum.overture) {
      Sidebar.OvertureInspector.datum = datum;
      sidebarContent = Sidebar.OvertureInspector.render;

    // Selected Rapid feature...
    } else if (datum.__fbid__) {
      Sidebar.RapidInspector.datum = datum;
      sidebarContent = Sidebar.RapidInspector.render;
    }

    // Todo: build a sidebar UI for:
    //  multi selections - (support merge between types) or
    //  selections that are unrecognizable?

    // setup the sidebar
    if (sidebarContent) {
      Sidebar.show(sidebarContent); //.newNote(_newFeature));
      // Attempt to expand the sidebar, avoid obscuring the selected thing if we can..
      // For this to work the datum must have an extent already
      // Sidebar.expand(Sidebar.intersects(datum.extent()));
    }

    return true;
  }


  /**
   * exit
   */
  exit() {
    if (!this._active) return;
    this._active = false;

    const context = this.context;
    const photos = context.systems.photos;
    const scene = context.systems.gfx.scene;
    const Sidebar = context.systems.ui.Sidebar;

    this.extent = null;

    if (DEBUG) {
      console.log('SelectMode: exiting');  // eslint-disable-line no-console
    }

    this._selectedData.clear();
    scene.clearClass('select');
    Sidebar.hide();
    photos.selectDetection(null);
  }

}
