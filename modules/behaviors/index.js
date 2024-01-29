import { AbstractBehavior } from './AbstractBehavior.js';
import { DragBehavior } from './DragBehavior.js';
import { DrawBehavior } from './DrawBehavior.js';
import { HoverBehavior } from './HoverBehavior.js';
import { KeyOperationBehavior } from './KeyOperationBehavior.js';
import { LassoBehavior } from './LassoBehavior.js';
import { MapInteractionBehavior } from './MapInteractionBehavior.js';
import { MapNudgingBehavior } from './MapNudgingBehavior.js';
import { PasteBehavior } from './PasteBehavior.js';
import { SelectBehavior } from './SelectBehavior.js';

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
  available:  new Map()  // Map (id -> Behavior constructor)
};

behaviors.available.set('drag', DragBehavior);
behaviors.available.set('draw', DrawBehavior);
behaviors.available.set('hover', HoverBehavior);
behaviors.available.set('lasso', LassoBehavior);
behaviors.available.set('map-interaction', MapInteractionBehavior);
behaviors.available.set('map-nudging', MapNudgingBehavior);
behaviors.available.set('paste', PasteBehavior);
behaviors.available.set('select', SelectBehavior);
