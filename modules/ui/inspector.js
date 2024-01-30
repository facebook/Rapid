import { interpolate as d3_interpolate } from 'd3-interpolate';
import { select as d3_select } from 'd3-selection';

import { uiEntityEditor } from './entity_editor.js';
import { uiPresetList } from './preset_list.js';
import { uiViewOnOSM } from './view_on_osm.js';


// The Inspector is a UI component for viewing/editing OSM Entities in the sidebar.
// It consists of two divs that can slide side to side (only one will be visible at a time):
//
// +--------+--------+
// |        |        |
// | Preset | Entity |
// |  List  | Editor |
// |        |        |
// |        |        |
// +--------+--------+
//

export function uiInspector(context) {
  const editor = context.systems.editor;
  const validator = context.systems.validator;

  const presetList = uiPresetList(context);
  const entityEditor = uiEntityEditor(context);

  let wrap = d3_select(null);
  let presetPane = d3_select(null);
  let editorPane = d3_select(null);
  let _selection;
  let _state = 'select';
  let _entityIDs;
  let _newFeature = false;

  // Add or replace merge handler
  editor.off('merge', _onMerge);
  editor.on('merge', _onMerge);


  // If the inspector is showing `_entityIDs` already,
  // and we get new versions of them loaded from the server
  // refresh this component and its children. Rapid#1311
  function _onMerge(newIDs) {
    if (!(newIDs instanceof Set)) return;
    if (!(Array.isArray(_entityIDs))) return;

    let needsRedraw = false;
    for (const entityID of _entityIDs) {
      if (newIDs.has(entityID)) {
        needsRedraw = true;
        break;
      }
    }

    if (needsRedraw) {
      render();
    }
  }


  function inspector(selection) {
    _selection = selection;
    render();
  }


  function render() {
    if (!_selection) return;  // called too soon?
    const graph = editor.staging.graph;

    presetList
      .entityIDs(_entityIDs)
      .autofocus(_newFeature)
      .on('choose', choice => inspector.setPreset(choice))
      .on('cancel', () => inspector.setPreset() );

    entityEditor
      .state(_state)
      .entityIDs(_entityIDs)
      .on('choose', selected => inspector.showPresetList(selected, true));  // true = animate in

    wrap = _selection.selectAll('.panewrap')
      .data([0]);

    let enter = wrap.enter()
      .append('div')
      .attr('class', 'panewrap');

    enter
      .append('div')
      .attr('class', 'preset-list-pane pane');

    enter
      .append('div')
      .attr('class', 'entity-editor-pane pane');

    wrap = wrap.merge(enter);
    presetPane = wrap.selectAll('.preset-list-pane');
    editorPane = wrap.selectAll('.entity-editor-pane');

    if (_shouldDefaultToPresetList()) {
      inspector.showPresetList();
    } else {
      inspector.showEntityEditor();
    }

    let footer = _selection.selectAll('.footer')
      .data([0]);

    footer = footer.enter()
      .append('div')
      .attr('class', 'footer')
      .merge(footer);

    footer
      .call(uiViewOnOSM(context)
        .what(graph.hasEntity(_entityIDs.length === 1 && _entityIDs[0]))
      );


    function _shouldDefaultToPresetList() {
      // always show the inspector on hover
      if (_state !== 'select') return false;

      // can only change preset on single selection
      if (_entityIDs.length !== 1) return false;

      const entityID = _entityIDs[0];
      const entity = graph.hasEntity(entityID);
      if (!entity) return false;

      // default to inspector if there are already tags
      if (entity.hasNonGeometryTags()) return false;

      // prompt to select preset if feature is new and untagged
      if (_newFeature) return true;

      // all existing features except vertices should default to inspector
      if (entity.geometry(graph) !== 'vertex') return false;

      // show vertex relations if any
      if (graph.parentRelations(entity).length) return false;

      // show vertex issues if there are any
      if (validator.getEntityIssues(entityID).length) return false;

      // show turn retriction editor for junction vertices
      if (entity.isHighwayIntersection(graph)) return false;

      // otherwise show preset list for uninteresting vertices
      return true;
    }
  }


  //
  // Show the preset list , optionally with given selected array, and optionally with a slide-in animation
  //
  inspector.showPresetList = function(selected, animate) {
    presetPane.classed('hide', false);

    if (animate) {
      wrap.transition()
        .styleTween('right', () => d3_interpolate('0%', '-100%'))
        .on('end', () => editorPane.classed('hide', true));
    } else {
      wrap.style('right', '-100%');
      editorPane.classed('hide', true);
    }

    if (Array.isArray(selected)) {
      presetList.selected(selected);
    }

    // render preset list, focus on input field in some situations
    presetPane
      .call(presetList.autofocus(_newFeature || animate));
  };


  //
  // Show the entity editor, optionally with the given presets, optionally with slide-in animation
  //
  inspector.showEntityEditor = function(presets, animate) {
    editorPane.classed('hide', false);

    if (animate) {
      wrap.transition()
        .styleTween('right', () => d3_interpolate('-100%', '0%'))
        .on('end', () => presetPane.classed('hide', true));
    } else {
      wrap.style('right', '0%');
      presetPane.classed('hide', true);
    }

    if (Array.isArray(presets)) {
      entityEditor.presets(presets);
    }

    editorPane
      .call(entityEditor);
  };


  //
  // Choose the given preset
  //
  inspector.setPreset = function(preset) {
    // upon choosing multipolygon, re-render the area preset list instead of the editor
    if (preset?.id === 'type/multipolygon') {
      inspector.showPresetList();
    } else {
      const choice = preset ? [preset] : null;
      const input = presetPane.select('.preset-search-input').node();
      input.value = '';
      inspector.showEntityEditor(choice, true);  // true = animate
    }
  };


  inspector.state = function(val) {
    if (!arguments.length) return _state;
    _state = val;
    entityEditor.state(_state);

    // remove any old field help overlay that might have gotten attached to the inspector
    context.container().selectAll('.field-help-body').remove();

    return inspector;
  };


  inspector.entityIDs = function(val) {
    if (!arguments.length) return _entityIDs;
    _entityIDs = val;
    return inspector;
  };


  inspector.newFeature = function(val) {
    if (!arguments.length) return _newFeature;
    _newFeature = val;
    return inspector;
  };


  return inspector;
}
