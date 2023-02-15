import { AbstractMode } from './AbstractMode';
import { operationPaste } from '../operations/paste';

const DEBUG = false;


/**
 * `ModeBrowse` is the default mode that the editor is in.
 *  Nothing selected but users can hover or click on things.
 *  - "operations" allowed (right click edit menu) includes Paste only
 */
export class ModeBrowse extends AbstractMode {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.context = context;
    this.id = 'browse';
  }


  /**
   * enter
   */
  enter() {
    if (DEBUG) {
      console.log('ModeBrowse: entering');  // eslint-disable-line no-console
    }

    this.operations = [ operationPaste(this.context) ];
    this._active = true;
    this.context.enableBehaviors(['hover', 'select', 'drag', 'paste', 'lasso', 'map-interaction']);

    // Get focus on the body.
    // I think this was done to remove focus from whatever
    // field the user was using in the sidebar/inspector?
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

