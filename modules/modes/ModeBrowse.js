import { AbstractMode } from './AbstractMode';
import { operationPaste } from '../operations/paste';

const DEBUG = false;


/**
 * `ModeBrowse` is the default mode that the editor is in.
 *  Nothing selected but users can hover or click on things.
 */
export class ModeBrowse extends AbstractMode {

  /**
   * @constructor
   * @param  `context`  Global shared context for iD
   */
  constructor(context) {
    super(context);

    this.id = 'browse';
    this.operations = [ operationPaste(context) ];
  }


  /**
   * enter
   */
  enter() {
    if (this._active) return;

    if (DEBUG) {
      console.log('ModeBrowse: entering');  // eslint-disable-line no-console
    }

    this._active = true;
    this._context.enableBehaviors(['hover', 'select', 'drag']);

    // Get focus on the body.
    // does this do anything?
    if (document.activeElement && document.activeElement.blur) {
      document.activeElement.blur();
    }

    return true;
  }


  /**
   * exit
   */
  exit() {
    if (!this._active) return;
    this._active = false;

    if (DEBUG) {
      console.log('ModeBrowse: exiting');  // eslint-disable-line no-console
    }
  }


  selectBehavior() {
    console.error('error: do not call modeBrowse.selectBehavior anymore');  // eslint-disable-line no-console
  }
  sidebar() {
    console.error('error: do not call modeBrowse.sidebar anymore');   // eslint-disable-line no-console
  }

}

