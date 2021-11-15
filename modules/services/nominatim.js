import { dispatch as d3_dispatch } from 'd3-dispatch';
import { json as d3_json } from 'd3-fetch';
import { Extent } from '@id-sdk/extent';
import { utilQsString } from '@id-sdk/util';
import RBush from 'rbush';

import { utilRebind } from '../util';


const APIROOT = 'https://nominatim.openstreetmap.org';
const dispatch = d3_dispatch('busy', 'idle');

let _jobs = new Set();
let _inflight = {};
let _nominatimCache;


function beginJob(id) {
  if (_jobs.has(id)) return;
  _jobs.add(id);
  if (_jobs.size === 1) {
    dispatch.call('busy');
  }
}

function endJob(id) {
  if (!_jobs.has(id)) return;
  _jobs.delete(id);
  if (_jobs.size === 0) {
    dispatch.call('idle');
  }
}


export default {

  init: function() {
    this.event = utilRebind(this, dispatch, 'on');
    _inflight = {};
    _nominatimCache = new RBush();
  },

  reset: function() {
    Object.values(_inflight).forEach(controller => controller.abort());
    _inflight = {};
    _nominatimCache = new RBush();
  },


  countryCode: function (location, callback) {
    this.reverse(location, (err, result) => {
      if (err) {
        return callback(err);
      } else if (result.address) {
        return callback(null, result.address.country_code);
      } else {
        return callback('Unable to geocode', null);
      }
    });
  },


  reverse: function (loc, callback) {
    let cached = _nominatimCache.search(
      { minX: loc[0], minY: loc[1], maxX: loc[0], maxY: loc[1] }
    );

    if (cached.length > 0) {
      if (callback) callback(null, cached[0].data);
      return;
    }

    const params = { zoom: 13, format: 'json', addressdetails: 1, lat: loc[1], lon: loc[0] };
    const url = `${APIROOT}/reverse?` + utilQsString(params);
    if (_inflight[url]) return;

    const controller = new AbortController();
    _inflight[url] = controller;

    beginJob(url);
    d3_json(url, { signal: controller.signal })
      .then(result => {
        delete _inflight[url];
        if (result && result.error) {
          throw new Error(result.error);
        }
        const extent = new Extent(loc).padByMeters(200);
        _nominatimCache.insert(Object.assign(extent.bbox(), {data: result}));
        if (callback) callback(null, result);
      })
      .catch(err => {
        delete _inflight[url];
        if (err.name === 'AbortError') return;
        if (callback) callback(err.message);
      })
      .finally(() => endJob(url));
  },


  search: function (val, callback) {
    const searchVal = encodeURIComponent(val);
    const url = `${APIROOT}/search/${searchVal}?limit=10&format=json`;
    if (_inflight[url]) return;

    const controller = new AbortController();
    _inflight[url] = controller;

    beginJob(url);
    d3_json(url, { signal: controller.signal })
      .then(result => {
        delete _inflight[url];
        if (result && result.error) {
          throw new Error(result.error);
        }
        if (callback) callback(null, result);
      })
      .catch(err => {
        delete _inflight[url];
        if (err.name === 'AbortError') return;
        if (callback) callback(err.message);
      })
      .finally(() => endJob(url));
  }

};
