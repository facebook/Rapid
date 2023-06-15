import { AbstractSystem } from './AbstractSystem';

/**
 * `StorageSystem` is a wrapper around `window.localStorage`
 * It is used to store user preferences (good)
 * and the user's edit history (not good)
 *
 * n.b.:  `localStorage` is a _synchronous_ API.
 * We should add another system for wrapping `indexedDB`,
 * which is an _asynchronous_ API, but would allow us to store
 * a whole lot more data, and share it with worker processes.
 * (The user's edit history should go there instead.)
 */
export class StorageSystem extends AbstractSystem {

  /**
   * @constructor
   * @param  context  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'storage';   // was: 'prefs'
    this._storage = null;

    // Note that accessing localStorage may throw a `SecurityError`, so wrap in a try/catch.
    try {
      this._storage = window.localStorage;
    } catch (e) {
      this._mock = new Map();
      this._storage = {
        hasItem: (k) => this._mock.has(k),
        getItem: (k) => this._mock.get(k),
        setItem: (k, v) => this._mock.set(k, v),
        removeItem: (k) => this._mock.delete(k),
        clear: () => this._mock.clear()
      };
    }
  }


  /**
   * hasItem
   * @param   k  String key to check for existance
   * @return  `true` if the key is set, `false` if not
   */
  hasItem(k) {
    return !!this._storage.getItem(k);
  }


  /**
   * getItem
   * @param   k  String key to get the value for
   * @return  The stored value, or `null` if not found
   */
  getItem(k) {
    return this._storage.getItem(k);
  }


  /**
   * setItem
   * @param   k  String key to set the value for
   * @param   v  String value to set
   * @return  `true` if it succeeded, `false` if it failed
   */
  setItem(k, v) {
    try {
      this._storage.setItem(k, v);
      return true;
    } catch (e) {
      console.error('localStorage quota exceeded');  // eslint-disable-line no-console
    }
    return false;
  }


  /**
   * removeItem
   * @param   k  String key to remove from storage
   */
  removeItem(k) {
    this._storage.removeItem(k);
  }


  /**
   * clear
   * Clears all values from the storage
   */
  clear() {
    this._storage.clear();
  }
}
