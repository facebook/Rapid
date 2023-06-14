import { EventEmitter } from '@pixi/utils';


/**
 * "Modes" are editing tasks that the user are allowed to perform.
 * Each mode is exclusive, i.e only one mode should be active at a time.
 *
 * `AbstractMode` is the base class from which all modes inherit.
 * All modes are event emitters.
 *
 * Properties you can access:
 *   `id`           `String` identifier for the mode (e.g. 'browse')
 *   `active`       `true` if the mode is active, `false` if not.
 *   `operations`   `Array` of operations allowed on the right-click edit menu
 *   `selectedData` `Map(dataID -> data)` containing selected data
 */
export class AbstractMode extends EventEmitter {

  /**
   * @constructor
   * @param  `context`   Global shared application context
   */
  constructor(context) {
    super();
    this.context = context;
    this.id = '';

    this._active = false;
    this._selectedData = new Map();
    this.operations = [];
  }


  /**
   * enter
   * Every mode should have an `enter` function to peform any necessary setup tasks
   * @param   `options`  Optional `Object` of options passed to the mode
   * @return  `true` if mode could be entered, `false` it not
   */
  enter() {
    this._active = true;
    return true;
  }


  /**
   * exit
   * Every mode should have a `exit` function to perform any necessary teardown tasks
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


  /**
   * selectedData
   * @readonly
   */
  get selectedData() {
    return this._selectedData;
  }


  /**
   * selectedIDs
   * @readonly
   */
  get selectedIDs() {
    return Array.from(this._selectedData.keys());
  }

}

