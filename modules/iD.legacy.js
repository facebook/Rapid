// Polyfills for IE11/PhantomJS for things not included in core-js
import 'fast-text-encoding';
import 'whatwg-fetch';
import 'abortcontroller-polyfill/dist/polyfill-patch-fetch';

// Polyfill requestIdleCallback for IE11 and Safari
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
  function(id) {
    window.cancelAnimationFrame(id);
  };


// Bootstrap iD
import * as iD from './index.js';
window.iD = iD;
