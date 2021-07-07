import { select as d3_select } from 'd3-selection';

import { t } from '../core/localizer';
import { behaviorBreathe, behaviorHover, behaviorLasso, behaviorSelect } from '../behavior';
import { modeBrowse, modeDragNode, modeDragNote } from '../modes';
import { services } from '../services';
import { uiRapidFeatureInspector } from '../ui';
import { utilKeybinding } from '../util';

let _expandedOnce = false;


export function modeRapidSelectFeatures(context, selectedDatum) {
  let mode = {
    id: 'select-ai-features',
    button: 'browse'
  };

  const keybinding = utilKeybinding('select-ai-features');
  const rapidInspector = uiRapidFeatureInspector(context, keybinding);
  const service = getService(selectedDatum.__service__);
  const rapidGraph = service.graph(selectedDatum.__datasetid__);

  let behaviors = [
    behaviorBreathe(context),
    behaviorHover(context),
    behaviorSelect(context),
    behaviorLasso(context),
    modeDragNode(context).behavior,
    modeDragNote(context).behavior
  ];


  // class the data as selected, or return to browse mode if the data is gone
  function selectData(d3_event, drawn) {
    let selection = context.surface().selectAll('.layer-ai-features .data' + selectedDatum.__fbid__);

    if (selection.empty()) {
      // Return to browse mode if selected DOM elements have
      // disappeared because the user moved them out of view..
      const source = d3_event && d3_event.type === 'zoom' && d3_event.sourceEvent;
      if (drawn && source && (source.type === 'mousemove' || source.type === 'touchmove')) {
        context.enter(modeBrowse(context));
      }
    } else {
      selection.classed('selected', true);
    }
  }


  function esc() {
    if (d3_select('.combobox').size()) return;
    context.enter(modeBrowse(context));
  }

  function getService(serviceName) {
    let service;
    switch (serviceName) {
      case 'esri':
        service = services.esriData;
        break;
      case 'fbml_streetview':
        service = services.fbStreetviewSuggestions;
        break;
      default:
        service = services.fbMLRoads;
    }
    return service;
  }

  mode.selectedIDs = function() {
    return [selectedDatum.id];
  };


  mode.selectedDatum = function() {
    return selectedDatum;
  };


  mode.zoomToSelected = function() {
    const extent = selectedDatum.extent(rapidGraph);
    context.map().centerZoomEase(extent.center(), context.map().trimmedExtentZoom(extent));
  };


  mode.enter = function() {
    behaviors.forEach(context.install);

    keybinding
      .on(t('inspector.zoom_to.key'), mode.zoomToSelected)
      .on('⎋', esc, true);

    d3_select(document)
      .call(keybinding);

    selectData();

    const sidebar = context.ui().sidebar;
    sidebar.show(rapidInspector.datum(selectedDatum));

    if (!_expandedOnce) {
      // Expand sidebar at least once per session to inform user how to
      // accept and reject proposed roads.
      _expandedOnce = true;
      // expand the sidebar, avoid obscuring the data if needed
      // const extent = selectedDatum.extent(rapidGraph);
      // sidebar.expand(sidebar.intersects(extent));
    }

    context.map()
      .on('drawn.select-ai-features', selectData);
  };


  mode.exit = function() {
    behaviors.forEach(context.uninstall);

    d3_select(document)
      .call(keybinding.unbind);

    context.surface()
      .selectAll('.layer-ai-features .selected')
      .classed('selected hover', false);

context.container().selectAll('.over-map .rapid-image-strip')
      .attr('style', 'display: none;');

    context.map()
      .on('drawn.select-ai-features', null);

    context.ui().sidebar
      .hide();
  };


  return mode;
}
