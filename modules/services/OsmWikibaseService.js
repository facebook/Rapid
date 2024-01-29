import { utilQsString } from '@rapid-sdk/util';
import debounce from 'lodash-es/debounce.js';

import { AbstractSystem } from '../core/AbstractSystem.js';
import { utilFetchResponse } from '../util/index.js';


/**
 * `OsmWikibaseService`
 */
export class OsmWikibaseService extends AbstractSystem {

  /**
   * @constructor
   * @param  `context`  Global shared application context
   */
  constructor(context) {
    super(context);
    this.id = 'osmwikibase';
    this.apibase = 'https://wiki.openstreetmap.org/w/api.php';

    this._inflight = {};
    this._cache = {};
    this._localeIDs = { en: false };   // cache false to prevent repeated failed requests

    // Ensure methods used as callbacks always have `this` bound correctly.
    this.claimToValue = this.claimToValue.bind(this);
    this.monolingualClaimToValueObj = this.monolingualClaimToValueObj.bind(this);
    this.toSitelink = this.toSitelink.bind(this);
    this.getEntity = this.getEntity.bind(this);
    this.getDocs = this.getDocs.bind(this);
    this._request = this._request.bind(this);
    this._debouncedRequest = debounce(this._request, 500, { leading: false });
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
    this._debouncedRequest.cancel();
    Object.values(this._inflight).forEach(controller => controller.abort());
    this._inflight = {};

    return Promise.resolve();
  }


  /**
   * Get the best value for the property, or undefined if not found
   * @param entity object from wikibase
   * @param   property  string e.g. 'P4' for image
   * @param   langCode  string e.g. 'fr' for French
   * @return  the requested value, or undefined
   */
  claimToValue(entity, property, langCode) {
    if (!entity.claims[property]) return undefined;
    const locale = this._localeIDs[langCode];
    let preferredPick, localePick;

    for (const stmt of entity.claims[property]) {
      // If exists, use value limited to the needed language (has a qualifier P26 = locale)
      // Or if not found, use the first value with the "preferred" rank
      if (!preferredPick && stmt.rank === 'preferred') {
        preferredPick = stmt;
      }
      const p26Locale = stmt.qualifiers?.P26 && stmt.qualifiers.P26[0].datavalue.value.id;
      if (locale && p26Locale === locale) {
        localePick = stmt;
      }
    }

    const result = localePick ?? preferredPick;
    if (result) {
      const datavalue = result.mainsnak.datavalue;
      return datavalue.type === 'wikibase-entityid' ? datavalue.value.id : datavalue.value;
    } else {
      return undefined;
    }
  }


  /**
   * Convert monolingual property into a key-value object (language -> value)
   * @param   entity    object from wikibase
   * @param   property  string e.g. 'P31' for monolingual wiki page title
   * @return  the requested object, or undefined
   */
  monolingualClaimToValueObj(entity, property) {
    if (!entity?.claims[property]) return undefined;

    return entity.claims[property].reduce(function(acc, obj) {
      var value = obj.mainsnak.datavalue.value;
      acc[value.language] = value.text;
      return acc;
    }, {});
  }


  /**
   * toSitelink
   * Generate a sitelink for the given key/value pair
   * @param   key
   * @param   value
   * @return  sitelink
   */
  toSitelink(key, value) {
    let result = value ? `Tag:${key}=${value}` : `Key:${key}`;
    return result.replace(/_/g, ' ').trim();
  }


  /**
   * getEntity
   * Pass params object of the form:
   * {
   *   key: 'string',
   *   value: 'string',
   *   langCodes: ['string']
   * }
   * @param   params
   * @param   callback
   */
  getEntity(params, callback) {
    const doRequest = params.debounce ? this._debouncedRequest : this._request;
    const rtypeSitelink = (params.key === 'type' && params.value) ? (`Relation:${params.value}`).replace(/_/g, ' ').trim() : false;
    const keySitelink = params.key ? this.toSitelink(params.key) : false;
    const tagSitelink = (params.key && params.value) ? this.toSitelink(params.key, params.value) : false;
    let titles = [];
    let result = {};
    let localeSitelink;

    if (params.langCodes) {
      for (const langCode of params.langCodes) {
        if (this._localeIDs[langCode] === undefined) {
          // If this is the first time we are asking about this locale,
          // fetch corresponding entity (if it exists), and cache it.
          // If there is no such entry, cache `false` value to avoid re-requesting it.
          localeSitelink = (`Locale:${langCode}`).replace(/_/g, ' ').trim();
          titles.push(localeSitelink);
        }
      }
    }

    if (rtypeSitelink) {
      if (this._cache[rtypeSitelink]) {
        result.rtype = this._cache[rtypeSitelink];
      } else {
        titles.push(rtypeSitelink);
      }
    }

    if (keySitelink) {
      if (this._cache[keySitelink]) {
        result.key = this._cache[keySitelink];
      } else {
        titles.push(keySitelink);
      }
    }

    if (tagSitelink) {
      if (this._cache[tagSitelink]) {
        result.tag = this._cache[tagSitelink];
      } else {
        titles.push(tagSitelink);
      }
    }

    if (!titles.length) {
      // Nothing to do, we already had everything in the cache
      return callback(null, result);
    }

    // Requesting just the user language code
    // If backend recognizes the code, it will perform proper fallbacks,
    // and the result will contain the requested code. If not, all values are returned:
    // {"zh-tw":{"value":"...","language":"zh-tw","source-language":"zh-hant"}
    // {"pt-br":{"value":"...","language":"pt","for-language":"pt-br"}}
    const obj = {
      action: 'wbgetentities',
      sites: 'wiki',
      titles: titles.join('|'),
      languages: params.langCodes.join('|'),
      languagefallback: 1,
      origin: '*',
      format: 'json',
      // There is an MW Wikibase API bug https://phabricator.wikimedia.org/T212069
      // We shouldn't use v1 until it gets fixed, but should switch to it afterwards
      // formatversion: 2,
    };

    const url = this.apibase + '?' + utilQsString(obj);
    doRequest(url, (err, d) => {
      if (err) {
        callback(err);
      } else if (!d.success || d.error) {
        callback(d.error.messages.map(msg => msg.html['*']).join('<br>'));
      } else {
        let localeID = false;
        for (const res of Object.values(d.entities)) {
          if (res.missing !== '') {
            const title = res.sitelinks.wiki.title;
            if (title === rtypeSitelink) {
              this._cache[rtypeSitelink] = res;
              result.rtype = res;
            } else if (title === keySitelink) {
              this._cache[keySitelink] = res;
              result.key = res;
            } else if (title === tagSitelink) {
              this._cache[tagSitelink] = res;
              result.tag = res;
            } else if (title === localeSitelink) {
              localeID = res.id;
            } else {
              console.log(`Unexpected title ${title}`);  // eslint-disable-line no-console
            }
          }
        }

        if (localeSitelink) {
          // If locale ID is not found, store false to prevent repeated queries
          this.addLocale(params.langCodes[0], localeID);
        }

        callback(null, result);
      }
    });
  }


  /**
   * getDocs
   * Pass params object of the form:
   * {
   *   key: 'string',     // required
   *   value: 'string'    // optional
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
   * @param   params
   * @param   callback
   */
  getDocs(params, callback) {
    const langCodes = this.context.systems.l10n.localeCodes().map(code => code.toLowerCase());
    params.langCodes = langCodes;

    this.getEntity(params, (err, data) => {
      if (err) {
        callback(err);
        return;
      }

      const entity = data.rtype || data.tag || data.key;
      if (!entity) {
        callback('No entity');
        return;
      }

      let description;
      for (const code of langCodes) {
        if (entity.descriptions[code]?.language === code) {
          description = entity.descriptions[code];
          break;
        }
      }
      if (!description && Object.values(entity.descriptions).length) {
        description = Object.values(entity.descriptions)[0];
      }

      // prepare result
      let result = {
        title: entity.title,
        description: description?.value ?? '',
        descriptionLocaleCode: description?.language ?? '',
        editURL: `https://wiki.openstreetmap.org/wiki/${entity.title}`
      };

      // add image
      if (entity.claims) {
        let imageroot;
        let image = this.claimToValue(entity, 'P4', langCodes[0]);
        if (image) {
          imageroot = 'https://commons.wikimedia.org/w/index.php';
        } else {
          image = this.claimToValue(entity, 'P28', langCodes[0]);
          if (image) {
            imageroot = 'https://wiki.openstreetmap.org/w/index.php';
          }
        }
        if (imageroot && image) {
          result.imageURL = imageroot + '?' + utilQsString({
            title: `Special:Redirect/file/${image}`,
            width: 400
          });
        }
      }

      // Try to get a wiki page from tag data item first, followed by the corresponding key data item.
      // If neither tag nor key data item contain a wiki page in the needed language nor English,
      // get the first found wiki page from either the tag or the key item.
      const rtypeWiki = this.monolingualClaimToValueObj(data.rtype, 'P31');
      const tagWiki = this.monolingualClaimToValueObj(data.tag, 'P31');
      const keyWiki = this.monolingualClaimToValueObj(data.key, 'P31');

      for (const wiki of [rtypeWiki, tagWiki, keyWiki]) {
        for (const code of langCodes) {
          const offerEnglish = langCodes[0].split('-')[0] !== 'en' && code.split('-')[0] === 'en';
          const stringID = offerEnglish ? 'inspector.wiki_en_reference' : 'inspector.wiki_reference';
          const info = getWikiInfo(wiki, code, stringID);
          if (info) {
            result.wiki = info;
            break;
          }
        }
        if (result.wiki) break;
      }

      callback(null, result);


      // Helper method to get wiki info if a given language exists
      function getWikiInfo(wiki, langCode, tKey) {
        if (wiki && wiki[langCode]) {
          return {
            title: wiki[langCode],
            text: tKey,
            url: `https://wiki.openstreetmap.org/wiki/${wiki[langCode]}`
          };
        }
      }
    });
  }


  // Makes it easier to unit test
  addLocale(langCode, qid) {
    this._localeIDs[langCode] = qid;
  }


  _request(url, callback) {
    if (this._inflight[url]) return;

    const controller = new AbortController();
    this._inflight[url] = controller;

    fetch(url, { signal: controller.signal })
      .then(utilFetchResponse)
      .then(result => {
        delete this._inflight[url];
        if (callback) callback(null, result);
      })
      .catch(err => {
        delete this._inflight[url];
        if (err.name === 'AbortError') return;
        if (callback) callback(err.message);
      });
  }

}
