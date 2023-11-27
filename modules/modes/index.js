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
  available: new Map()   // Map (id -> Mode constructor)
};
// christmas tree https://www.vecteezy.com/png/9346313-hand-drawn-christmas-tree
// candy cane https://www.vecteezy.com/png/11016194-christmas-toy-lollipop-red-and-white-cane
// ginger bread man https://www.vecteezy.com/png/9399803-gingerbread-man-clipart-design-illustration
// santa https://www.vecteezy.com/png/15693545-santa-claus-christmas-cartoon-character

export const cursors = {
  connectLineCursor: 'url(/img/holiday_candy_cane_cursor.png) 5 5, auto',
  connectVertexCursor: 'url(/img/holiday_santa_claus_cursor.png) 5 5, auto',
  lineCursor:'url(/img/holiday_santa_sleigh_cursor.png) 5 5, auto',
  vertexCursor: 'url(/img/holiday_gingerbread_man_cursor.png) 5 5, auto',
  pointCursor:'url(/img/holiday_candy_cane_cursor.png) 5 5, auto',
  areaCursor:'url(/img/holiday_christmas_tree_cursor.png) 9 9, auto',
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
