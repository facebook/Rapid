import { AbstractBehavior } from './AbstractBehavior';
import { DragBehavior } from './DragBehavior';
import { DrawBehavior } from './DrawBehavior';
import { HoverBehavior } from './HoverBehavior';
import { KeyOperationBehavior } from './KeyOperationBehavior';
import { LassoBehavior } from './LassoBehavior';
import { MapInteractionBehavior } from './MapInteractionBehavior';
import { MapNudgingBehavior } from './MapNudgingBehavior';
import { PasteBehavior } from './PasteBehavior';
import { SelectBehavior } from './SelectBehavior';

export {
  AbstractBehavior,
  DragBehavior,
  DrawBehavior,
  HoverBehavior,
  KeyOperationBehavior,
  LassoBehavior,
  MapInteractionBehavior,
  MapNudgingBehavior,
  PasteBehavior,
  SelectBehavior
};

// At init time, we will instantiate any that are in the 'available' collection.
export const behaviors = {
  available:    new Map(),   // Map (id -> Behavior constructor)
  instantiated: new Map()    // Map (id -> Behavior instance)
};

behaviors.available.set('drag', DragBehavior);
behaviors.available.set('draw', DrawBehavior);
behaviors.available.set('hover', HoverBehavior);
behaviors.available.set('lasso', LassoBehavior);
behaviors.available.set('map-interaction', MapInteractionBehavior);
behaviors.available.set('map-nudging', MapNudgingBehavior);
behaviors.available.set('paste', PasteBehavior);
behaviors.available.set('select', SelectBehavior);
