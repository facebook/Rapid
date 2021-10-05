import calcArea from '@mapbox/geojson-area';
import LocationConflation from '@ideditor/location-conflation';
import { Transfer } from 'threads/worker';

import avro from 'avsc/etc/browser/avsc-types';
const encoder = new TextEncoder();

const schema =
{
  "type": "record",
  "name": "message",
  "fields": [
    { "name": "locationSetIDs", "type": { "type": "array", "items": "string" } },
    { "name": "newFeatures", "type": {
      "type": "array", "items": {
        "type": "record",
        "name": "feature",
        "fields": [
          { "name": "type", "type": {"type": "enum", "name": "Feature", "symbols": ["Feature"] }, "default": "Feature"},
          { "name": "id", "type": "string" },
          { "name": "properties", "type":
            {
              "type": "record",
              "name": "properties",
              "fields": [
                { "name": "id", "type": "string" },
                { "name": "area", "type": "float" }
              ]
            }
          },
          { "name": "geometry", "type":
            {
              "type": "record",
              "name": "PolygonOrMultiPolygon",
              "fields": [
                { "name": "type", "type": "string" },
                { "name": "coordinates", "type":
                  {
                    "type": "array", "items": {
                      "type": "array", "items": {
                        "type": "array", "items": ["float", {"type": "array", "items": "float"}]
                      }
                    }
                  }
                }
              ]
            }
          }
        ]
      }
    }
  }
  ]
};

const avroType = avro.Type.forSchema(schema);

let _loco = new LocationConflation();    // instance of a location-conflation resolver
let _seen = new Set();
//
// `coreLocations` worker-side functions
//
export const workerFunctions = {
  mergeCustomGeoJSON: (fc) => _mergeCustomGeoJSON(fc),
  mergeLocationSets: (locationSets) => _mergeLocationSets(locationSets)
};


//
// `mergeCustomGeoJSON`
//  Accepts an FeatureCollection-like object containing custom locations
//  Each feature must have a filename-like `id`, for example: `something.geojson`
//
//  {
//    type: 'FeatureCollection'
//    features: [
//      {
//        type: 'Feature',
//        id: 'philly_metro.geojson',
//        properties: { … },
//        geometry: { … }
//      }
//    ]
//  }
//
function _mergeCustomGeoJSON(fc) {
  if (fc && fc.type === 'FeatureCollection' && Array.isArray(fc.features)) {
    fc.features.forEach(feature => {
      feature.properties = feature.properties || {};
      let props = feature.properties;

      // Get `id` from either `id` or `properties`
      let id = feature.id || props.id;
      if (!id || !/^\S+\.geojson$/i.test(id)) return;

      // Ensure `id` exists and is lowercase
      id = id.toLowerCase();
      feature.id = id;
      props.id = id;

      // Ensure `area` property exists
      if (!props.area) {
        const area = calcArea.geometry(feature.geometry) / 1e6;  // m² to km²
        props.area = Number(area.toFixed(2));
      }

      _loco._cache[id] = feature;
    });
  }
}


//
// `mergeLocationSets`
//  Accepts an Array of `locationSet` Objects, like:
//    [ {include: ['world']}, {include: ['usa']}, {include: ['q2']}, … ]
//
//  Returns a result message Object like
//   {
//     locationSetIDs: […],                   // Array of locationSetIDs (1 for each object)
//     newFeatures:    Object(id -> geojson)  // Map of new (unseen) GeoJSON features
//   }
//
function _mergeLocationSets(locationSets) {
  let message = {
    locationSetIDs: [],
    newFeatures: []
  };

console.time(`worker thread: process ${locationSets.length} locationSets`);

  (locationSets || []).forEach(locationSet => {
    const resolved = _resolveLocationSet(locationSet);
    message.locationSetIDs.push(resolved.id);

    if (!_seen.has(resolved.id)) {  // send only new features to keep message size down
      _seen.add(resolved.id);

      // Important: always use the locationSet `id` (`+[Q30]`), not the feature `id` (`Q30`)
      const f = JSON.parse(JSON.stringify(resolved.feature));   // clone deep
      f.id = resolved.id;
      f.properties = {
        id: resolved.id,
        area: resolved.feature.properties.area
      };
      message.newFeatures.push(f);
    }
  });
console.timeEnd(`worker thread: process ${locationSets.length} locationSets`);

// POSTMESSAGE:
// console.log(`Transfer starting at ${Date.now()}`);
// return message;  // 🏓  Transfer message back to main thread


// TRANSFEROBJECT (TextEncode):
// console.time('worker thread: pack');
// const view = encoder.encode(JSON.stringify(message));
// console.timeEnd('worker thread: pack');
// const kilobytes = Math.round(view.byteLength / 1024);
// console.log(`Transfer starting at ${Date.now()} (${kilobytes} kilobytes)`);
// return Transfer(view.buffer);  // 🏓  Transfer message back to main thread

// TRANSFEROBJECT (Avro):
// // determine schema
// // const inferredType = avro.Type.forValue(message);
// // console.log(JSON.stringify(inferredType.schema()));
console.time('worker thread: pack');
let view;
try {
view = avroType.toBuffer(message);
} catch (e) {
console.error(e);
debugger;
}
console.timeEnd('worker thread: pack');
const kilobytes = Math.round(view.byteLength / 1024);
console.log(`Transfer starting at ${Date.now()} (${kilobytes} kilobytes)`);
return Transfer(view.buffer);  // 🏓  Transfer message back to main thread
}


// `_resolveLocationSet` (internal)
//  Accepts a `locationSet` Object like:
//   {
//     include: [ Array of locations ],
//     exclude: [ Array of locations ]
//   }
//
//  Calls LocationConflation to perform the locationSet -> GeoJSON resolution.
//
//  Returns a result like:
//   {
//     "type":         'locationset'
//     locationSet:  the queried locationSet
//     id:           the stable identifier for the feature, e.g. '+[Q2]'
//     feature:      the resolved GeoJSON feature
//   }
function _resolveLocationSet(locationSet) {
  if (!locationSet.include) {
    locationSet.include = ['Q2'];  // default worldwide
  }

  let result;
  try {
    result = _loco.resolveLocationSet(locationSet);
    if (!result.feature || !result.feature.geometry.coordinates.length || !result.feature.properties.area) {
      throw new Error(`locationSet ${result.id} resolves to an empty feature.`);
    }
  } catch (err) {
    if (typeof console !== 'undefined') console.log(err);    // eslint-disable-line
    result = _loco.resolveLocationSet({ include: ['Q2'] });  // world
  }
  return result;
}
