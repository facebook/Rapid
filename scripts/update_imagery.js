/* eslint-disable no-console */
import fs from 'node:fs';
import JSON5 from 'json5';
import prettyStringify from 'json-stringify-pretty-compact';

// Load source data
const imageryFile = 'node_modules/editor-layer-index/imagery.json';
const manualFile = 'data/manual_imagery.json';
const imageryJSON = JSON5.parse(fs.readFileSync(imageryFile, 'utf8'));
const manualJSON = JSON5.parse(fs.readFileSync(manualFile, 'utf8')).manualImagery;


//
// This script processes files used to know what background imagery is available
//  data/manual_imagery.json   - our customizations
//  data/imagery.json          - sourced from `editor-layer-index`
//  data/wayback.json          - sourced from Esri's waybackconfig file in S3
//

// Merge imagery sources - `manualJSON` will override `imageryJSON`
const sources = new Map();
for (const source of imageryJSON) {
  if (!source.id) continue;
  if (sources.has(source.id)) {
    console.warn(`duplicate imagery id = ${source.id}`);
  }
  sources.set(source.id, source);
}
for (const source of manualJSON) {
  if (!source.id) continue;
  sources.set(source.id, source);
}


// Ignore imagery more than 30 years old..
const cutoffDate = new Date();
cutoffDate.setFullYear(cutoffDate.getFullYear() - 30);


const discard = [
  /^osmbe$/,                              // 'OpenStreetMap (Belgian Style)'
  /^osmfr(-(basque|breton|occitan))?$/,   // 'OpenStreetMap (French, Basque, Breton, Occitan Style)'
  /^osm-mapnik-german_style$/,            // 'OpenStreetMap (German Style)'
  /^HDM_HOT$/,                            // 'OpenStreetMap (HOT Style)'
  /^osm-mapnik-black_and_white$/,         // 'OpenStreetMap (Standard Black & White)'
  /^osm-mapnik-no_labels$/,               // 'OpenStreetMap (Mapnik, no labels)'
  /^OpenStreetMap-turistautak$/,          // 'OpenStreetMap (turistautak)'

  /^cyclosm$/,                            // 'CyclOSM'
  /^geoscribble$/,                        // 'GeoScribble' overlays (we built a service for this instead)
  /^hike_n_bike$/,                        // 'Hike & Bike'
  /^landsat$/,                            // 'Landsat'
  /^skobbler$/,                           // 'Skobbler'
  /^public_transport_oepnv$/,             // 'Public Transport (ÖPNV)'
  /^tf-(cycle|landscape|outdoors)$/,      // 'Thunderforest OpenCycleMap, Landscape, Outdoors'
  /^qa_no_address$/,                      // 'QA No Address'
  /^wikimedia-map$/,                      // 'Wikimedia Map'

  /^openpt_map$/,
  /^openrailwaymap$/,
  /^openseamap$/,
  /^opensnowmap-overlay$/,

  /^osmim-/,                   // low zoom osmim imagery
  /^US-TIGER-Roads-201\d/,     // older than 2020
  /^Waymarked_Trails/,         // Waymarked Trails *
  /^OSM_Inspector/,            // OSM Inspector *
  /^EOXAT/                     // EOX AT *  (iD#9807)
];


const supportedWMSProjections = [
  // Web Mercator
  'EPSG:3857',
  // alternate codes used for Web Mercator
  'EPSG:900913',
  'EPSG:3587',
  'EPSG:54004',
  'EPSG:41001',
  'EPSG:102113',
  'EPSG:102100',
  'EPSG:3785',
  // WGS 84 (Equirectangular)
  'EPSG:4326'
];



const imagery = [];
for (const [sourceID, source] of sources) {
  if (source.type !== 'tms' && source.type !== 'wms' && source.type !== 'bing') {
    // console.log(`discarding ${sourceID}  (type ${source.type})`);
    continue;
  }
  if (discard.some(regex => regex.test(sourceID))) {
    // console.log(`discarding ${sourceID}  (discard regex)`);
    continue;
  }

  const item = {
    id: sourceID,
    name: source.name,
    type: source.type,
    template: source.url
  };

  // Some sources support 512px tiles
  if (sourceID === 'mtbmap-no') {
    item.tileSize = 512;
  }

//  if (sourceID === 'Mapbox') {
//    item.template = item.template.replace('.jpg', '@2x.jpg');
//    item.tileSize = 512;
//  } else if (sourceID === 'mapbox_locator_overlay') {
//    item.template = item.template.replace('{y}', '{y}{@2x}');
//  }

  // Some WMS sources are supported, check projection
  if (source.type === 'wms') {
    const projection = source.available_projections && supportedWMSProjections.find(p => source.available_projections.indexOf(p) !== -1);
    if (!projection) {
      // console.log(`discarding ${sourceID}  (no supported projection)`);
      continue;
    }
    // if (sources.some(other => other.name === source.name && other.type !== source.type)) continue;
    item.projection = projection;
  }


  let startDate, endDate, isValid;

  if (source.end_date) {
    endDate = new Date(source.end_date);
    isValid = !isNaN(endDate.getTime());
    if (isValid) {
      if (endDate <= cutoffDate) {
        // console.log(`discarding ${sourceID}  (${endDate.toDateString()} too old)`);
        continue;
      }
      item.endDate = endDate;
    }
  }

  if (source.start_date) {
    startDate = new Date(source.start_date);
    isValid = !isNaN(startDate.getTime());
    if (isValid) {
      item.startDate = startDate;
    }
  }

  let extent = source.extent || {};
  if (extent.min_zoom || extent.max_zoom) {
    item.zoomExtent = [
      extent.min_zoom || 0,
      extent.max_zoom || 22
    ];
  }

  if (source.zoomRange) {
    item.zoomRange = source.zoomRange;
  }

  if (extent.polygon) {
    item.polygon = extent.polygon;
  } else if (extent.bbox) {
    item.polygon = [[
      [extent.bbox.min_lon, extent.bbox.min_lat],
      [extent.bbox.min_lon, extent.bbox.max_lat],
      [extent.bbox.max_lon, extent.bbox.max_lat],
      [extent.bbox.max_lon, extent.bbox.min_lat],
      [extent.bbox.min_lon, extent.bbox.min_lat]
    ]];
  }

  const attribution = source.attribution || {};
  if (attribution.url) {
    item.terms_url = attribution.url;
  }
  if (attribution.text) {
    item.terms_text = attribution.text;
  }
  if (attribution.html) {
    item.terms_html = attribution.html;
  }

  ['best', 'default', 'description', 'encrypted', 'icon', 'overlay', 'tileSize'].forEach(prop => {
    if (source[prop]) {
      item[prop] = source[prop];
    }
  });

  imagery.push(item);
};


imagery.sort((a, b) => a.name.localeCompare(b.name));
fs.writeFileSync('data/imagery.json', prettyStringify({ imagery: imagery }) + '\n');


// We'll mirror the wayback config file, it's not available everywhere - see Rapid#1445
fetch('https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json')
  .then(response => {
    if (!response.ok) throw new Error(response.status + ' ' + response.statusText);
    if (response.status === 204 || response.status === 205) return;
    return response.json();
  })
  .then(data => {
    fs.writeFileSync('data/wayback.json', prettyStringify({ wayback: data }) + '\n');
  });
