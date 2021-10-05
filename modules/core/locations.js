import { spawn, Worker } from 'threads';
import whichPolygon from 'which-polygon';

import avro from 'avsc/etc/browser/avsc-types';
const decoder = new TextDecoder();
let _mainLocations = coreLocations(); // singleton
export { _mainLocations as locationManager };


//
// `coreLocations` maintains an internal index of all the boundaries/geofences used by iD.
// It's used by presets, community index, background imagery, to know where in the world these things are valid.
// These geofences should be defined by `locationSet` objects:
//
// let locationSet = {
//   include: [ Array of locations ],
//   exclude: [ Array of locations ]
// };
//
// For more info see the location-conflation and country-coder projects, see:
// https://github.com/ideditor/location-conflation
// https://github.com/ideditor/country-coder
//
export function coreLocations() {
  let _worker = spawn(new Worker('dist/worker.js'));
  let _inProcess = null;        // Promise for any in process queue work
  let _queue = [];              // queue of objects to merge
  let _resolvedFeatures = {};   // cache of resolved locationSet features
  let _wp;                      // instance of a which-polygon index

  // Pre-resolve and index the worldwide locationSet, so that early calls to `locationsAt` don't fail.
  (function _init() {
    const world = {
      type: 'Feature',
      id: '+[Q2]',
      properties: { id: '+[Q2]', area: 511207893.3958111 },
      geometry: { type: 'Polygon', coordinates: [[[-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]]] }
    };
    _resolvedFeatures[world.id] = world;
    _wp = whichPolygon({ features: [world] });
  })();


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


  const _this = {
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
    mergeCustomGeoJSON: (featureCollection) => {
      return _worker.then(w => w.mergeCustomGeoJSON(featureCollection));
    },

    //
    // `mergeLocationSets`
    //  Accepts an Array of Objects that have locationSet properties.
    //  These may be presets or other objects used elsewhere in iD.
    //
    //  The locationSets will be resolved into GeoJSON in a background task.
    //    [{ include: ['world']}, {include: ['usa']}, {include: ['q2']}, … ]
    //
    //  Returns a Promise fulfilled when the resolving/indexing has been completed
    //
    mergeLocationSets: (objects) => {
      if (!Array.isArray(objects)) return Promise.reject('nothing to do');

      _queue.push(objects);

      if (_inProcess) return _inProcess;

      return _inProcess = processQueue()
        .then(() => {
console.time('main thread: which-polygon index rebuilt');
          // Rebuild the whichPolygon index with whatever features we now have in the cache...
          _wp = whichPolygon({ features: Object.values(_resolvedFeatures) });
console.timeEnd('main thread: which-polygon index rebuilt');
          _inProcess = null;
        });


      function processQueue() {
        if (!_queue.length) return Promise.resolve();

        const objects = _queue.shift();
        const locationSets = objects.map(obj => {
          if (!obj.locationSet)          obj.locationSet = {};
          if (!obj.locationSet.include)  obj.locationSet.include = ['Q2'];  // default worldwide
          return obj.locationSet;
        });
console.log(`main thread: sending ${objects.length} objects`);

        return _worker
          .then(w => w.mergeLocationSets(locationSets))  // 🏓  Send locationSets to worker
          .then(buf => {                             // 🏓  Receive message from worker

console.log(`Transfer finished at ${Date.now()}`);

// POSTMESSAGE:
// const message = buf;

// TRANSFEROBJECT (TextDecoder):
// console.time('main thread: unpack');
// const message = JSON.parse(decoder.decode(buf));
// console.timeEnd('main thread: unpack');

// TRANSFEROBJECT (Avro):
console.time('main thread: unpack');
const message = avroType.fromBuffer(Buffer.from(buf));
console.timeEnd('main thread: unpack');

            // Decorate the objects with resolved locationSetIDs..
            message.locationSetIDs.forEach((val, index) => objects[index].locationSetID = val);

            // Add new features into _resolvedFeatures cache
            message.newFeatures.forEach(feature => {
              _resolvedFeatures[feature.id] = feature;  // insert into cache
            });

            // // Add new features into _resolvedFeatures cache
            // Object.entries(message.newFeatures).forEach(([locationSetID, feature]) => {
            //   // Important: always use the locationSet `id` (`+[Q30]`), not the feature `id` (`Q30`)
            //   // Also Important: on the main thread these are copies, so we're free to modify them.
            //   feature.id = locationSetID;
            //   feature.properties.id = locationSetID;
            //   _resolvedFeatures[locationSetID] = feature;  // insert into cache
            // });
          })
          .then(() => processQueue())
          .catch((err) => {
            console.error(err);
            debugger;
          });
      }
    },


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
    feature: (locationSetID) => {
      return _resolvedFeatures[locationSetID] || _resolvedFeatures['+[Q2]'];
    },

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
    locationsAt: (loc) => {
      let result = {};
      (_wp(loc, true) || []).forEach(prop => result[prop.id] = prop.area);
      return result;
    },

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
    query: (loc, multi) => {
      return _wp(loc, multi);
    }
  };


  return _this;
}
