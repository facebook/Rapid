let memStorage = {};


export function rapidPowerUserFeaturesStorage() {
  // Cloned from context, but we need storage from within the actions
  // modules which are context-free.

  // https://github.com/openstreetmap/iD/issues/772
  // http://mathiasbynens.be/notes/localstorage-pattern#comment-9
  let storage;
  try { storage = localStorage; } catch (e) {}  // eslint-disable-line no-empty
  storage = storage || (function() {
    let s = {};
    return {
      getItem: (k) => s[k],
      setItem: (k, v) => s[k] = v,
      removeItem: (k) => delete s[k]
    };
  })();

  let settingStorage = (k, v) => {
    try {
      if (arguments.length === 1) return storage.getItem(k);
      else if (v === null) storage.removeItem(k);
      else storage.setItem(k, v);
    } catch (e) {
      // localstorage quota exceeded
      /* eslint-disable no-console */
      if (typeof console !== 'undefined') console.error('localStorage quota exceeded/could not be used.');
      /* eslint-enable no-console */

      // If we caught an exception it means that the browser can't use
      // localStorage.  We'll just use an empty in-memory object instead
      // as a fallback. This will at least ensure that the settings are
      // sticky until the browser is closed.
      storage = memStorage;
    }
  };

  let returnObj = {};
  returnObj.featureEnabled = (key, bool) => {
    if (bool === null || bool === undefined) {
      return settingStorage('rapid-internal-feature.' + key) === 'true';
    } else {
      return settingStorage('rapid-internal-feature.' + key, bool.toString());
    }
  };

  return returnObj;
}
