import { AbstractMode } from './AbstractMode';
import { osmNote } from '../osm/note';

const DEBUG = false;


/**
 * `AddNoteMode`
 * In this mode, we are waiting for the user to place a Note somewhere
 */
export class AddNoteMode extends AbstractMode {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'add-note';

    // Make sure the event handlers have `this` bound correctly
    this._click = this._click.bind(this);
    this._cancel = this._cancel.bind(this);
  }


  /**
   * enter
   * Enters the mode.
   */
  enter() {
    if (DEBUG) {
      console.log('AddNoteMode: entering');  // eslint-disable-line no-console
    }

    this._active = true;
    const context = this.context;
    context.enableBehaviors(['hover', 'draw', 'map-interaction', 'map-nudging']);

    context.behaviors.draw
      .on('click', this._click)
      .on('cancel', this._cancel)
      .on('finish', this._cancel);

//    context.systems.editor
//      .on('historychange', this._cancel);

    context.behaviors['map-nudging'].allow();

    return true;
  }


  /**
   * exit
   */
  exit() {
    if (!this._active) return;
    this._active = false;

    if (DEBUG) {
      console.log('AddNoteMode: exiting');  // eslint-disable-line no-console
    }

    const context = this.context;
    context.behaviors.draw
      .off('click', this._click)
      .off('cancel', this._cancel)
      .off('finish', this._cancel);

//    context.systems.editor
//      .off('historychange', this._cancel);
  }


  /**
   * _click
   * Add a Note at the mouse click coords
   */
  _click(eventData) {
    const context = this.context;
    const osm = context.services.osm;
    const projection = context.projection;
    const coord = eventData.coord;
    const loc = projection.invert(coord);

    if (!osm) return;

    const note = osmNote({ loc: loc, status: 'open', comments: [] });
    osm.replaceNote(note);

    const selection = new Map().set(note.id, note);
    context.enter('select', { selection: selection });
  }


  /**
   * _cancel
   * Return to browse mode without doing anything
   */
  _cancel() {
    this.context.enter('browse');
  }
}
