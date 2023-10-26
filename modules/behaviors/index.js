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
  available:  new Map()  // Map (id -> Behavior constructor)
};

export const cursors = {
  connectLineCursor: 'url(/img/cursor-draw-connect-line.png) 9 9, crosshair',
  connectVertexCursor: 'url(/img/cursor-draw-connect-vertex.png) 9 9, crosshair',
  lineCursor:'url(/img/cursor-select-line.png), auto',
  vertexCursor: 'url(/img/cursor-select-vertex.png), auto',
  pointCursor:'url(/img/cursor-select-point.png), auto',
  areaCursor:'url(/img/cursor-select-area.png), auto',
};

behaviors.available.set('drag', DragBehavior);
behaviors.available.set('draw', DrawBehavior);
behaviors.available.set('hover', HoverBehavior);
behaviors.available.set('lasso', LassoBehavior);
behaviors.available.set('map-interaction', MapInteractionBehavior);
behaviors.available.set('map-nudging', MapNudgingBehavior);
behaviors.available.set('paste', PasteBehavior);
behaviors.available.set('select', SelectBehavior);
