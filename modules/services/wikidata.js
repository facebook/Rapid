import { dispatch as d3_dispatch } from 'd3-dispatch';
import { json as d3_json } from 'd3-fetch';
import { utilQsString } from '@id-sdk/util';

import { localizer } from '../core/localizer';
import { utilRebind } from '../util';

const APIROOT = 'https://www.wikidata.org/w/api.php?';
const dispatch = d3_dispatch('busy', 'idle');

let _jobs = new Set();
let _wikidataCache = {};

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

  reset: function() {
    _wikidataCache = {};
  },


  // Search for Wikidata items matching the query
  itemsForSearchQuery: function(query, callback) {
    if (!query) {
      if (callback) callback('No query', {});
      return;
    }

    const lang = this.languagesToQuery()[0];

    const url = APIROOT + utilQsString({
      action: 'wbsearchentities',
      format: 'json',
      formatversion: 2,
      search: query,
      type: 'item',
      language: lang,   // the language to search
      uselang: lang,    // the language for the label and description in the result
      limit: 10,
      origin: '*'
    });

    beginJob(url);
    d3_json(url)
      .then(result => {
        if (result && result.error) {
          throw new Error(result.error);
        }
        if (callback) callback(null, result.search || {});
      })
      .catch(err => {
        if (callback) callback(err.message, {});
      })
      .finally(() => endJob(url));
  },


  // Given a Wikipedia language and article title,
  // return an array of corresponding Wikidata entities.
  itemsByTitle: function(lang, title, callback) {
    if (!title) {
      if (callback) callback('No title', {});
      return;
    }

    lang = lang || 'en';
    const url = APIROOT + utilQsString({
      action: 'wbgetentities',
      format: 'json',
      formatversion: 2,
      sites: lang.replace(/-/g, '_') + 'wiki',
      titles: title,
      languages: 'en', // shrink response by filtering to one language
      origin: '*'
    });

    beginJob(url);
    d3_json(url)
      .then(result => {
        if (result && result.error) {
          throw new Error(result.error);
        }
        if (callback) callback(null, result.entities || {});
      })
      .catch(err => {
        if (callback) callback(err.message, {});
      })
      .finally(() => endJob(url));
  },


  languagesToQuery: function() {
    return localizer.localeCodes()
      .map(code => code.toLowerCase())
      .filter(code => {
        // HACK: en-us isn't a wikidata language. We should really be filtering by
        // the languages known to be supported by wikidata.
        return code !== 'en-us';
    });
  },


  entityByQID: function(qid, callback) {
    if (!qid) {
      callback('No qid', {});
      return;
    }
    if (_wikidataCache[qid]) {
      if (callback) callback(null, _wikidataCache[qid]);
      return;
    }

    const langs = this.languagesToQuery();
    const url = APIROOT + utilQsString({
      action: 'wbgetentities',
      format: 'json',
      formatversion: 2,
      ids: qid,
      props: 'labels|descriptions|claims|sitelinks',
      sitefilter: langs.map(d => `${d}wiki`).join('|'),
      languages: langs.join('|'),
      languagefallback: 1,
      origin: '*'
    });

    beginJob(url);
    d3_json(url)
      .then(result => {
        if (result && result.error) {
          throw new Error(result.error);
        }
        if (callback) callback(null, result.entities[qid] || {});
      })
      .catch(err => {
        if (callback) callback(err.message, {});
      })
      .finally(() => endJob(url));
  },


  // Pass `params` object of the form:
  // {
  //   qid: 'string'      // brand wikidata  (e.g. 'Q37158')
  // }
  //
  // Get an result object used to display tag documentation
  // {
  //   title:        'string',
  //   description:  'string',
  //   editURL:      'string',
  //   imageURL:     'string',
  //   wiki:         { title: 'string', text: 'string', url: 'string' }
  // }
  //
  getDocs: function(params, callback) {
    const langs = this.languagesToQuery();

    this.entityByQID(params.qid, (err, entity) => {
      if (err || !entity) {
        callback(err || 'No entity');
        return;
      }

      let description;
      for (let i in langs) {
        let code = langs[i];
        if (entity.descriptions[code] && entity.descriptions[code].language === code) {
          description = entity.descriptions[code];
          break;
        }
      }
      if (!description && Object.values(entity.descriptions).length) {
        description = Object.values(entity.descriptions)[0];
      }

      // prepare result
      let result = {
        title: entity.id,
        description: description ? description.value : '',
        descriptionLocaleCode: description ? description.language : '',
        editURL: 'https://www.wikidata.org/wiki/' + entity.id
      };

      // add image
      if (entity.claims) {
        const imageroot = 'https://commons.wikimedia.org/w/index.php';
        const props = ['P154', 'P18'];  // logo image, image
        for (let i = 0; i < props.length; i++) {
          const prop = entity.claims[props[i]];
          if (prop && Object.keys(prop).length > 0) {
            const image = prop[Object.keys(prop)[0]].mainsnak.datavalue.value;
            if (image) {
              result.imageURL = imageroot + '?' + utilQsString({
                title: `Special:Redirect/file/${image}`,
                width: 400
              });
              break;
            }
          }
        }
      }

      if (entity.sitelinks) {
        const englishLocale = localizer.languageCode().toLowerCase() === 'en';

        // must be one of these that we requested..
        for (let i = 0; i < langs.length; i++) {   // check each, in order of preference
          const w = langs[i] + 'wiki';
          if (entity.sitelinks[w]) {
            const title = entity.sitelinks[w].title;
            let tKey = 'inspector.wiki_reference';
            if (!englishLocale && langs[i] === 'en') {   // user's locale isn't English but
              tKey = 'inspector.wiki_en_reference';      // we are sending them to enwiki anyway..
            }

            result.wiki = {
              title: title,
              text: tKey,
              url: 'https://' + langs[i] + '.wikipedia.org/wiki/' + title.replace(/ /g, '_')
            };
            break;
          }
        }
      }

      callback(null, result);
    });
  }

};
