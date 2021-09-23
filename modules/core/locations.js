import { spawn, Worker } from 'threads';

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

  // proxy everything to the worker
  const _this = {
    mergeCustomGeoJSON: (featureCollection) => {
      return _worker.then(w => w.mergeCustomGeoJSON(featureCollection));
    },

    mergeLocationSets: (objects) => {
      if (!Array.isArray(objects)) return Promise.reject('nothing to do');
      const locationSets = objects.map(object => {
        if (!object.locationSet) {
          object.locationSet = { include: ['Q2'] };  // default worldwide
        }
        return object.locationSet;
      });

      return _worker
        .then(w => w.mergeLocationSets(locationSets))
        .then(results => {
          results.forEach((val, index) => objects[index].locationSetID = val);
          return objects;
        });
    },

    locationSetID: (locationSet) => {
      return _worker.then(w => w.locationSetID(locationSet));   // ✨ memoize?
    },

    feature: (locationSetID) => {
      return _worker.then(w => w.feature(locationSetID));   // ✨ memoize?
    },

    locationsAt: (loc) => {
      return _worker.then(w => w.locationsAt(loc));   // ✨ memoize?
    },

    query: (loc, multi) => {
      return _worker.then(w => w.query(loc, multi));
    }

  // // Direct access to the location-conflation resolver
  // _this.loco = () => _loco;

  // // Direct access to the which-polygon index
  // _this.wp = () => _wp;

  };

  return _this;
}
