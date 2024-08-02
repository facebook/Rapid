import { AbstractMode } from './AbstractMode.js';
import { AddNoteMode } from './AddNoteMode.js';
import { AddPointMode } from './AddPointMode.js';
import { BrowseMode } from './BrowseMode.js';
import { DragNodeMode } from './DragNodeMode.js';
import { DragNoteMode } from './DragNoteMode.js';
import { DrawAreaMode } from './DrawAreaMode.js';
import { DrawLineMode } from './DrawLineMode.js';
import { MoveMode } from './MoveMode.js';
import { RotateMode } from './RotateMode.js';
import { SaveMode } from './SaveMode.js';
import { SelectMode } from './SelectMode.js';
import { SelectOsmMode } from './SelectOsmMode.js';

export {
  AbstractMode,
  AddNoteMode,
  AddPointMode,
  BrowseMode,
  DragNodeMode,
  DragNoteMode,
  DrawAreaMode,
  DrawLineMode,
  MoveMode,
  RotateMode,
  SaveMode,
  SelectMode,
  SelectOsmMode   // someday, single select mode?
};


// At init time, we will instantiate any that are in the 'available' collection.
export const modes = {
  available: new Map()   // Map (id -> Mode constructor)
};

modes.available.set('add-note', AddNoteMode);
modes.available.set('add-point', AddPointMode);
modes.available.set('browse', BrowseMode);
modes.available.set('drag-node', DragNodeMode);
modes.available.set('drag-note', DragNoteMode);
modes.available.set('draw-area', DrawAreaMode);
modes.available.set('draw-line', DrawLineMode);
modes.available.set('move', MoveMode);
modes.available.set('rotate', RotateMode);
modes.available.set('save', SaveMode);
modes.available.set('select', SelectMode);
modes.available.set('select-osm', SelectOsmMode);
