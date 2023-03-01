import { t } from '../core/localizer';
import { actionChangeTags } from '../actions/index';
import { actionNoop } from '../actions/noop';
import { BehaviorKeyOperation } from '../behaviors/BehaviorKeyOperation';
import { modeSelect } from '../modes/select';


export function operationCycleHighwayTag(context, selectedIDs) {
  const ROAD_TYPES = ['residential', 'service', 'track', 'unclassified', 'tertiary'];
  const entities = selectedIDs
    .map(entityID => context.hasEntity(entityID))
    .filter(entity => {  // available if there is a highway tag or untagged line
      return entity?.type === 'way' && (entity.tags.highway || !entity.hasInterestingTags());
    });
  const entityIDs = entities.map(entity => entity.id);


  let operation = function() {
    if (!entities.length) return;

    // Start with a no-op edit that will be replaced by all the tag updates we end up doing.
    context.perform(actionNoop(), operation.annotation());

    // Pick the next highway tag value..
    const currVal = entities[0].tags.highway;
    const index = currVal ? ROAD_TYPES.indexOf(currVal) : -1;
    const nextVal = ROAD_TYPES[(index + 1) % ROAD_TYPES.length];

    // Update all selected highways...
    for (const entity of entities) {
      let tags = Object.assign({}, entity.tags);  // copy
      tags.highway = nextVal;

      if (tags.highway === 'track') {
        tags.surface = 'unpaved';
      } else {
        delete tags.surface;
      }
      context.replace(actionChangeTags(entity.id, tags), operation.annotation());
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
      t(`operations.cycle_highway_tag.${disabledReason}`) :
      t('operations.cycle_highway_tag.description');
  };


  operation.annotation = function() {
    return t('operations.cycle_highway_tag.annotation');
  };


  operation.id = 'cycle_highway_tag';
  operation.keys = [ '⇧' + t('operations.cycle_highway_tag.key') ];
  operation.title = t('operations.cycle_highway_tag.title');
  operation.behavior = new BehaviorKeyOperation(context, operation);

  return operation;
}
