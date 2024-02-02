import { utilObjectOmit, utilQsString } from '@rapid-sdk/util';
import debounce from 'lodash-es/debounce.js';

import { AbstractSystem } from '../core/AbstractSystem.js';
import { utilFetchResponse } from '../util/index.js';


const TAGINFO_API = 'https://taginfo.openstreetmap.org/api/4/';

const tag_sorts = {
  point: 'count_nodes',
  vertex: 'count_nodes',
  area: 'count_ways',
  line: 'count_ways'
};
const tag_sort_members = {
  point: 'count_node_members',
  vertex: 'count_node_members',
  area: 'count_way_members',
  line: 'count_way_members',
  relation: 'count_relation_members'
};
const tag_filters = {
  point: 'nodes',
  vertex: 'nodes',
  area: 'ways',
  line: 'ways'
};
const tag_members_fractions = {
  point: 'count_node_members_fraction',
  vertex: 'count_node_members_fraction',
  area: 'count_way_members_fraction',
  line: 'count_way_members_fraction',
  relation: 'count_relation_members_fraction'
};



/**
 * `TaginfoService`
 */
export class TaginfoService extends AbstractSystem {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'taginfo';

    this._inflight = {};
    this._cache = {};
    this._popularKeys = {
      // manually exclude some keys – iD#5377, iD#7485
      postal_code: true,
      full_name: true,
      loc_name: true,
      reg_name: true,
      short_name: true,
      sorting_name: true,
      artist_name: true,
      nat_name: true,
      long_name: true,
      'bridge:name': true
    };

    // Ensure methods used as callbacks always have `this` bound correctly.
    this.keys = this.keys.bind(this);
    this.multikeys = this.multikeys.bind(this);
    this.values = this.values.bind(this);
    this.roles = this.roles.bind(this);
    this.docs = this.docs.bind(this);
    this._request = this._request.bind(this);
    this._debouncedRequest = debounce(this._request, 300, { leading: false });
  }


  /**
   * initAsync
   * Called after all core objects have been constructed.
   * @return {Promise} Promise resolved when this component has completed initialization
   */
  initAsync() {
    return Promise.resolve();
  }


  /**
   * startAsync
   * Called after all core objects have been initialized.
   * @return {Promise} Promise resolved when this component has completed startup
   */
  startAsync() {
    const langCode = this.context.systems.l10n.languageCode();

    // Fetch popular keys.  We'll exclude these from `values`
    // lookups because they stress taginfo, and they aren't likely
    // to yield meaningful autocomplete results.. see iD#3955
    const params = {
      rp: 100,
      sortname: 'values_all',
      sortorder: 'desc',
      page: 1,
      debounce: false,
      lang: langCode
    };

    return new Promise((resolve, reject) => {
      this.keys(params, (err, results) => {
        if (err) {
          reject();
        } else {
          for (const d of results) {
            if (d.value === 'opening_hours') continue;  // exception
            this._popularKeys[d.value] = true;
          }

          this._started = true;
          resolve();
        }
      });

    });
  }


  /**
   * resetAsync
   * Called after completing an edit session to reset any internal state
   * @return {Promise} Promise resolved when this component has completed resetting
   */
  resetAsync() {
    this._debouncedRequest.cancel();
    Object.values(this._inflight).forEach(controller => controller.abort());
    this._inflight = {};

    return Promise.resolve();
  }


  /**
   * keys
   * @param  params
   * @param  callback
   */
  keys(params, callback) {
    const langCode = this.context.systems.l10n.languageCode();
    const doRequest = params.debounce ? this._debouncedRequest : this._request;
    params = this._clean(this._setSort(params));
    params = Object.assign({
      rp: 10,
      sortname: 'count_all',
      sortorder: 'desc',
      page: 1,
      lang: langCode
    }, params);

    const url = TAGINFO_API + 'keys/all?' + utilQsString(params);
    doRequest(url, params, false, callback, (err, result) => {
      if (err) {
        callback(err);
      } else {
        const f = this._filterKeys(params.filter);
        const vals = result.data.filter(f).sort(this._sortKeys).map(this._valKey);
        this._cache[url] = vals;
        callback(null, vals);
      }
    });
  }


  /**
   * multikeys
   * @param  params
   * @param  callback
   */
  multikeys(params, callback) {
    const langCode = this.context.systems.l10n.languageCode();
    const doRequest = params.debounce ? this._debouncedRequest : this._request;
    params = this._clean(this._setSort(params));
    params = Object.assign({
      rp: 25,
      sortname: 'count_all',
      sortorder: 'desc',
      page: 1,
      lang: langCode
    }, params);

    const prefix = params.query;
    const url = TAGINFO_API + 'keys/all?' + utilQsString(params);
    doRequest(url, params, true, callback, (err, result) => {
      if (err) {
        callback(err);
      } else {
        const f = this._filterMultikeys(prefix);
        const vals = result.data.filter(f).map(this._valKey);
        this._cache[url] = vals;
        callback(null, vals);
      }
    });
  }


  /**
   * values
   * @param  params
   * @param  callback
   */
  values(params, callback) {
    // Exclude popular keys from values lookups.. see iD#3955
    const key = params.key;
    if (key && this._popularKeys[key]) {
      callback(null, []);
      return;
    }

    const langCode = this.context.systems.l10n.languageCode();
    const doRequest = params.debounce ? this._debouncedRequest : this._request;
    params = this._clean(this._setSort(this._setFilter(params)));
    params = Object.assign({
      rp: 25,
      sortname: 'count_all',
      sortorder: 'desc',
      page: 1,
      lang: langCode
    }, params);

    const url = TAGINFO_API + 'key/values?' + utilQsString(params);
    doRequest(url, params, false, callback, (err, result) => {
      if (err) {
        callback(err);
      } else {
        // In most cases we prefer taginfo value results with lowercase letters.
        // A few OSM keys expect values to contain uppercase values (see iD#3377).
        // This is not an exhaustive list (e.g. `name` also has uppercase values)
        // but these are the fields where taginfo value lookup is most useful.
        const re = /network|taxon|genus|species|brand|grape_constiety|royal_cypher|listed_status|booth|rating|stars|:output|_hours|_times|_ref|manufacturer|country|target|brewery/;
        const allowUpperCase = re.test(params.key);
        const f = this._filterValues(allowUpperCase);

        const vals = result.data.filter(f).map(this._valKeyDescription);
        this._cache[url] = vals;
        callback(null, vals);
      }
    });
  }


  /**
   * roles
   * @param  params
   * @param  callback
   */
  roles(params, callback) {
    const langCode = this.context.systems.l10n.languageCode();
    const doRequest = params.debounce ? this._debouncedRequest : this._request;
    const geometry = params.geometry;
    params = this._clean(this._setSortMembers(params));
    params = Object.assign({
      rp: 25,
      sortname: 'count_all_members',
      sortorder: 'desc',
      page: 1,
      lang: langCode
    }, params);

    const url = TAGINFO_API + 'relation/roles?' + utilQsString(params);
    doRequest(url, params, true, callback, (err, result) => {
      if (err) {
        callback(err);
      } else {
        const f = this._filterRoles(geometry);
        const vals = result.data.filter(f).map(this._roleKey);
        this._cache[url] = vals;
        callback(null, vals);
      }
    });
  }


  docs(params, callback) {
    const doRequest = params.debounce ? this._debouncedRequest : this._request;
    params = this._clean(this._setSort(params));

    let path = 'key/wiki_pages?';
    if (params.value) {
      path = 'tag/wiki_pages?';
    } else if (params.rtype) {
      path = 'relation/wiki_pages?';
    }

    const url = TAGINFO_API + path + utilQsString(params);
    doRequest(url, params, true, callback, (err, result) => {
      if (err) {
        callback(err);
      } else {
        this._cache[url] = result.data;
        callback(null, result.data);
      }
    });
  }


  _sets(params, n, o) {
    if (params.geometry && o[params.geometry]) {
      params[n] = o[params.geometry];
    }
    return params;
  }

  _setFilter(params) {
    return this._sets(params, 'filter', tag_filters);
  }

  _setSort(params) {
    return this._sets(params, 'sortname', tag_sorts);
  }

  _setSortMembers(params) {
    return this._sets(params, 'sortname', tag_sort_members);
  }

  _clean(params) {
    return utilObjectOmit(params, ['geometry', 'debounce']);
  }


  _filterKeys(type) {
    const count_type = type ? 'count_' + type : 'count_all';
    return d => parseFloat(d[count_type]) > 2500 || d.in_wiki;
  }

  _filterMultikeys(prefix) {
    return d => {
      // d.key begins with prefix, and d.key contains no additional ':'s
      const re = new RegExp('^' + prefix + '(.*)$');
      const matches = d.key.match(re) || [];
      return (matches.length === 2 && matches[1].indexOf(':') === -1);
    };
  }

  _filterValues(allowUpperCase) {
    return d => {
      if (d.value.match(/[;,]/) !== null) return false;  // exclude some punctuation
      if (!allowUpperCase && d.value.match(/[A-Z*]/) !== null) return false;  // exclude uppercase letters
      return parseFloat(d.fraction) > 0.0;
    };
  }

  _filterRoles(geometry) {
    return d => {
      if (d.role === '') return false; // exclude empty role
      if (d.role.match(/[A-Z*;,]/) !== null) return false;  // exclude uppercase letters and some punctuation
      return parseFloat(d[tag_members_fractions[geometry]]) > 0.0;
    };
  }

  _valKey(d) {
    return {
      value: d.key,
      title: d.key
    };
  }


  _valKeyDescription(d) {
    const obj = {
      value: d.value,
      title: d.description || d.value
    };
    if (d.count) {
      obj.count = d.count;
    }
    return obj;
  }


  _roleKey(d) {
    return {
      value: d.role,
      title: d.role
    };
  }


  // sort keys with ':' lower than keys without ':'
  _sortKeys(a, b) {
    return (a.key.indexOf(':') === -1 && b.key.indexOf(':') !== -1) ? -1
      : (a.key.indexOf(':') !== -1 && b.key.indexOf(':') === -1) ? 1
      : 0;
  }



  _request(url, params, exactMatch, callback, loaded) {
    if (this._inflight[url]) return;
    if (this._checkCache(url, params, exactMatch, callback)) return;

    const controller = new AbortController();
    this._inflight[url] = controller;

    fetch(url, { signal: controller.signal })
      .then(utilFetchResponse)
      .then(result => {
        delete this._inflight[url];
        if (loaded) loaded(null, result);
      })
      .catch(err => {
        delete this._inflight[url];
        if (err.name === 'AbortError') return;
        if (loaded) loaded(err.message);
      });
  }


  _checkCache(url, params, exactMatch, callback) {
    const rp = params.rp ?? 25;
    let testQuery = params.query ?? '';
    let testUrl = url;

    do {
      const hit = this._cache[testUrl];

      // exact match, or shorter match yielding fewer than max results (rp)
      if (hit && (url === testUrl || hit.length < rp)) {
        callback(null, hit);
        return true;
      }

      // don't try to shorten the query
      if (exactMatch || !testQuery.length) return false;

      // do shorten the query to see if we already have a cached result
      // that has returned fewer than max results (rp)
      testQuery = testQuery.slice(0, -1);
      testUrl = url.replace(/&query=(.*?)&/, `&query=${testQuery}&`);
    } while (testQuery.length >= 0);

    return false;
  }

}
