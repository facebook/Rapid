import { AbstractMode } from './AbstractMode';
import { AddNoteMode } from './AddNoteMode';
import { AddPointMode } from './AddPointMode';
import { BrowseMode } from './BrowseMode';
import { DragNodeMode } from './DragNodeMode';
import { DrawAreaMode } from './DrawAreaMode';
import { DrawLineMode } from './DrawLineMode';
import { MoveMode } from './MoveMode';
import { RotateMode } from './RotateMode';
import { SaveMode } from './SaveMode';
import { SelectMode } from './SelectMode';
import { SelectOsmMode } from './SelectOsmMode';

export {
  AbstractMode,
  AddNoteMode,
  AddPointMode,
  BrowseMode,
  DragNodeMode,
  DrawAreaMode,
  DrawLineMode,
  MoveMode,
  RotateMode,
  SaveMode,
  SelectMode,
  SelectOsmMode   // someday, single select mode?
};

// legacy
export { modeDragNote } from './drag_note';

// At init time, we will instantiate any that are in the 'available' collection.
export const modes = {
  available:    new Map(),   // Map (id -> Mode constructor)
  instantiated: new Map()    // Map (id -> Mode instance)
};

modes.available.set('add-note', AddNoteMode);
modes.available.set('add-point', AddPointMode);
modes.available.set('browse', BrowseMode);
modes.available.set('drag-node', DragNodeMode);
modes.available.set('draw-area', DrawAreaMode);
modes.available.set('draw-line', DrawLineMode);
modes.available.set('move', MoveMode);
modes.available.set('rotate', RotateMode);
modes.available.set('save', SaveMode);
modes.available.set('select', SelectMode);
modes.available.set('select-osm', SelectOsmMode);
