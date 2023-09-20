import { utilArrayIdentical } from '@rapid-sdk/util';

import { actionChangePreset } from '../actions';
import { actionNoop } from '../actions/noop';
import { KeyOperationBehavior } from '../behaviors/KeyOperationBehavior';

let _wasSelectedIDs = [];
let _wasPresetIDs = [];


export function operationCycleHighwayTag(context, selectedIDs) {
  const editor = context.systems.editor;
  const graph = editor.current.graph;
  const l10n = context.systems.l10n;
  const presets = context.systems.presets;

  // Allow cycling through lines that match these presets
  const allowPresetRegex = [
    /^highway\/(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|track)/,
    /^line$/
  ];

  const defaultPresetIDs = [
    'highway/residential',
    'highway/service',
    'highway/track',
    'highway/unclassified',
    'highway/tertiary',
    'line'
  ];

  // same selection as before?
  const isSameSelection = utilArrayIdentical(selectedIDs, _wasSelectedIDs);
  const presetIDs = new Set(isSameSelection ? _wasPresetIDs : defaultPresetIDs);

  // Gather current entities allowed to be cycled
  const entities = selectedIDs
    .map(entityID => graph.hasEntity(entityID))
    .filter(entity => {
      if (entity?.type !== 'way') return false;

      const preset = presets.match(entity, graph);
      if (allowPresetRegex.some(regex => regex.test(preset.id))) {
        if (!presetIDs.has(preset.id)) presetIDs.add(preset.id);  // make sure we can cycle back to the original preset
        return true;
      } else {
        return false;
      }
    });

  _wasSelectedIDs = selectedIDs.slice();  // copy
  _wasPresetIDs = Array.from(presetIDs);  // copy


  let operation = function() {
    if (!entities.length) return;

    // If this is the same selection as before, and the previous edit was also a cycle-tags,
    // skip this `perform`, then all tag updates will be coalesced into the previous edit.
    const annotation = operation.annotation();
    if (!isSameSelection || editor.undoAnnotation() !== annotation) {
      // Start with a no-op edit that will be replaced by all the tag updates we end up doing.
      editor.perform(actionNoop(), annotation);
    }

    // Pick the next preset..
    const currPresetIDs = Array.from(presetIDs);
    const currPreset = presets.match(entities[0], editor.current.graph);
    const index = currPreset ? currPresetIDs.indexOf(currPreset.id) : -1;
    const newPresetID = currPresetIDs[(index + 1) % currPresetIDs.length];
    const newPreset = presets.item(newPresetID);

    // Update all selected highways...
    for (const entity of entities) {
      const oldPreset = presets.match(entity, editor.current.graph);
      const action = actionChangePreset(entity.id, oldPreset, newPreset, true /* skip field defaults */);
      editor.replace(action, annotation);
    }

    context.enter('select-osm', { selectedIDs: selectedIDs });  // reselect
  };


  operation.available = function() {
    return entities.length > 0;
  };


  operation.disabled = function() {
    return false;
  };


  operation.tooltip = function() {
    const disabledReason = operation.disabled();
    return disabledReason ?
      l10n.t(`operations.cycle_highway_tag.${disabledReason}`) :
      l10n.t('operations.cycle_highway_tag.description');
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
