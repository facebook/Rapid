import { utilArrayIdentical } from '@rapid-sdk/util';

import { actionChangePreset } from '../actions';
import { KeyOperationBehavior } from '../behaviors/KeyOperationBehavior';

let _wasSelectedIDs = [];
let _wasPresetIDs = [];

export function operationCycleHighwayTag(context, selectedIDs) {
  const editor = context.systems.editor;
  const graph = editor.staging.graph;
  const l10n = context.systems.l10n;
  const presets = context.systems.presets;

  // Allow cycling through lines that match these presets
  const allowHighwayPresetRegex = [
    /^highway\/(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|track)/,
    /^line$/,
  ];

  const defaultHighwayPresetIDs = [
    'highway/residential',
    'highway/service',
    'highway/track',
    'highway/unclassified',
    'highway/tertiary',
    'line',
  ];

  // Allow cycling through crossings that match these presets
  const allowCrossingPresetRegex = [
    /^crossing\/(unmarked|marked|marked:zebra|marked:lines|marked:dashes|marked:ladder|marked:dots|marked:ladder:skewed)/,
  ];

  const defaultCrossingPresetIDs = [
    'crossing/unmarked;crossing:markings=no',
    'crossing/marked;crossing:markings=yes',
    'crossing/marked;crossing:markings=zebra',
    'crossing/marked;crossing:markings=lines',
    'crossing/marked;crossing:markings=ladder',
    'crossing/marked;crossing:markings=dashes',
    'crossing/marked;crossing:markings=dots',
    'crossing/marked;crossing:markings=ladder:skewed',
  ];

   //Do not allow multi-select.
  if (selectedIDs.length > 1) return false;

  const selectedID = selectedIDs[0];
  const entity = graph.hasEntity(selectedID);

  // Check if selection is highway or crossing
  const isCrosswalkSelection = entity.tags.footway === 'crossing' && entity.tags.highway === 'footway';
  const isHighwaySelection = !entity.tags.footway === 'crossing' && !!entity.tags.highway;


  // Define the preset IDs based on the selection type
  let presetIDs;

  // Declare isSameSelection here
  let isSameSelection = utilArrayIdentical(selectedIDs, _wasSelectedIDs);

  if (isCrosswalkSelection) {
    presetIDs = defaultCrossingPresetIDs;
  } else if (isHighwaySelection) {
    presetIDs = isSameSelection ? _wasPresetIDs : defaultHighwayPresetIDs;
  } else {
    return;
  }

  _wasPresetIDs = presetIDs;

  // Gather selected entities allowed to be cycled
  const entities = selectedIDs
    .map(entityID => graph.hasEntity(entityID))
    .filter(entity => {
      if (entity?.type !== 'way') return false;

      const preset = presets.match(entity, graph);
      // Check if the preset matches either allowHighwayPresetRegex or allowCrossingPresetRegex
      if (
        allowHighwayPresetRegex.some(regex => regex.test(preset.id)) ||
        allowCrossingPresetRegex.some(regex => regex.test(preset.id))
      ) {
        return true;
      }
      return false;
    });

  _wasSelectedIDs = selectedIDs.slice(); // copy

  let operation = function() {
    if (!entities.length) return;

    // Pick the next preset...
    const currPresetIDs = Array.from(presetIDs);
    const currPreset = presets.match(entities[0], editor.staging.graph);
    const index = currPreset ? currPresetIDs.indexOf(currPreset.id) : -1;
    const newPresetID = currPresetIDs[(index + 1) % currPresetIDs.length];
    const newPreset = presets.item(newPresetID);

    editor.beginTransaction();

    // Update all selected highways...
    for (const entity of entities) {
      const oldPreset = presets.match(entity, editor.staging.graph);
      const action = actionChangePreset(entity.id, oldPreset, newPreset, true /* skip field defaults */);
      editor.perform(action);
    }

    // Determine the appropriate annotation based on the selection type
    const annotationKey = isCrosswalkSelection ? 'crosswalk_annotation' : 'highway_annotation';
    const annotation = l10n.t(`operations.cycle_highway_tag.${annotationKey}`);

    const options = { annotation: annotation, selectedIDs: selectedIDs };
    if (isSameSelection && editor.getUndoAnnotation() === annotation) {
      editor.commitAppend(options);
    } else {
      editor.commit(options);
    }

    editor.endTransaction();
    context.enter('select-osm', { selection: { osm: selectedIDs } }); // reselect
  };

  operation.available = function() {
    return entities.length > 0;
  };

  operation.disabled = function() {
    return false;
  };

  operation.tooltip = function() {
    const disabledReason = operation.disabled();
    return disabledReason
      ? l10n.t(`operations.cycle_highway_tag.${disabledReason}`)
      : l10n.t('operations.cycle_highway_tag.description');
  };

  operation.annotation = function() {
    return l10n.t('operations.cycle_highway_tag.annotation');
  };

  operation.id = 'cycle_highway_tag';
  operation.keys = [ '⇧' + l10n.t('operations.cycle_highway_tag.key') ];
  operation.title = l10n.t('operations.cycle_highway_tag.title');
  operation.behavior = new KeyOperationBehavior(context, operation);

  return operation;
}
