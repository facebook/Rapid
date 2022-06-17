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
   * @param  `context`  Global shared context for iD
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
    this._context.enableBehaviors(['hover', 'draw']);
    this._context.behaviors.get('draw')
      .on('click', this._click)
      .on('clickWay', this._click)
      .on('clickNode', this._click)
      .on('cancel', this._cancel)
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
    this._context.behaviors.get('draw')
      .on('click', null)
      .on('clickWay', null)
      .on('clickNode', null)
      .on('cancel', null)
      .on('finish', null);
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

    // force a redraw (there is no history change that would otherwise do this)
    // this._context.map().immediateRedraw();

    this._context
      // .selectedNoteID(note.id)
      .enter('select-note', [note.id]);  //.newFeature(true));
  }


  /**
   * _cancel
   * Return to browse mode without doing anything
   */
  _cancel() {
    this._context.enter('browse');
  }
}
