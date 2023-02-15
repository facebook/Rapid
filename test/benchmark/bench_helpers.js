/* globals chai:false */
/* eslint no-extend-native:off */

// Disable things that use the network
for (var k in iD.services) { delete iD.services[k]; }

// Try not to load imagery
window.location.hash = '#background=none';

// Run without data for speed (tests which need data can set it up themselves)
iD.fileFetcher.assetPath('../../dist/');
var cached = iD.fileFetcher.cache();

// Initializing `coreContext` will try loading the locale data and English locale strings:
cached.locales = { en: { rtl: false, pct: 1 } };
cached.locales_index_general = { en: { rtl: false, pct: 1 } };
cached.locales_index_tagging = { en: { rtl: false, pct: 1 } };


// Load the actual data from `dist/locales/` for the 'general' scope
iD.localizer.loadLocale('en', 'general', 'locales');


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



window.d3 = iD.d3;   // Remove this if we can avoid exporting all of d3.js
window.sdk = iD.sdk;
delete window.PointerEvent;  // force the brower to use mouse events

// // some sticky fallbacks
// const capabilities = `<?xml version="1.0" encoding="UTF-8"?>
// <osm version="0.6" generator="OpenStreetMap server" copyright="OpenStreetMap and contributors" attribution="http://www.openstreetmap.org/copyright" license="http://opendatacommons.org/licenses/odbl/1-0/">
//   <api>
//     <version minimum="0.6" maximum="0.6"/>
//     <area maximum="0.25"/>
//     <note_area maximum="25"/>
//     <tracepoints per_page="5000"/>
//     <waynodes maximum="2000"/>
//     <changesets maximum_elements="10000"/>
//     <timeout seconds="300"/>
//     <status database="online" api="online" gpx="online"/>
//   </api>
//   <policy>
//     <imagery>
//       <blacklist regex=".*\.google(apis)?\..*/(vt|kh)[\?/].*([xyz]=.*){3}.*"/>
//       <blacklist regex="http://xdworld\.vworld\.kr:8080/.*"/>
//       <blacklist regex=".*\.here\.com[/:].*"/>
//     </imagery>
//   </policy>
// </osm>`;

// fetchMock.sticky('https://www.openstreetmap.org/api/capabilities', capabilities, {sticky: true});
// fetchMock.sticky('http://www.openstreetmap.org/api/capabilities', capabilities, {sticky: true});

// fetchMock.config.fallbackToNetwork = true;
// fetchMock.config.overwriteRoutes = false;
