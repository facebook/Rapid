import { utilArrayIdentical } from '@rapid-sdk/util';

import { actionChangePreset } from '../actions';
import { KeyOperationBehavior } from '../behaviors/KeyOperationBehavior';

let _lastSelectedIDs = [];

// If the presetID matches any of these, we can cycle through highways
const highwayPresetRegex = [
  /^highway\/(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|track)/,
  /^line$/,   // untagged line
];

const highwayPresetIDs = [
  'highway/residential',
  'highway/service',
  'highway/track',
  'highway/unclassified',
  'highway/tertiary',
  'line',
];

// If the presetID matches any of these, we can cycle through crossings
const crossingPresetRegex = [
  /^highway\/footway\/crossing\//,
];

const crossingPresetIDs = [
  'highway/footway/crossing/unmarked',
  'highway/footway/crossing/marked',
  'highway/footway/crossing/zebra',
  'highway/footway/crossing/lines',
  'highway/footway/crossing/ladder',
  'highway/footway/crossing/dashes',
  'highway/footway/crossing/dots',
  'highway/footway/crossing/ladder:skewed'
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
    if (entity?.type !== 'way') continue;

    const preset = presets.match(entity, graph);
    const isHighway = highwayPresetRegex.some(regex => regex.test(preset.id));
    const isCrossing = crossingPresetRegex.some(regex => regex.test(preset.id));

    if (isHighway) {
      _entities.push(entity);
      if (!_presetIDs) {
        _presetIDs = highwayPresetIDs;
        _annotation = l10n.t('operations.cycle_highway_tag.highway_annotation');
      } else if (_presetIDs !== highwayPresetIDs) {  // mix of highways and crossings, bail out
        _entities = []; _presetIDs = null; _annotation = ''; break;
      }
    }

    if (isCrossing) {
      _entities.push(entity);
      if (!_presetIDs) {
        _presetIDs = crossingPresetIDs;
        _annotation = l10n.t('operations.cycle_highway_tag.crosswalk_annotation');
      } else if (_presetIDs !== crossingPresetIDs) {  // mix of highways and crossings, bail out
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
