import { utilQsString } from '@rapid-sdk/util';

import { AbstractSystem } from '../core/AbstractSystem.js';
import { utilFetchResponse } from '../util/index.js';

const WIKIDATA_API = 'https://www.wikidata.org/w/api.php?';


/**
 * `WikidataService`
 */
export class WikidataService extends AbstractSystem {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'wikidata';

    this._cache = new Map();  // Map(qid -> entitydata)
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
    this._started = true;
    return Promise.resolve();
  }


  /**
   * resetAsync
   * Called after completing an edit session to reset any internal state
   * @return {Promise} Promise resolved when this component has completed resetting
   */
  resetAsync() {
    this._cache.clear();
    return Promise.resolve();
  }


  /**
   * itemsForSearchQuery
   * Search for Wikidata items matching the query
   * @param  query
   * @param  callback
   */
  itemsForSearchQuery(query, callback) {
    if (!query) {
      if (callback) callback('No query', {});
      return;
    }

    const lang = this.languagesToQuery()[0];
    const url = WIKIDATA_API + utilQsString({
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

    fetch(url)
      .then(utilFetchResponse)
      .then(result => {
        if (result && result.error) {
          throw new Error(result.error);
        }
        if (callback) callback(null, result.search || {});
      })
      .catch(err => {
        if (callback) callback(err.message, {});
      });
  }


  /**
   * itemsByTitle
   * Given a Wikipedia language and article title,
   * retrieve an array of corresponding Wikidata entities.
   * @param  lang
   * @param  title
   * @param  callback
   */
  itemsByTitle(lang, title, callback) {
    if (!title) {
      if (callback) callback('No title', {});
      return;
    }

    lang = lang || 'en';
    const url = WIKIDATA_API + utilQsString({
      action: 'wbgetentities',
      format: 'json',
      formatversion: 2,
      sites: lang.replace(/-/g, '_') + 'wiki',
      titles: title,
      languages: 'en', // shrink response by filtering to one language
      origin: '*'
    });

    fetch(url)
      .then(utilFetchResponse)
      .then(result => {
        if (result && result.error) {
          throw new Error(result.error);
        }
        if (callback) callback(null, result.entities || {});
      })
      .catch(err => {
        if (callback) callback(err.message, {});
      });
  }


  /**
   * languagesToQuery
   */
  languagesToQuery() {
    const localeCodes = this.context.systems.l10n.localeCodes();
    return localeCodes
      .map(code => code.toLowerCase())
      .filter(code => code !== 'en-us');

    // HACK: `en-us` isn't a Wikidata language. We should really be filtering by
    // the languages known to be supported by wikidata.
  }


  /**
   * entityByQID
   * @param  qid
   * @param  callback
   */
  entityByQID(qid, callback) {
    if (!qid) {
      callback('No qid', {});
      return;
    }
    if (this._cache.has(qid)) {
      if (callback) callback(null, this._cache.get(qid));
      return;
    }

    const langs = this.languagesToQuery();
    const url = WIKIDATA_API + utilQsString({
      action: 'wbgetentities',
      format: 'json',
      formatversion: 2,
      ids: qid,
      props: 'labels|descriptions|claims|sitelinks',
      sitefilter: langs.map(code => `${code}wiki`).join('|'),
      languages: langs.join('|'),
      languagefallback: 1,
      origin: '*'
    });

    fetch(url)
      .then(utilFetchResponse)
      .then(result => {
        if (result && result.error) {
          throw new Error(result.error);
        }
        this._cache.set(qid, result.entities[qid]);
        if (callback) callback(null, result.entities[qid] || {});
      })
      .catch(err => {
        if (callback) callback(err.message, {});
      });
  }


  /**
   * getDocs
   * Pass `params` object of the form:
   * {
   *   qid: 'string'      // brand wikidata  (e.g. 'Q37158')
   * }
   *
   * Get an result object used to display tag documentation
   * {
   *   title:        'string',
   *   description:  'string',
   *   editURL:      'string',
   *   imageURL:     'string',
   *   wiki:         { title: 'string', text: 'string', url: 'string' }
   * }
   *
   * @param  params
   * @param  callback
   */
  getDocs(params, callback) {
    const langs = this.languagesToQuery();

    this.entityByQID(params.qid, function(err, entity) {
      if (err || !entity) {
        callback(err || 'No entity');
        return;
      }

      let description;
      for (const code of langs) {
        if (entity.descriptions[code] && entity.descriptions[code].language === code) {
          description = entity.descriptions[code];
          break;
        }
      }
      if (!description && Object.values(entity.descriptions).length) {
        description = Object.values(entity.descriptions)[0];
      }

      // prepare result
      const result = {
        title: entity.id,
        description: description?.value ?? '',
        descriptionLocaleCode: description?.language ?? '',
        editURL: `https://www.wikidata.org/wiki/${entity.id}`
      };

      // add image
      if (entity.claims) {
        const imageroot = 'https://commons.wikimedia.org/w/index.php?';
        for (const prop of ['P154', 'P18']) {  // logo image, image
          const val = entity.claims[prop];
          if (val && Object.keys(val).length) {
            const image = val[Object.keys(val)[0]].mainsnak.datavalue.value;
            if (image) {
              result.imageURL = imageroot + utilQsString({
                title: `Special:Redirect/file/${image}`,
                width: 400
              });
              break;
            }
          }
        }
      }

      // add wiki sitelink
      if (entity.sitelinks) {
        const languageCode = this.context.systems.l10n.languageCode();
        const isEn = languageCode.toLowerCase() === 'en';

        // must be one of these that we requested..
        for (const code of langs) {    // check each, in order of preference
          const w = `${code}wiki`;
          if (entity.sitelinks[w]) {
            const title = entity.sitelinks[w].title;
            let tKey = 'inspector.wiki_reference';
            if (!isEn && code === 'en') {             // user's locale isn't English but
              tKey = 'inspector.wiki_en_reference';   // we are sending them to enwiki anyway..
            }

            result.wiki = {
              title: title,
              text: tKey,
              url: `https://${code}.wikipedia.org/wiki/` + title.replace(/ /g, '_')
            };
            break;
          }
        }
      }

      callback(null, result);
    });
  }

}
