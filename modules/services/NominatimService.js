import { json as d3_json } from 'd3-fetch';
import { Extent } from '@rapid-sdk/math';
import { utilQsString } from '@rapid-sdk/util';
import RBush from 'rbush';

import { AbstractService } from './AbstractService';


/**
 * `NominatimService`
 */
export class NominatimService extends AbstractService {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'nominatim';

    this.apibase = 'https://nominatim.openstreetmap.org/';
    this._inflight = {};
    this._nominatimCache = new RBush();

    // Ensure methods used as callbacks always have `this` bound correctly.
    this.countryCode = this.countryCode.bind(this);
    this.reverse = this.reverse.bind(this);
    this.search = this.search.bind(this);
  }


  /**
   * init
   * Called one time after all core objects have been instantiated.
   */
  init() {
  }


  /**
   * reset
   * Called after completing an edit session to reset any internal state
   */
  reset() {
    Object.values(this._inflight).forEach(controller => controller.abort());
    this._inflight = {};
    this._nominatimCache = new RBush();
  }


  /**
   * countryCode
   * @param  loc      [lon,lat]
   * @param  callback
   */
  countryCode(loc, callback) {
    this.reverse(loc, (err, result) => {
      if (err) {
        return callback(err);
      } else if (result.address) {
        return callback(null, result.address.country_code);
      } else {
        return callback('Unable to geocode', null);
      }
    });
  }


  /**
   * reverse
   * @param  loc      [lon,lat]
   * @param  callback
   */
  reverse(loc, callback) {
    const cached = this._nominatimCache.search(
      { minX: loc[0], minY: loc[1], maxX: loc[0], maxY: loc[1] }
    );

    if (cached.length > 0) {
      if (callback) callback(null, cached[0].data);
      return;
    }

    const params = { zoom: 13, format: 'json', addressdetails: 1, lat: loc[1], lon: loc[0] };
    const url = this.apibase + 'reverse?' + utilQsString(params);
    if (this._inflight[url]) return;

    const controller = new AbortController();
    this._inflight[url] = controller;

    const l10n = this.context.localizationSystem();
    const opts = {
      signal: controller.signal,
      headers: { 'Accept-Language': l10n.localeCodes().join(',') }
    };

    d3_json(url, opts)
      .then(result => {
        delete this._inflight[url];
        if (result?.error) {
          throw new Error(result.error);
        }
        const extent = new Extent(loc).padByMeters(200);
        this._nominatimCache.insert(Object.assign(extent.bbox(), { data: result }));
        if (callback) callback(null, result);
      })
      .catch(err => {
        delete this._inflight[url];
        if (err.name === 'AbortError') return;
        if (callback) callback(err.message);
      });
  }


  /**
   * search
   * @param  val
   * @param  callback
   */
  search(val, callback) {
    const searchVal = encodeURIComponent(val);
    const url = this.apibase + `search/${searchVal}?limit=10&format=json`;
    if (this._inflight[url]) return;

    const controller = new AbortController();
    this._inflight[url] = controller;

    const l10n = this.context.localizationSystem();
    const opts = {
      signal: controller.signal,
      headers: { 'Accept-Language': l10n.localeCodes().join(',') }
    };

    d3_json(url, opts)
      .then(result => {
        delete this._inflight[url];
        if (result?.error) {
          throw new Error(result.error);
        }
        if (callback) callback(null, result);
      })
      .catch(err => {
        delete this._inflight[url];
        if (err.name === 'AbortError') return;
        if (callback) callback(err.message);
      });
  }

}
