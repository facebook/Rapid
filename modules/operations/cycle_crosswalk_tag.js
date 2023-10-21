import { utilArrayIdentical } from '@rapid-sdk/util';
import { actionChangePreset } from '../actions';
import { actionNoop } from '../actions/noop';
import { KeyOperationBehavior } from '../behaviors/KeyOperationBehavior';

let _wasSelectedIDs = [];
let _wasPresetIDs = [];

export function operationCycleCrosswalkTag(context, selectedIDs) {
    const allowPresetRegex = [
    /^crossing$/,
  ];

  const defaultPresetIDs = [
    'crossing/unmarked;crossing:markings=no',
    'crossing/marked;crossing:markings=yes',
    'crossing/marked;crossing:markings=zebra',
    'crossing/marked;crossing:markings=lines',
    'crossing/marked;crossing:markings=ladder',
    'crossing/marked;crossing:markings=dashes',
    'crossing/marked;crossing:markings=dots',
    'crossing/marked;crossing:markings=ladder:skewed',
  ];

  const isSameSelection = utilArrayIdentical(selectedIDs, _wasSelectedIDs);
  const presetIDs = new Set(isSameSelection ? _wasPresetIDs : defaultPresetIDs);
  const presetSystem = context.systems.presets;

  const entities = selectedIDs
    .map(entityID => context.hasEntity(entityID))
    .filter(entity => {
      if (entity?.type !== 'way') return false;

      const preset = presetSystem.match(entity, context.graph());
      if (allowPresetRegex.some(regex => regex.test(preset.id))) {
        if (!presetIDs.has(preset.id)) presetIDs.add(preset.id);  // cycle back to the original preset
        return true;
      } else {
        return false;
      }
    });

    _wasSelectedIDs = selectedIDs.slice();
  _wasPresetIDs = Array.from(presetIDs);

  let operation = function() {
    if (!entities.length) return;

    const annotation = operation.annotation();
    if (!isSameSelection || context.systems.edits.undoAnnotation() !== annotation) {
      // Start with a no-op edit that will be replaced by all the tag updates we end up doing.
      context.perform(actionNoop(), annotation);
    }

    // Pick the next preset..
    const currPresetIDs = Array.from(presetIDs);
    const currPreset = presetSystem.match(entities[0], context.graph());
    const index = currPreset ? currPresetIDs.indexOf(currPreset.id) : -1;
    const newPresetID = currPresetIDs[(index + 1) % currPresetIDs.length];
    const newPreset = presetSystem.item(newPresetID);

    // Update all selected crosswalks...
    for (const entity of entities) {
      const oldPreset = presetSystem.match(entity, context.graph());
      const action = actionChangePreset(entity.id, oldPreset, newPreset, true);
      context.replace(action, annotation);
    }

    context.enter('select-osm', { selectedIDs: selectedIDs });
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
      context.t(`operations.cycle_crosswalk_tag.${disabledReason}`) :
      context.t('operations.cycle_crosswalk_tag.description');
  };

  operation.annotation = function() {
    return context.t('operations.cycle_crosswalk_tag.annotation');
  };


  operation.id = 'cycle_crosswalk_tag';
  operation.keys = [ '⇧' + context.t('operations.cycle_crosswalk_tag.key') ];
  operation.title = context.t('operations.cycle_crosswalk_tag.title');
  operation.behavior = new KeyOperationBehavior(context, operation);

  return operation;

}
