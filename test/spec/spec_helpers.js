/* globals chai:false */
/* eslint no-extend-native:off */

// Try not to load imagery
window.location.hash = '#background=none';

mocha.setup({
  timeout: 5000,  // 5 sec
  ui: 'bdd',
  globals: [
    '__onmousemove.zoom',
    '__onmouseup.zoom',
    '__onkeydown.select',
    '__onkeyup.select',
    '__onclick.draw',
    '__onclick.draw-block'
  ]
});

expect = chai.expect;

window.d3 = Rapid.d3;   // Remove this if we can avoid exporting all of d3.js
window.sdk = Rapid.sdk;
delete window.PointerEvent;  // force the brower to use mouse events

// some sticky fallbacks
const capabilities = `<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6" generator="OpenStreetMap server" copyright="OpenStreetMap and contributors" attribution="http://www.openstreetmap.org/copyright" license="http://opendatacommons.org/licenses/odbl/1-0/">
  <api>
    <version minimum="0.6" maximum="0.6"/>
    <area maximum="0.25"/>
    <note_area maximum="25"/>
    <tracepoints per_page="5000"/>
    <waynodes maximum="2000"/>
    <changesets maximum_elements="10000"/>
    <timeout seconds="300"/>
    <status database="online" api="online" gpx="online"/>
  </api>
  <policy>
    <imagery>
      <blacklist regex=".*\.google(apis)?\..*/(vt|kh)[\?/].*([xyz]=.*){3}.*"/>
      <blacklist regex="http://xdworld\.vworld\.kr:8080/.*"/>
      <blacklist regex=".*\.here\.com[/:].*"/>
    </imagery>
  </policy>
</osm>`;

fetchMock.sticky('https://www.openstreetmap.org/api/capabilities', capabilities, {sticky: true});
fetchMock.sticky('http://www.openstreetmap.org/api/capabilities', capabilities, {sticky: true});

fetchMock.config.fallbackToNetwork = false;
fetchMock.config.overwriteRoutes = false;
