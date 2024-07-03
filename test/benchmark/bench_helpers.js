/* eslint no-extend-native:off */

// Disable things that use the network
for (var k in Rapid.services) { delete Rapid.services[k]; }

// Try not to load imagery
window.location.hash = '#background=none';

// Run without data for speed (tests which need data can set it up themselves)
Rapid.fileFetcher.assetPath('../../dist/');
var cached = Rapid.fileFetcher.cache();

// Initializing `coreContext` will try loading the locale data and English locale strings:
cached.locales = { en: { rtl: false, pct: 1 } };
cached.locales_index_general = { en: { rtl: false, pct: 1 } };
cached.locales_index_tagging = { en: { rtl: false, pct: 1 } };


// Initializing `coreContext` initializes `_background`, which tries loading:
cached.imagery = [];
// Initializing `coreContext` initializes `_presets`, which tries loading:
cached.preset_categories = {};
cached.preset_defaults = {};
cached.preset_fields = {};
cached.preset_presets = {};
// Initializing `coreContext` initializes `_validator`, which tries loading:
cached.deprecated = [];
// Initializing `coreContext` initializes `_uploader`, which tries loading:
cached.discarded = {};


window.d3 = Rapid.d3;   // Remove this if we can avoid exporting all of d3.js
window.sdk = Rapid.sdk;
delete window.PointerEvent;  // force the brower to use mouse events
