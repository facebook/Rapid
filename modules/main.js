// polyfill idle callback functions (for Safari)
window.requestIdleCallback = window.requestIdleCallback ||
  function(cb) {
    var start = Date.now();
    return window.requestAnimationFrame(function() {
      cb({
        didTimeout: false,
        timeRemaining: function() {
          return Math.max(0, 50 - (Date.now() - start));
        }
      });
    });
  };
window.cancelIdleCallback = window.cancelIdleCallback ||
  function(handle) {
    window.cancelAnimationFrame(handle);
  };

import * as __all__ from './index';
window.Rapid = __all__;
window.iD = __all__;
