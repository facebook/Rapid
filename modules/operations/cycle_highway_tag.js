import { utilArrayIdentical } from '@rapid-sdk/util';
import { actionChangePreset } from '../actions';
import { actionNoop } from '../actions/noop';
import { KeyOperationBehavior } from '../behaviors/KeyOperationBehavior';

let _wasSelectedIDs = [];
let _defaultHighwayPresetIDs = [
  'highway/residential',
    'highway/service',
    'highway/track',
    'highway/unclassified',
    'highway/tertiary',
    'line',
];

let _defaultCrossingPresetIDs = [
  'crossing/unmarked;crossing:markings=no',
    'crossing/marked;crossing:markings=yes',
    'crossing/marked;crossing:markings=zebra',
    'crossing/marked;crossing:markings=lines',
    'crossing/marked;crossing:markings=ladder',
    'crossing/marked;crossing:markings=dashes',
    'crossing/marked;crossing:markings=dots',
    'crossing/marked;crossing:markings=ladder:skewed',
];

export function operationCycleHighwayTag(context, selectedIDs) {

  const allowHighwayPresetRegex = [
    /^highway\/(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|track)/,
    /^line$/,
  ];

  const allowCrossingPresetRegex = [
    /^crossing\/(unmarked|marked|marked:zebra|marked:lines|marked:dashes|marked:ladder|marked:dots|marked:ladder:skewed)/,
  ];

  // same selection as before?
  const isSameSelection = utilArrayIdentical(selectedIDs, _wasSelectedIDs);
  const presetSystem = context.systems.presets;

  // Gather current entities allowed to be cycled
  const entities = selectedIDs
    .map(entityID => context.hasEntity(entityID))
    .filter(entity => {
      const preset = presetSystem.match(entity, context.graph());
      if (allowHighwayPresetRegex.some(regex => regex.test(preset.id))) {
        return true;
      } else if (allowCrossingPresetRegex.some(regex => regex.test(preset.id))) {
        return true;
      } else {
        return false;
      }
    });

  _wasSelectedIDs = selectedIDs.slice();

  let operation = function() {
    if (!entities.length) return;

    // If this is the same selection as before, and the previous edit was also a cycle-tags,
    // skip this `perform`, then all tag updates will be coalesced into the previous edit.
    const annotation = operation.annotation();
    if (!isSameSelection || context.systems.edits.undoAnnotation() !== annotation) {
      // Start with a no-op edit that will be replaced by all the tag updates we end up doing.
      context.perform(actionNoop(), annotation);
    }

    // Pick the next preset based on the entity type
    const entityType = entities[0].type; // Assuming all selected entities have the same type
    const presetIDs = getPresetIDsForEntityType(entityType);
    const currPreset = presetSystem.match(entities[0], context.graph());
    const index = currPreset ? presetIDs.indexOf(currPreset.id) : -1;
    const newPresetID = presetIDs[(index + 1) % presetIDs.length];
    const newPreset = presetSystem.item(newPresetID);

    // Update all selected entities...
    for (const entity of entities) {
      const oldPreset = presetSystem.match(entity, context.graph());
      const action = actionChangePreset(entity.id, oldPreset, newPreset, true);
      context.replace(action, annotation);
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
      context.t(`operations.cycle_highway_tag.${disabledReason}`) :
      context.t('operations.cycle_highway_tag.description');
  };

  operation.annotation = function() {
    return context.t('operations.cycle_highway_tag.annotation');
  };

  operation.id = 'cycle_highway_tag';
  operation.keys = [ '⇧' + context.t('operations.cycle_highway_tag.key') ];
  operation.title = context.t('operations.cycle_highway_tag.title');
  operation.behavior = new KeyOperationBehavior(context, operation);

  return operation;
}

function getPresetIDsForEntityType(entityType) {
  if (entityType === 'way') {
    return _defaultHighwayPresetIDs;
  } else if (entityType === 'crossing') {
    return _defaultCrossingPresetIDs;
  }
  return [];
}
