import { EventEmitter } from '@pixi/utils';


/**
 * "Systems" are the core components of Rapid
 * They are owned by the context.
 *
 * `AbstractSystem` is the base class from which all systems inherit.
 *  It provides common methods `init` and `reset` to be overridden in derived classes.
 *  All systems are event emitters.
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
  }


  /**
   * init
   * Called one time after all objects have been instantiated.
   */
  init() {
  }


  /**
   * reset
   * Called after completing an edit session to reset any internal state
   */
  reset() {
  }

}
