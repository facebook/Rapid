// Polyfill idle callback functions (for Safari)
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

import * as Rapid from './index.js';
window.Rapid = Rapid;
window.Rapid.isDebug = false;
