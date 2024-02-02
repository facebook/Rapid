import { utilArrayIdentical } from '@rapid-sdk/util';

import { actionChangePreset } from '../actions/change_preset.js';
import { KeyOperationBehavior } from '../behaviors/KeyOperationBehavior.js';

let _lastSelectedIDs = [];

// If the presetID matches any of these, we can cycle through highways
const highwayLinePresetRegex = [
  /^highway\/(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|track)/,
  /^line$/,   // untagged line
];

const highwayLinePresetIDs = [
  'highway/residential',
  'highway/service',
  'highway/service/driveway',
  'highway/track',
  'highway/unclassified',
  'highway/tertiary',
  'line'
];

// If the presetID matches any of these, we can cycle through line crossings
const crossingLinePresetRegex = [
  /^highway\/footway\/(crossing|sidewalk)/,
  /^highway\/footway$/
];

const crossingLinePresetIDs = [
  'highway/footway/crossing2/dashes',
  'highway/footway/crossing2/dots',
  'highway/footway/crossing2/ladder',
  'highway/footway/crossing2/ladder:skewed',
  'highway/footway/crossing2/lines',
  'highway/footway/crossing2/surface',
  'highway/footway/crossing2/unmarked',
  'highway/footway/crossing2/zebra',
  'highway/footway/crossing2/other'
];

// If the presetID matches any of these, we can cycle through vertex crossings
const crossingVertexPresetRegex = [
  /^highway\/crossing/
];

const crossingVertexPresetIDs = [
  'highway/crossing2/dashes',
  'highway/crossing2/dots',
  'highway/crossing2/ladder',
  'highway/crossing2/ladder:skewed',
  'highway/crossing2/lines',
  'highway/crossing2/surface',
  'highway/crossing2/unmarked',
  'highway/crossing2/zebra',
  'highway/crossing2/other'
];


export function operationCycleHighwayTag(context, selectedIDs) {
  const editor = context.systems.editor;
  const graph = editor.staging.graph;
  const l10n = context.systems.l10n;
  const presets = context.systems.presets;

  // Gather eligible entities and determine which list we are cycling through..
  let _entities = [];
  let _presetIDs = null;
  let _annotation = null;

  for (const entityID of selectedIDs) {
    const entity = graph.hasEntity(entityID);
    if (!entity) continue;

    const geometry = entity.geometry(graph);
    const preset = presets.match(entity, graph);
    const isHighwayLine = (geometry === 'line' && highwayLinePresetRegex.some(regex => regex.test(preset.id)));
    const isCrossingLine = (geometry === 'line' && crossingLinePresetRegex.some(regex => regex.test(preset.id)));
    const isCrossingVertex = (geometry === 'vertex' && crossingVertexPresetRegex.some(regex => regex.test(preset.id)));

    if (isHighwayLine) {
      _entities.push(entity);
      if (!_presetIDs) {   // lock it in
        _presetIDs = highwayLinePresetIDs;
        _annotation = l10n.t('operations.cycle_highway_tag.highway_annotation');
      } else if (_presetIDs !== highwayLinePresetIDs) {   // mix of types, bail out
        _entities = []; _presetIDs = null; _annotation = ''; break;
      }
    }

    if (isCrossingLine) {
      _entities.push(entity);
      if (!_presetIDs) {  // lock it in
        _presetIDs = crossingLinePresetIDs;
        _annotation = l10n.t('operations.cycle_highway_tag.crosswalk_annotation');
      } else if (_presetIDs !== crossingLinePresetIDs) {   // mix of types, bail out
        _entities = []; _presetIDs = null; _annotation = ''; break;
      }
    }

    if (isCrossingVertex) {
      _entities.push(entity);
      if (!_presetIDs) {  // lock it in
        _presetIDs = crossingVertexPresetIDs;
        _annotation = l10n.t('operations.cycle_highway_tag.crosswalk_annotation');
      } else if (_presetIDs !== crossingVertexPresetIDs) {   // mix of types, bail out
        _entities = []; _presetIDs = null; _annotation = ''; break;
      }
    }
  }

  // If the user has the same selection as before, we continue through the cycle..
  const isSameSelection = utilArrayIdentical(selectedIDs, _lastSelectedIDs);
  if (!isSameSelection) {
    _lastSelectedIDs = selectedIDs.slice();  // take copy
  }


  let operation = function () {
    if (!_entities.length || !_presetIDs) return;

    // Pick the next preset in the cycle...
    let graph = editor.staging.graph;
    const currPreset = presets.match(_entities[0], graph);
    const index = currPreset ? _presetIDs.indexOf(currPreset.id) : -1;
    const newPresetID = _presetIDs[(index + 1) % _presetIDs.length];
    const newPreset = presets.item(newPresetID);

    editor.beginTransaction();

    // Update all eligible entities...
    for (const entity of _entities) {
      graph = editor.staging.graph;   // note that staging graph changes each time we call perform
      const oldPreset = presets.match(entity, graph);
      const action = actionChangePreset(entity.id, oldPreset, newPreset, true /* skip field defaults */);
      editor.perform(action);
    }

    const options = { annotation: _annotation, selectedIDs: selectedIDs };
    if (isSameSelection && editor.getUndoAnnotation() === _annotation) {
      editor.commitAppend(options);
    } else {
      editor.commit(options);
    }

    editor.endTransaction();
    context.enter('select-osm', { selection: { osm: selectedIDs } });  // reselect
  };


  operation.available = function () {
    return _entities.length > 0 && _presetIDs;
  };


  operation.disabled = function () {
    return false;
  };


  operation.tooltip = function () {
    return l10n.t('operations.cycle_highway_tag.description');
  };


  operation.annotation = function () {
    return _annotation;
  };


  operation.id = 'cycle_highway_tag';
  operation.keys = ['⇧' + l10n.t('operations.cycle_highway_tag.key')];
  operation.title = l10n.t('operations.cycle_highway_tag.title');
  operation.behavior = new KeyOperationBehavior(context, operation);

  return operation;
}
