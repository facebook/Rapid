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
window.Rapid.isDebug = true;

// For dev build, we'll bundle additional things
// that are useful for testing or debugging.

// Include rapid-sdk as a single `sdk` namespace.
// (This works because we know there are no name conflicts)
import * as SDKMATH from '@rapid-sdk/math';
import * as SDKUTIL from '@rapid-sdk/util';
window.Rapid.sdk = { ...SDKMATH, ...SDKUTIL };

import * as d3 from 'd3';
window.d3 = d3;

import * as PIXI from 'pixi.js';
window.PIXI = PIXI;

import * as SPECTOR from 'spectorjs';
window.SPECTOR = SPECTOR;
