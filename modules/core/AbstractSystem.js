import { EventEmitter } from '@pixi/utils';


/**
 * "Systems" are the core components of Rapid
 * They are owned by the context.
 *
 * `AbstractSystem` is the base class from which all systems inherit.
 *
 * Properties you can access:
 *   `id`   `String` identifier for the system (e.g. 'l10n')
 */
export class AbstractSystem extends EventEmitter {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super();
    this.context = context;
    this.id = '';
    this.dependencies = new Set();
    this.autoStart = true;
  }


  /**
   * initAsync
   * Called after all core objects have been constructed.
   * @return {Promise} Promise resolved when this system has completed initialization
   */
  initAsync() {
    for (const id of this.dependencies) {
      if (!this.context.systems[id]) {
        return Promise.reject(`Cannot init:  ${this.id} requires ${id}`);
      }
    }
    return Promise.resolve();
  }


  /**
   * startAsync
   * Called after all core objects have been initialized.
   * @return {Promise} Promise resolved when this system has completed startup
   */
  startAsync() {
    return Promise.resolve();
  }


  /**
   * resetAsync
   * Called after completing an edit session to reset any internal state
   * @return {Promise} Promise resolved when this system has completed resetting
   */
  resetAsync() {
    return Promise.resolve();
  }

}
