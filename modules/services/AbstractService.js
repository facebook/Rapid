import { EventEmitter } from '@pixi/utils';


/**
 * "Services" are components of Rapid that connect to other web services and fetch data.
 * They are owned by the context.
 * They are the closest thing to 'plugins' that Rapid has.
 *
 * `AbstractService` is the base class from which all services inherit.
 *  It provides common methods `init` and `reset` to be overridden in derived classes.
 *  All services are event emitters.
 *
 * Properties you can access:
 *   `id`   `String` identifier for the service (e.g. 'osm')
 */
export class AbstractService extends EventEmitter {

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
   * @return {Promise} Promise resolved when this component has completed initialization
   */
  initAsync() {
    return Promise.resolve();
  }


  /**
   * startAsync
   * Called after all core objects have been initialized.
   * @return {Promise} Promise resolved when this component has completed startup
   */
  startAsync() {
    return Promise.resolve();
  }


  /**
   * resetAsync
   * Called after completing an edit session to reset any internal state
   * @return {Promise} Promise resolved when this component has completed resetting
   */
  resetAsync() {
    return Promise.resolve();
  }

}
