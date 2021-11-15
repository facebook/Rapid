import { dispatch as d3_dispatch } from 'd3-dispatch';
import { json as d3_json } from 'd3-fetch';
import { utilQsString } from '@id-sdk/util';

import { utilRebind } from '../util';

const APIROOT = 'https://en.wikipedia.org/w/api.php?';
const dispatch = d3_dispatch('busy', 'idle');

let _jobs = new Set();

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
  },

  reset: function() {},

  search: function(lang, query, callback) {
    if (!query) {
      if (callback) callback('No Query', []);
      return;
    }

    lang = lang || 'en';
    const url = APIROOT.replace('en', lang) +
      utilQsString({
        action: 'query',
        list: 'search',
        srlimit: '10',
        srinfo: 'suggestion',
        format: 'json',
        origin: '*',
        srsearch: query
      });

    beginJob(url);
    d3_json(url)
      .then(result => {
        if (result && result.error) {
          throw new Error(result.error);
        } else if (!result || !result.query || !result.query.search) {
          throw new Error('No Results');
        }
        if (callback) {
          const titles = result.query.search.map(d => d.title);
          callback(null, titles);
        }
      })
      .catch(err => {
        if (callback) callback(err, []);
      })
      .finally(() => endJob(url));
  },


  suggestions: function(lang, query, callback) {
    if (!query) {
      if (callback) callback('', []);
      return;
    }

    lang = lang || 'en';
    const url = APIROOT.replace('en', lang) +
      utilQsString({
        action: 'opensearch',
        namespace: 0,
        suggest: '',
        format: 'json',
        origin: '*',
        search: query
      });

    beginJob(url);
    d3_json(url)
      .then(result => {
        if (result && result.error) {
          throw new Error(result.error);
        } else if (!result || result.length < 2) {
          throw new Error('No Results');
        }
        if (callback) callback(null, result[1] || []);
      })
      .catch(err => {
        if (callback) callback(err.message, []);
      })
      .finally(() => endJob(url));
  },


  translations: function(lang, title, callback) {
    if (!title) {
      if (callback) callback('No Title');
      return;
    }

    const url = APIROOT.replace('en', lang) +
      utilQsString({
        action: 'query',
        prop: 'langlinks',
        format: 'json',
        origin: '*',
        lllimit: 500,
        titles: title
      });

    beginJob(url);
    d3_json(url)
      .then(result => {
        if (result && result.error) {
          throw new Error(result.error);
        } else if (!result || !result.query || !result.query.pages) {
          throw new Error('No Results');
        }
        if (callback) {
          const list = result.query.pages[Object.keys(result.query.pages)[0]];
          let translations = {};
          if (list && list.langlinks) {
            list.langlinks.forEach(d => translations[d.lang] = d['*']);
          }
          callback(null, translations);
        }
      })
      .catch(err => {
        if (callback) callback(err.message);
      })
      .finally(() => endJob(url));
  }

};
