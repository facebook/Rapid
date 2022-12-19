import { utilStringQs } from '@id-sdk/util';

import { fileFetcher } from './file_fetcher';
import { utilDetect } from '../util/detect';


let _mainLocalizer = coreLocalizer();   // singleton
let _t = _mainLocalizer.t;

export {
  _mainLocalizer as localizer,
  _t as t     // export `t` function for ease-of-use
};


//
// coreLocalizer manages language and locale parameters including translated strings
//
export function coreLocalizer() {

  let localizer = {};

  // `_supportedLanguages`
  // All known language codes and their local name. This is used for the language pickers.
  // {
  //   "ar": { "nativeName": "العربية" },
  //   "de": { "nativeName": "Deutsch" },
  //   "en": { "nativeName": "English" },
  //   …
  // }
  let _supportedLanguages = {};

  // `_supportedLocales`
  // All supported locale codes that we can fetch translated strings for.
  // We generate this based on the data that we fetch from Transifex.
  //
  // * `rtl` - right-to-left or left-to-right text direction
  // * `pct` - the percent of strings translated; 1 = 100%, full coverage
  //
  // {
  //   "ar":    { "rtl": true, "pct": 0 },
  //   "ar-AA": { "rtl": true, "pct": 0 },
  //   "en":    { "rtl": false, "pct": 1 },
  //   "en-AU": { "rtl": false, "pct": 0 },
  //   "en-GB": { "rtl": false, "pct": 0 },
  //   "de":    { "rtl": false, "pct": 0 },
  //   …
  // }
  let _supportedLocales = {};

  // `_cache`
  // Where we keep all loaded localized string data, organized by "scope" and "locale":
  // {
  //   general: {
  //     en: { icons: {…}, toolbar: {…}, modes: {…}, operations: {…}, … },
  //     de: { icons: {…}, toolbar: {…}, modes: {…}, operations: {…}, … },
  //     …
  //   },
  //   tagging: {
  //     en: { presets: {…}, fields: {…}, … },
  //     de: { presets: {…}, fields: {…}, … },
  //     …
  //   },
  // }
  let _cache = {};

  let _preferredLocaleCodes = [];
  let _currLocaleCode = 'en-US';            // The current locale
  let _currLocaleCodes = ['en-US', 'en'];   // Must contain `_currLocaleCode` first, followed by fallbacks
  let _currLanguageCode = 'en';
  let _currTextDirection = 'ltr';
  let _currIsMetric = false;
  let _languageNames = {};
  let _scriptNames = {};

  // getters for the current locale parameters
  localizer.localeCode = () => _currLocaleCode;
  localizer.localeCodes = () => _currLocaleCodes;
  localizer.languageCode = () => _currLanguageCode;
  localizer.textDirection = () => _currTextDirection;
  localizer.usesMetric = () => _currIsMetric;
  localizer.languageNames = () => _languageNames;
  localizer.scriptNames = () => _scriptNames;

  /**
   * preferredLocaleCodes
   * Allows the user to manually set the locale, overriding the locales specified by the browser
   * If you're going to use this, you must call it before `ensureLoaded` starts fetching data.
   * @param   codes  Array or String of preferred locales
   */
  localizer.preferredLocaleCodes = function(codes) {
    if (typeof codes === 'string') {
      // Be generous and accept delimited strings as input
      _preferredLocaleCodes = codes.split(/,|;| /gi).filter(Boolean);
    } else {
      _preferredLocaleCodes = codes || [];
    }
    return localizer;
  };


  /**
   * ensureLoaded
   * Call this before doing anything with the localizer to ensure that necessary files have been loaded
   * @return {Promise}   A Promise resolved after the files have been loaded
   */
  let _loadPromise;
  localizer.ensureLoaded = () => {
    if (_loadPromise) return _loadPromise;

    let filesToFetch = ['languages', 'locales'];

    const scopes = {
      general: 'locales',
      tagging: 'https://cdn.jsdelivr.net/npm/@openstreetmap/id-tagging-schema@3/dist/translations'
    };

    let fileMap = fileFetcher.fileMap();
    for (let scope in scopes) {
      const key = `locales_index_${scope}`;
      if (!fileMap[key]) {
        fileMap[key] = scopes[scope] + '/index.min.json';
      }
      filesToFetch.push(key);
    }

    return _loadPromise = Promise.all(filesToFetch.map(key => fileFetcher.get(key)))
      .then(results => {
        _supportedLanguages = results[0];
        _supportedLocales = results[1];

        let indexes = results.slice(2);
        let requestedLocales = (_preferredLocaleCodes || [])
          .concat(utilDetect().browserLocales)   // List of locales preferred by the browser in priority order.
          .concat(['en']);   // fallback to English since it's the only guaranteed complete language

        _currLocaleCodes = localesToUseFrom(requestedLocales);
        _currLocaleCode = _currLocaleCodes[0];   // First is highest priority locale; the rest are fallbacks

        let loadStringsPromises = [];

        indexes.forEach((index, i) => {
//          // Will always return the index for `en` if nothing else
//          const fullCoverageIndex = _currLocaleCodes.findIndex(function(locale) {
//            return index[locale] && index[locale].pct === 1;
//          });
//          // We only need to load locales up until we find one with full coverage
//          // _currLocaleCodes.slice(0, fullCoverageIndex + 1).forEach(code => {
// RapiD note:
// We always need `en` because it contains RapiD strings that are not localized to other languages.
// This means we can't assume that a language with 100% coverage is an alternative for `en`.
          _currLocaleCodes.forEach(code => {
            const scope = Object.keys(scopes)[i];
            const directory = Object.values(scopes)[i];
            if (index[code]) {
              loadStringsPromises.push(localizer.loadLocale(code, scope, directory));
            }
          });
        });

        return Promise.all(loadStringsPromises);
      })
      .then(() => updateForCurrentLocale())
      .catch(err => console.error(err));  // eslint-disable-line
  };


  /**
   * localesToUseFrom
   * Returns the locales from `requestedLocales` that are actually supported
   * @param  {Array}  requestedLocales  Array or Set of locale codes to consider
   * @return {Array}  The locales that we can actually support
   */
  function localesToUseFrom(requestedLocales) {
    let toUse = new Set();
    requestedLocales.forEach(locale => {
      if (_supportedLocales[locale]) {
        toUse.add(locale);
      }
      // For a locale with a culture code ('es-ES'), include fallback to the base locale ('es')
      if (locale.includes('-')) {
        const base = locale.split('-')[0];
        if (_supportedLocales[base]) {
          toUse.add(base);
        }
      }
    });
    return Array.from(toUse);
  }


  /**
   * updateForCurrentLocale
   * Called after all locale files have been fetched to finalize the current state
   */
  function updateForCurrentLocale() {
    if (!_currLocaleCode) return;

    const [language, culture] = _currLocaleCode.toLowerCase().split('-', 2);
    _currLanguageCode = language;
    _currIsMetric = (culture !== 'us');

    // Allow hash parameter to override the locale 'rtl' setting - useful for testing
    const hash = utilStringQs(window.location.hash);
    if (hash.rtl === 'true') {
      _currTextDirection = 'rtl';
    } else if (hash.rtl === 'false') {
      _currTextDirection = 'ltr';
    } else {
      const supported = _supportedLocales[_currLocaleCode] || _supportedLocales[_currLanguageCode];
      _currTextDirection = supported && supported.rtl ? 'rtl' : 'ltr';
    }

    // Language and Script names will appear in the local language
    let locale = _currLocaleCode;
    if (locale.toLowerCase() === 'en-us') {
      locale = 'en';
    }
    _languageNames = _cache.general[locale].languageNames;
    _scriptNames = _cache.general[locale].scriptNames;
  }


  /**
   * loadLocale
   * Returns a Promise to load the strings for the requested locale
   * @param  {string}  locale     locale code to load
   * @param  {string}  scope      one of `general`, `tagging`, etc (not clear whether this is actually used?)
   * @param  {string}  directory  directory to include in the filename
   * @return {Promise}
   */
  localizer.loadLocale = (locale, scope, directory) => {
    if (locale.toLowerCase() === 'en-us') {   // US English is the default
      locale = 'en';
    }

    if (_cache[scope] && _cache[scope][locale]) {    // already loaded
      return Promise.resolve(locale);
    }

    let fileMap = fileFetcher.fileMap();
    const key = `locale_${scope}_${locale}`;
    if (!fileMap[key]) {
      fileMap[key] = `${directory}/${locale}.min.json`;
    }

    return fileFetcher.get(key)
      .then(d => {
        if (!_cache[scope]) {
          _cache[scope] = {};
        }
        _cache[scope][locale] = d[locale];
        return locale;
      });
  };


  /**
   * pluralRule
   * Returns the plural rule for the given `number` with the given `code`.
   * see: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/PluralRules/select
   *
   * @param  {number}   number      number to get the plural rule
   * @param  {string?}  locale      locale to use (defaults to currentLocale)
   * @return {string}   One of: `zero`, `one`, `two`, `few`, `many`, `other`
   */
  localizer.pluralRule = function(number, locale = _currLocaleCode) {
    // modern browsers have this functionality built-in
    const rules = 'Intl' in window && Intl.PluralRules && new Intl.PluralRules(locale);
    if (rules) {
      return rules.select(number);
    }
    // fallback to basic one/other, as in English
    return (number === 1) ? 'one' : 'other';
  };


  /**
   * _getString
   * Try to find that string in `locale` or the current `_currLocaleCode` matching
   * the given `stringId`. If no string can be found in the requested locale,
   * we'll recurse through all the `_currLocaleCodes` until one is found.
   *
   * @param  {string}   stringId      string identifier
   * @param  {object?}  replacements  token replacements and default string
   * @param  {string?}  locale        locale to use (defaults to currentLocale)
   * @return {object?}  result containing the localized string and chosen locale
   */
  localizer._getString = function(origStringId, replacements, locale) {
    let stringId = origStringId.trim();
    let scope = 'general';

    if (stringId[0] === '_') {
      const split = stringId.split('.');
      scope = split[0].slice(1);
      stringId = split.slice(1).join('.');
    }

    locale = locale || _currLocaleCode;

    let path = stringId
      .split('.')
      .map(s => s.replace(/<TX_DOT>/g, '.'))
      .reverse();

    let stringsKey = locale;
    // US English is the default
    if (stringsKey.toLowerCase() === 'en-us') stringsKey = 'en';
    let result = _cache[scope] && _cache[scope][stringsKey];

    while (result !== undefined && path.length) {
      result = result[path.pop()];
    }

    if (result !== undefined) {
      if (replacements) {
        if (typeof result === 'object' && Object.keys(result).length) {
          // If plural forms are provided, dig one level deeper based on the
          // first numeric token replacement provided.
          const number = Object.values(replacements).find(val => (typeof val === 'number'));
          if (number !== undefined) {
            const rule = localizer.pluralRule(number, locale);
            if (result[rule]) {
              result = result[rule];
            } else {
              // We're pretty sure this should be a plural but no string
              // could be found for the given rule. Just pick the first
              // string and hope it makes sense.
              result = Object.values(result)[0];
            }
          }
        }

        if (typeof result === 'string') {
          for (let key in replacements) {
            let value = replacements[key];
            if (typeof value === 'number') {
              if (value.toLocaleString) {
                // format numbers for the locale
                value = value.toLocaleString(locale, {
                  style: 'decimal',
                  useGrouping: true,
                  minimumFractionDigits: 0
                });
              } else {
                value = value.toString();
              }
            }
            const token = `{${key}}`;
            const regex = new RegExp(token, 'g');
            result = result.replace(regex, value);
          }
        }
      }
      if (typeof result === 'string') {  // found a localized string!
        return { text: result, locale: locale };
      }
    }
    // no localized string found...

    // attempt to fallback to a lower-priority language
    let index = _currLocaleCodes.indexOf(locale);
    if (index >= 0 && index < _currLocaleCodes.length - 1) {
      const fallback = _currLocaleCodes[index + 1];
      return localizer._getString(origStringId, replacements, fallback);
    }

    // Fallback to a default value if one is specified in `replacements`
    if (replacements && 'default' in replacements) {
      return { text: replacements.default, locale: null };
    }

    const missing = `Missing ${locale} translation: ${origStringId}`;
    if (typeof console !== 'undefined') console.error(missing);  // eslint-disable-line

    return { text: missing, locale: 'en' };
  };


  /**
   * hasTextForStringId
   * Returns true if the given string id will return a string
   *
   * @param  {string}   stringId      string identifier
   * @return {boolean}  true if the given string id will return a string
   */
  localizer.hasTextForStringId = function(stringId) {
    return !!localizer._getString(stringId, { default: 'nothing found'}).locale;
  };


  /**
   * t
   * Returns only the localized text, discarding the locale info
   * @param  {string}   stringId      string identifier
   * @param  {object?}  replacements  token replacements and default string
   * @param  {string?}  locale        locale to use (defaults to currentLocale)
   * @return {string?}  the localized string
   */
  localizer.t = function(stringId, replacements, locale) {
    return localizer._getString(stringId, replacements, locale).text;
  };


  /**
   * t.html
   * Returns the localized text wrapped in an HTML span element encoding the locale info
   * @param  {string}   stringId      string identifier
   * @param  {object?}  replacements  token replacements and default string
   * @param  {string?}  locale        locale to use (defaults to currentLocale)
   * @return {string}   localized string wrapped in a HTML span, or empty string ''
   */
  localizer.t.html = function(stringId, replacements, locale) {
    const info = localizer._getString(stringId, replacements, locale);
    // text may be empty or undefined depending on `replacements.default`
    return info.text ? localizer.htmlForLocalizedText(info.text, info.locale) : '';
  };


  /**
   * htmlForLocalizedText
   * Just returns the given text wrapped in an HTML span element encoding the locale
   * @param  {string}   text          the text content for the span
   * @param  {string?}  localeCode    the locale code for the span
   * @return {string}   text wrapped in a HTML span
   */
  localizer.htmlForLocalizedText = function(text, localeCode) {
    return `<span class="localized-text" lang="${localeCode || 'unknown'}">${text}</span>`;
  };


  /**
   * languageName
   * Returns a display-ready string for a given language code
   * @param  {string}   code          the language code (e.g. 'de')
   * @param  {object?}  options       see below
   * @return {string}   the language string to display (e.g. "Deutsch (de)")
   */
  localizer.languageName = (code, options) => {
    if (_languageNames[code]) {     // name in locale language
      // e.g. "German"
      return _languageNames[code];
    }

    // sometimes we only want the local name
    if (options && options.localOnly) return null;

    const langInfo = _supportedLanguages[code];
    if (langInfo) {
      if (langInfo.nativeName) {  // name in native language
        // e.g. "Deutsch (de)"
        return localizer.t('translate.language_and_code', { language: langInfo.nativeName, code: code });

      } else if (langInfo.base && langInfo.script) {
        const base = langInfo.base;   // the code of the language this is based on

        if (_languageNames[base]) {   // base language name in locale language
          const scriptCode = langInfo.script;
          const script = _scriptNames[scriptCode] || scriptCode;
          // e.g. "Serbian (Cyrillic)"
          return localizer.t('translate.language_and_code', { language: _languageNames[base], code: script });

        } else if (_supportedLanguages[base] && _supportedLanguages[base].nativeName) {
          // e.g. "српски (sr-Cyrl)"
          return localizer.t('translate.language_and_code', { language: _supportedLanguages[base].nativeName, code: code });
        }
      }
    }
    return code;  // if not found, use the code
  };


  return localizer;
}
