import calcArea from '@mapbox/geojson-area';
import LocationConflation from '@ideditor/location-conflation';
import whichPolygon from 'which-polygon';


export const workerFunctions = {
  mergeCustomGeoJSON: (fc) => _mergeCustomGeoJSON(fc),
  mergeLocationSets: (locationSets) => _mergeLocationSets(locationSets),
  locationSetID: (locationSet) => _locationSetID(locationSet),
  feature: (locationSetID) => _feature(locationSetID),
  locationsAt: (loc) => _locationsAt(loc),
  query: (loc, multi) => _query(loc, multi)
};


let _resolvedFeatures = {};              // cache of *resolved* locationSet features
let _loco = new LocationConflation();    // instance of a location-conflation resolver
let _wp;                                 // instance of a which-polygon index

(function _init() {
  // pre-resolve the worldwide locationSet
  const world = { locationSet: { include: ['Q2'] } };
  _resolveLocationSet(world);
  _rebuildIndex();
})();


// Pass a `locationSet` Object
// Performs the locationSet resolution, caches the result, and returns a `locationSetID`
function _resolveLocationSet(locationSet) {
  let result;
  if (!locationSet.include) {
    locationSet.include = ['Q2'];  // default worldwide
  }

  try {
    const resolved = _loco._resolveLocationSet(locationSet);
    const locationSetID = resolved.id;
    result = locationSetID;

    if (!resolved.feature.geometry.coordinates.length || !resolved.feature.properties.area) {
      throw new Error(`locationSet ${locationSetID} resolves to an empty feature.`);
    }
    if (!_resolvedFeatures[locationSetID]) {  // First time seeing this locationSet feature
      let feature = JSON.parse(JSON.stringify(resolved.feature));   // deep clone
      feature.id = locationSetID;      // Important: always use the locationSet `id` (`+[Q30]`), not the feature `id` (`Q30`)
      feature.properties.id = locationSetID;
      _resolvedFeatures[locationSetID] = feature;  // insert into cache
    }
  } catch (err) {
    result = '+[Q2]';
  }
  return result;
}


// Rebuilds the whichPolygon index with whatever features have been resolved.
function _rebuildIndex() {
  _wp = whichPolygon({ features: Object.values(_resolvedFeatures) });
}

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
//  Accepts an Array of `locationSet` Objects:
//  The locationSets will be resolved and indexed in the background.
//    [{ include: ['world']}, {include: ['usa']}, {include: ['q2']}, … ]
//
//  Returns a matching Array of `locationSetIDs`:
//    ['+[Q2]', '+[Q30]', '+[Q2]', … ]
//
//  Returns a Promise fulfilled when the resolving/indexing has been completed
//
function _mergeLocationSets(objects) {
  const results = (objects || []).map(_resolveLocationSet);
  _rebuildIndex();
  return results;
}


//
// `locationSetID`
// Returns a locationSetID for a given locationSet (fallback to `+[Q2]`, world)
// (The locationset doesn't necessarily need to be resolved to compute its `id`)
//
// Arguments
//   `locationSet`: A locationSet, e.g. `{ include: ['us'] }`
// Returns
//   The locationSetID, e.g. `+[Q30]`
//
function _locationSetID(locationSet) {
  let locationSetID;
  try {
    locationSetID = _loco.validateLocationSet(locationSet).id;
  } catch (err) {
    locationSetID = '+[Q2]';  // the world
  }
  return locationSetID;
}


//
// `feature`
// Returns the resolved GeoJSON feature for a given locationSetID (fallback to 'world')
//
// Arguments
//   `locationSetID`: id of the form like `+[Q30]`  (United States)
// Returns
//   A GeoJSON feature:
//   {
//     type: 'Feature',
//     id: '+[Q30]',
//     properties: { id: '+[Q30]', area: 21817019.17, … },
//     geometry: { … }
//   }
function _feature(locationSetID) {
  return _resolvedFeatures[locationSetID] || _resolvedFeatures['+[Q2]'];
}


//
// `locationsAt`
// Find all the resolved locationSets valid at the given location.
// Results include the area (in km²) to facilitate sorting.
//
// Arguments
//   `loc`: the [lon,lat] location to query, e.g. `[-74.4813, 40.7967]`
// Returns
//   Object of locationSetIDs to areas (in km²)
//   {
//     "+[Q2]": 511207893.3958111,
//     "+[Q30]": 21817019.17,
//     "+[new_jersey.geojson]": 22390.77,
//     …
//   }
//
function _locationsAt(loc) {
  let result = {};
  (_wp(loc, true) || []).forEach(prop => result[prop.id] = prop.area);
  return result;
}

//
// `query`
// Execute a query directly against which-polygon
// https://github.com/mapbox/which-polygon
//
// Arguments
//   `loc`: the [lon,lat] location to query,
//   `multi`: `true` to return all results, `false` to return first result
// Returns
//   Array of GeoJSON *properties* for the locationSet features that exist at `loc`
//
function _query(loc, multi) {
  return _wp(loc, multi);
}


// // Direct access to the location-conflation resolver
// _this.loco = () => _loco;

// // Direct access to the which-polygon index
// _this.wp = () => _wp;
