import { interpolate as d3_interpolate } from 'd3-interpolate';
import { select as d3_select } from 'd3-selection';

import { uiEntityEditor } from './entity_editor.js';
import { uiPresetList } from './preset_list.js';
import { uiViewOnOSM } from './view_on_osm.js';


/**
 * uiInspector
 * The Inspector is a UI component for viewing/editing OSM Entities in the sidebar.
 * It consists of two divs that can slide side to side (only one will be visible at a time):
 *
 * +--------+--------+
 * |        |        |
 * | Preset | Entity |
 * |  List  | Editor |
 * |        |        |
 * |        |        |
 * +--------+--------+
 */
export function uiInspector(context) {
  const editor = context.systems.editor;
  const validator = context.systems.validator;

  const presetList = uiPresetList(context);
  const entityEditor = uiEntityEditor(context);

  let _selection;
  let _paneWrap = d3_select(null);
  let _presetPane = d3_select(null);
  let _editorPane = d3_select(null);

  let _state = '';       // can be 'hide', 'hover', or 'select'
  let _entityIDs = [];
  let _newFeature = false;

  // Add or replace merge handler
  editor.off('merge', _onMerge);
  editor.on('merge', _onMerge);


  // If the inspector is showing `_entityIDs` already,
  // and we get new versions of them loaded from the server
  // refresh this component and its children. Rapid#1311
  function _onMerge(newIDs) {
    if (!(newIDs instanceof Set)) return;
    if (!_entityIDs.length) return;

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

    // inspector-wrap
    let inspectorWrap = _selection.selectAll('.inspector-wrap')
      .data([0]);

    const inspectorWrapEnter = inspectorWrap.enter()
      .append('div')
      .attr('class', 'inspector-wrap inspector-hidden');

    inspectorWrap = inspectorWrap.merge(inspectorWrapEnter);

    inspectorWrap
      .classed('inspector-hidden', !_entityIDs.length)


    // panewrap
    _paneWrap = inspectorWrap.selectAll('.panewrap')
      .data([0]);

    const paneWrapEnter = _paneWrap.enter()
      .append('div')
      .attr('class', 'panewrap');

    paneWrapEnter
      .append('div')
      .attr('class', 'preset-list-pane pane');

    paneWrapEnter
      .append('div')
      .attr('class', 'entity-editor-pane pane');

    _paneWrap = _paneWrap.merge(paneWrapEnter);

    _presetPane = _paneWrap.selectAll('.preset-list-pane');
    _editorPane = _paneWrap.selectAll('.entity-editor-pane');

    if (_shouldDefaultToPresetList()) {
      inspector.showPresetList();
    } else {
      inspector.showEntityEditor();
    }

    const entityID = graph.hasEntity(_entityIDs.length === 1 && _entityIDs[0]);
    let footer = inspectorWrap.selectAll('.sidebar-footer')
      .data([entityID]);

    footer.exit()
      .remove();

    footer = footer.enter()
      .append('div')
      .attr('class', 'sidebar-footer')
      .merge(footer);

    footer
      .call(uiViewOnOSM(context).what(entityID));


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
    _presetPane.classed('hide', false);

    if (animate) {
      _paneWrap.transition()
        .styleTween('right', () => d3_interpolate('0%', '-100%'))
        .on('end', () => _editorPane.classed('hide', true));
    } else {
      _paneWrap.style('right', '-100%');
      _editorPane.classed('hide', true);
    }

    if (Array.isArray(selected)) {
      presetList.selected(selected);
    }

    // render preset list, focus on input field in some situations
    _presetPane
      .call(presetList.autofocus(_newFeature || animate));
  };


  //
  // Show the entity editor, optionally with the given presets, optionally with slide-in animation
  //
  inspector.showEntityEditor = function(presets, animate) {
    _editorPane.classed('hide', false);

    if (animate) {
      _paneWrap.transition()
        .styleTween('right', () => d3_interpolate('-100%', '0%'))
        .on('end', () => _presetPane.classed('hide', true));
    } else {
      _paneWrap.style('right', '0%');
      _presetPane.classed('hide', true);
    }

    if (Array.isArray(presets)) {
      entityEditor.presets(presets);
    }

    _editorPane
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
      const input = _presetPane.select('.preset-search-input').node();
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
    _entityIDs = val ?? [];
    return inspector;
  };


  inspector.newFeature = function(val) {
    if (!arguments.length) return _newFeature;
    _newFeature = val;
    return inspector;
  };


  return inspector;
}
