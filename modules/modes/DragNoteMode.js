import { vecAdd, vecRotate, vecSubtract } from '@rapid-sdk/math';

import { AbstractMode } from './AbstractMode.js';


/**
 * `DragNoteMode`
 *  In this mode, the user has started dragging an OSM Note
 */
export class DragNoteMode extends AbstractMode {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'drag-note';

    this.dragNote = null;    // The note being dragged

    this._startLoc = null;
    this._clickLoc = null;

    // Make sure the event handlers have `this` bound correctly
    this._move = this._move.bind(this);
    this._end = this._end.bind(this);
    this._cancel = this._cancel.bind(this);
    this._nudge = this._nudge.bind(this);
  }


  /**
   * enter
   * Enters the mode.
   * @param  {Object?}  options - Optional `Object` of options passed to the new mode
   * @param  {string}   options.noteID - if set, drag the note with the given id
   * @return {boolean}  `true` if the mode can be entered, `false` if not
   */
  enter(options = {}) {
    const context = this.context;
    const l10n = context.systems.l10n;
    const osm = context.services.osm;
    if (!osm) return;

    const noteID = options.noteID;
    const note = osm.getNote(noteID);
    if (!note) return;

    this._active = true;
    this.dragNote = note;
    this._startLoc = note.loc;
    this._selectedData.set(this.dragNote.id, this.dragNote);

    // Set the 'drawing' class so that the dragNote won't emit events
    const scene = context.scene();
    scene.classData('notes', this.dragNote.id, 'drawing');

    // `_clickLoc` is used later to calculate a drag offset,
    // to correct for where "on the pin" the user grabbed the target.
    const point = context.behaviors.drag.lastDown.coord.map;
    this._clickLoc = context.viewport.unproject(point);

    context.enableBehaviors(['drag', 'mapNudge']);
    context.behaviors.mapNudge.allow();

    context.behaviors.drag
      .on('move', this._move)
      .on('end', this._end)
      .on('cancel', this._cancel);

    context.behaviors.mapNudge
      .on('nudge', this._nudge);

    return true;
  }


  /**
   * exit
   */
  exit() {
    if (!this._active) return;
    this._active = false;

    this.dragNote = null;
    this._startLoc = null;
    this._clickLoc = null;
    this._selectedData.clear();

    const context = this.context;

    context.scene().clearClass('drawing');

    context.behaviors.drag
      .off('move', this._move)
      .off('end', this._end)
      .off('cancel', this._cancel);

    context.behaviors.mapNudge
      .off('nudge', this._nudge);
  }


  /**
   * _move
   * Move the dragging node
   * @param  eventData  `Object` data received from the drag behavior
   */
  _move(eventData) {
    if (!this.dragNote) return;

    const context = this.context;
    const locations = context.systems.locations;
    const map = context.systems.map;
    const osm = context.services.osm;
    const viewport = context.viewport;
    const point = eventData.coord.map;

    // The "drag offset" is the difference between where the user grabbed
    // the marker/pin and where the location of the note actually is.
    // We calculate the drag offset each time because it's possible
    // the user may have changed zooms while dragging..
    const clickCoord = viewport.project(this._clickLoc);
    const startCoord = viewport.project(this._startLoc);
    const dragOffset = vecSubtract(startCoord, clickCoord);
    const adjustedCoord = vecAdd(point, dragOffset);
    const loc = viewport.unproject(adjustedCoord);

    if (locations.blocksAt(loc).length) {  // editing is blocked here
      this._cancel();
      return;
    }

    this.dragNote = this.dragNote.update({ loc: loc });
    osm.replaceNote(this.dragNote);
    this._selectedData.set(this.dragNote.id, this.dragNote);

    // Force a redraw - there is no event for notes that would tell the map to redraw.
    // (unlike with dragging osm features around, where editsystem emits `stagingchanged` events)
    map.immediateRedraw();
  }


  /**
   * _nudge
   * This event fires on map pans at the edge of the screen.
   * We want to move the dragging note opposite of the pixels panned to keep it in the same place.
   * @param  nudge - [x,y] amount of map pan in pixels
   */
  _nudge(nudge) {
    if (!this.dragNote) return;

    const context = this.context;
    const osm = context.services.osm;
    const locations = context.systems.locations;
    const viewport = context.viewport;
    const t = context.viewport.transform;
    if (t.r) {
      nudge = vecRotate(nudge, -t.r, [0, 0]);   // remove any rotation
    }

    const currPoint = viewport.project(this.dragNote.loc);
    const destPoint = vecSubtract(currPoint, nudge);
    const loc = viewport.unproject(destPoint);

    if (locations.blocksAt(loc).length) {  // editing is blocked here
      this._cancel();
      return;
    }

    this.dragNote = this.dragNote.move(loc);
    osm.replaceNote(this.dragNote);
    this._selectedData.set(this.dragNote.id, this.dragNote);
  }


  /**
   * _end
   * Complete the drag and keep the note selected.
   * Note that `exit()` will be called immediately after this to perform cleanup.
   * @param  eventData  `Object` data received from the drag behavior
   */
  _end(eventData) {
    if (this.dragNote) {
      const selection = new Map().set(this.dragNote.id, this.dragNote);
      this.context.enter('select', { selection: selection });
    } else {
      this.context.enter('browse');
    }
  }


  /**
   * _cancel
   * Return to browse mode
   * Note that `exit()` will be called immediately after this to perform cleanup.
   */
  _cancel() {
    this.context.enter('browse');
  }

}
