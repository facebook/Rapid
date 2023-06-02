import { utilArrayIdentical } from '@rapid-sdk/util';

import { actionChangePreset } from '../actions';
import { actionNoop } from '../actions/noop';
import { BehaviorKeyOperation } from '../behaviors/BehaviorKeyOperation';
import { modeSelect } from '../modes/select';

let _wasSelectedIDs = [];
let _wasPresetIDs = [];


export function operationCycleHighwayTag(context, selectedIDs) {
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
  const presetSystem = context.presetSystem();

  // Gather current entities allowed to be cycled
  const entities = selectedIDs
    .map(entityID => context.hasEntity(entityID))
    .filter(entity => {
      if (entity?.type !== 'way') return false;

      const preset = presetSystem.match(entity, context.graph());
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
    if (!isSameSelection || context.editSystem().undoAnnotation() !== annotation) {
      // Start with a no-op edit that will be replaced by all the tag updates we end up doing.
      context.perform(actionNoop(), annotation);
    }

    // Pick the next preset..
    const currPresetIDs = Array.from(presetIDs);
    const currPreset = presetSystem.match(entities[0], context.graph());
    const index = currPreset ? currPresetIDs.indexOf(currPreset.id) : -1;
    const newPresetID = currPresetIDs[(index + 1) % currPresetIDs.length];
    const newPreset = presetSystem.item(newPresetID);

    // Update all selected highways...
    for (const entity of entities) {
      const oldPreset = presetSystem.match(entity, context.graph());
      const action = actionChangePreset(entity.id, oldPreset, newPreset, true /* skip field defaults */);
      context.replace(action, annotation);
    }

    context.enter(modeSelect(context, selectedIDs));  // reselect
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
      context.t(`operations.cycle_highway_tag.${disabledReason}`) :
      context.t('operations.cycle_highway_tag.description');
  };


  operation.annotation = function() {
    return context.t('operations.cycle_highway_tag.annotation');
  };


  operation.id = 'cycle_highway_tag';
  operation.keys = [ '⇧' + context.t('operations.cycle_highway_tag.key') ];
  operation.title = context.t('operations.cycle_highway_tag.title');
  operation.behavior = new BehaviorKeyOperation(context, operation);

  return operation;
}
