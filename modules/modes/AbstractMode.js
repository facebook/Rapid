
/**
 * "Modes" are editing tasks that the user are allowed to perform.
 * Each mode is exclusive, i.e only one mode can be active at a time.
 * `AbstractMode` is the base class from which all modes inherit.
*
 * Properties you can access:
 *   `active`  `true` if the mode is active, `false` if not.
 */
export class AbstractMode {

  /**
   * @constructor
   * @param  `context`   Global shared context for iD
   */
  constructor(context) {
    this._context = context;
    this._active = false;
  }


  /**
   * enter
   * Every mode should have an `enter` function to peform any necessary setup tasks
   */
  enter() {
    this._active = true;
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
   * @readonly
   */
  get active() {
    return this._active;
  }

}
