import { EventEmitter } from '@pixi/utils';


/**
 * `AbstractSystem` is the base class from which all systems and services inherit.
 * "Systems" are the core components of Rapid.
 * "Services" are extension components that connect to other web services and fetch data.
 * They are owned by the Context. All systems are EventEmitters
 *
 * System Components all go through a standard lifecycle.
 * `constructor()` -> `initAsync()` -> `startAsync()`
 *
 * `constructor()` - Called one time and passed the Context.
 *   At this stage all components are still being constructed, in no particular order.
 *   You should not call other components or use the context in the constructor.
 *
 * `initAsync()` - Called one time after all systems are constructed.
 *   Systems may check at init time that their dependencies are met.
 *   They may chain onto other system `initAsync` promises in order to establish a dependency graph.
 *   (for example, if `AssetSystem` must be initialized and ready
 *    so that the `ImagerySystem` can start fetching its imagery index)
 *   `initAsync` is also a good place to set up event listeners.
 *   After 'init', the component should mostly be able to function normally.
 *   You should be able to call methods but there is no user interface yet.
 *   and no events will be dispatched yet.
 *
 * `startAsync()` - Called one time after all systems are initialized.
 *   At this stage we are creating the user interface and the map.
 *   There is an `autoStart` property that defaults to `true` but can be set `false` for some systems.
 *   (for example `Map3dSystem` doesn't need to load and start MapLibre until the user actually decides
 *    they want to see it - it is another component's job to call `startAsync` in this situation)
 *   Like with init, components can chain onto other components startAsync promises they depend on.
 *   After 'start', the system should be doing its job and dispatching events.
 *
 * `resetAsync()` - Called after completing an edit session to reset any internal state.
 *   Resets mainly happen when completing an edit session, but can happen other times,
 *   for example entering/exiting the tutorial, restoring a saved backup, or when switching
 *   connection between live/dev OSM API.  Each system is responsible for clearing out any
 *   stored state during reset.
 *
 * `pause()` / `resume()` - Call these methods from other parts of the application to pause or resume.
 *   The meaning of "pause" / "resume" is dependent on the system - they may not be used at all.
 *   It may be used to prevent network fetches, background work, or rendering.
 *   (Note: they are currently sync - may need to be made async in the future?)
 *
 * Properties you can access:
 *   `id`        `String`   Identifier for the system (e.g. 'l10n')
 *   `autoStart` `Boolean`  True to start automatically when initializing the Context
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

    this._started = false;
    this._paused = false;
  }


  /**
   * started
   * @readonly
   */
  get started() {
    return this._started;
  }


  /**
   * paused
   * @readonly
   */
  get paused() {
    return this._paused;
  }


  /**
   * initAsync
   * Called after all core objects have been constructed.
   * @return {Promise} Promise resolved when this component has completed initialization
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
   * @return {Promise} Promise resolved when this component has completed startup
   */
  startAsync() {
    this._started = true;
    return Promise.resolve();
  }


  /**
   * resetAsync
   * Called after completing an edit session to reset any internal state.
   * @return {Promise} Promise resolved when this component has completed resetting
   */
  resetAsync() {
    return Promise.resolve();
  }


  /**
   * pause
   * Pauses this system
   * The meaning of "pause" / "resume" is dependent on the system - they may not be used at all.
   * It may be used to prevent network fetches, background work, or rendering.
   */
  pause() {
    this._paused = true;
  }


  /**
   * resume
   * Resumes (unpauses) this system.
   * The meaning of "pause" / "resume" is dependent on the system - they may not be used at all.
   * It may be used to prevent network fetches, background work, or rendering.
   */
  resume() {
    this._paused = false;
  }

}
