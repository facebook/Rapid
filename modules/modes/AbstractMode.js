
/**
 * "Modes" are editing tasks that the user are allowed to perform.
 * Each mode is exclusive, i.e only one mode can be active at a time.
 * `AbstractMode` is the base class from which all modes inherit.
*
 * Properties you can access:
 *   `active`       `true` if the mode is active, `false` if not.
 *   `selectedIDs`  `Set` of selected IDs for this mode
 *   `operations`   `Array` of operations allowed on the right-click edit menu
 */
export class AbstractMode {

  /**
   * @constructor
   * @param  `context`   Global shared context for iD
   */
  constructor(context) {
    this._context = context;
    this._active = false;
    this.selectedIDs = [];
    this.operations = [];
  }


  /**
   * enter
   * Every mode should have an `enter` function to peform any necessary setup tasks
   * @param  `selectedIDs`   Optional array of selected IDs
   * @return `true` if mode could be entered, `false` it not
   */
  enter(selectedIDs) {
    this._active = true;
    this.selectedIDs = selectedIDs || [];
    return true;
  }


  /**
   * exit
   * Every mode should have a `exit` function to perform any necessary teradown tasks
   */
  exit() {
    this._active = false;
  }


  /**
   * active
   * Whether the mode is active
   * @return `true` if active, `false` if not.
   * @readonly
   */
  get active() {
    return this._active;
  }
}

