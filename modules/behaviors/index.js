import { AbstractBehavior } from './AbstractBehavior.js';
import { DragBehavior } from './DragBehavior.js';
import { DrawBehavior } from './DrawBehavior.js';
import { HoverBehavior } from './HoverBehavior.js';
import { KeyOperationBehavior } from './KeyOperationBehavior.js';
import { LassoBehavior } from './LassoBehavior.js';
import { MapInteractionBehavior } from './MapInteractionBehavior.js';
import { MapNudgeBehavior } from './MapNudgeBehavior.js';
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
  MapNudgeBehavior,
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
behaviors.available.set('mapInteraction', MapInteractionBehavior);
behaviors.available.set('mapNudge', MapNudgeBehavior);
behaviors.available.set('paste', PasteBehavior);
behaviors.available.set('select', SelectBehavior);
