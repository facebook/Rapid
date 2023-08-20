/* eslint-disable no-console */
import fs from 'node:fs';
import prettyStringify from 'json-stringify-pretty-compact';

import imageryJSON from 'editor-layer-index/imagery.json' assert {type: 'json'};
import manualJSON from '../data/manual_imagery.json' assert {type: 'json'};

// Merge imagery sources - `manualJSON` will override `imageryJSON`
let sources = new Map();
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


// ignore imagery more than 30 years old..
let cutoffDate = new Date();
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



let imagery = [];
for (const [sourceID, source] of sources) {
  if (source.type !== 'tms' && source.type !== 'wms' && source.type !== 'bing') {
    // console.log(`discarding ${sourceID}  (type ${source.type})`);
    continue;
  }
  if (discard.some(regex => regex.test(sourceID))) {
    // console.log(`discarding ${sourceID}  (discard regex)`);
    continue;
  }

  let item = {
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

  if (sourceID === 'mapbox_locator_overlay') {
    item.overzoom = false;
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

fs.writeFileSync('data/imagery.json', prettyStringify(imagery));
fs.writeFileSync('dist/data/imagery.min.json', JSON.stringify(imagery));
