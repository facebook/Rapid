import calcArea from '@mapbox/geojson-area';
import LocationConflation from '@ideditor/location-conflation';

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
//    "type": "FeatureCollection"
//    "features": [
//      {
//        "type": "Feature",
//        "id": "philly_metro.geojson",
//        "properties": { … },
//        "geometry": { … }
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
//     locationSetIDs: […],                 // Array of locationSetIDs (1 for each object)
//     newFeatures:    Map(id -> geojson)   // Map of new (unseen) GeoJSON features
//   }
//
function _mergeLocationSets(locationSets) {
  let message = { locationSetIDs: [], newFeatures: new Map() };

  (locationSets || []).forEach(locationSet => {
    const resolved = _resolveLocationSet(locationSet);
    message.locationSetIDs.push(resolved.id);

    if (!_seen.has(resolved.id)) {  // send only new features to keep message size down
      _seen.add(resolved.id);
      message.newFeatures.set(resolved.id, resolved.feature);
    }
  });

  return message;  // 🏓  Transfer message back to main thread
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
//     type:         'locationset'
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
