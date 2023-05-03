
/**
 * `StorageManager` is a wrapper around `window.localStorage`
 * (or whatever we replace it with)
 */
export class StorageManager {

  /**
   * @constructor
   */
  constructor() {
    this._storage = null;

    // Note that accessing localStorage may throw a `SecurityError`, so wrap in a try/catch.
    try {
      this._storage = window.localStorage;
    } catch (e) {
      this._mock = {};
      this._storage = {
        getItem: (k) => this._mock[k],
        setItem: (k, v) => this._mock[k] = v,
        removeItem: (k) => delete this._mock[k],
        clear: () => this._mock = {}
      };
    }
  }


  /**
   * init
   * Called one time after all core objects have been instantiated.
   */
  init() {
    /* noop */
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
