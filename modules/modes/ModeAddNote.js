import { AbstractMode } from './AbstractMode';
import { osmNote } from '../osm/note';
import { services } from '../services';

const DEBUG = false;


/**
 * `ModeAddNote`
 * In this mode, we are waiting for the user to place a Note somewhere
 */
export class ModeAddNote extends AbstractMode {

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
   */
  enter() {
    if (DEBUG) {
      console.log('ModeAddNote: entering');  // eslint-disable-line no-console
    }

    this._active = true;
    this.context.enableBehaviors(['hover', 'draw', 'map-interaction']);
    this.context.behaviors.get('draw')
      .on('click', this._click)
      .on('cancel', this._cancel)
      .on('undo', this._cancel)
      .on('finish', this._cancel);

    return true;
  }


  /**
   * exit
   */
  exit() {
    if (!this._active) return;

    if (DEBUG) {
      console.log('ModeAddNote: exiting');  // eslint-disable-line no-console
    }

    this._active = false;
    this.context.behaviors.get('draw')
      .off('click', this._click)
      .off('cancel', this._cancel)
      .off('undo', this._cancel)
      .off('finish', this._cancel);
  }


  /**
   * _click
   * Add a Note at `loc`
   */
  _click(loc) {
    const osm = services.osm;
    if (!osm) return;

    const note = osmNote({ loc: loc, status: 'open', comments: [] });
    osm.replaceNote(note);

    const selection = new Map().set(note.id, note);
    this.context.enter('select', { selection: selection });  //.newFeature(true));
  }


  /**
   * _cancel
   * Return to browse mode without doing anything
   */
  _cancel() {
    this.context.enter('browse');
  }
}
