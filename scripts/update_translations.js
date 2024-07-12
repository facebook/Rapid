/* eslint-disable no-console */
/* eslint-disable no-process-env */
import chalk from 'chalk';
import fs from 'node:fs';
import { globSync } from 'glob';
import JSON5 from 'json5';
import shell from 'shelljs';
import stringify from 'json-stringify-pretty-compact';
import { transifexApi as api } from '@transifex/api';

import * as CLDR from './cldr.js';
const localeCompare = new Intl.Collator('en').compare;


//
// This script will download the latest supported locales and translations from Transifex.
// see also: https://developers.transifex.com/reference/api-introduction
// This script takes about a half hour to run to completion.
//

// Create a file `transifex.auth` in the root folder of the Rapid project.
// This file should contain your API bearer token, for example:
// { "token": "1/f306870b35f5182b5c2ef80aa4fd797196819cb132409" }
// See: https://developers.transifex.com/reference/api-authentication for information on generating an API bearer token.
// (This file is `.gitignore`d)
if (process.env.transifex_token) {
  api.setup({ auth: process.env.transifex_token });
} else {
  const auth = JSON5.parse(fs.readFileSync('./transifex.auth', 'utf8'));
  api.setup({ auth: auth.token });
}


const ID_PROJECT = 'o:openstreetmap:p:id-editor';
const RAPID_PROJECT = 'o:rapid-editor:p:rapid-editor';
const CORE_RESOURCE = 'o:rapid-editor:p:rapid-editor:r:core';
const COMMUNITY_RESOURCE = 'o:openstreetmap:p:id-editor:r:community';
const IMAGERY_RESOURCE = 'o:openstreetmap:p:id-editor:r:imagery';
const TAGGING_RESOURCE = 'o:openstreetmap:p:id-editor:r:presets';

let project_id;          // project: id
let project_rapid;       // project: rapid
let resource_core;       // resource: rapid core
let resource_community;  // resource: id community
let resource_imagery;    // resource: id imagery
let resource_tagging;    // resource: id tagging

const languages = new Map();               // All Transifex languages  Map<languageID, language>
let languages_rapid;                       // Array<languageID>  (we want to run through them sorted so fallback works)
const sources_core = new Map();            // Source strings   Map<stringID, attributes object>
const sources_community = new Map();       // Source strings   Map<stringID, attributes object>
const sources_imagery = new Map();         // Source strings   Map<stringID, attributes object>
const sources_tagging = new Map();         // Source strings   Map<stringID, attributes object>
const translations_core = new Map();       // Translated strings  Map<languageID, Map<stringID, attributes object>>
const translations_community = new Map();  // Translated strings  Map<languageID, Map<stringID, attributes object>>
const translations_imagery = new Map();    // Translated strings  Map<languageID, Map<stringID, attributes object>>
const translations_tagging = new Map();    // Translated strings  Map<languageID, Map<stringID, attributes object>>

Promise.resolve()
  .then(startClean)
  .then(getProjectDetails)
  .then(getLanguageDetails)
  .then(getRapidLanguageStats)
  .then(writeLocalesFile)
  .then(getCore)
  .then(getCommunity)
  .then(getImagery)
  .then(getTagging)
  .then(() => {
    console.log(chalk.yellow(`✅  Done!`));
  });


// startClean
// Remove old files before starting
function startClean() {
  console.log(chalk.yellow(`🧼  Start clean…`));

  // create target folders if necessary
  if (!fs.existsSync('data/l10n'))  fs.mkdirSync('data/l10n', { recursive: true });

  shell.rm('-f', 'data/locales.json');
  for (const file of globSync('data/l10n/*', { ignore: 'data/l10n/*.en.json' })) {
    shell.rm('-f', file);
  }
}


//
async function getProjectDetails() {
  console.log(chalk.yellow(`📥  Fetching project details…`));
  return Promise.all([
    api.Project.get(ID_PROJECT),
    api.Project.get(RAPID_PROJECT),
    api.Resource.get(CORE_RESOURCE),
    api.Resource.get(COMMUNITY_RESOURCE),
    api.Resource.get(IMAGERY_RESOURCE),
    api.Resource.get(TAGGING_RESOURCE)
  ])
  .then(vals => [
    project_id,
    project_rapid,
    resource_core,
    resource_community,
    resource_imagery,
    resource_tagging
  ] = vals);
}

// example Language:
// {
//   "id": "l:eo",
//   "attributes": {
//     "code": "eo",
//     "name": "Esperanto",
//     "rtl": false,
//     "plural_equation": "(n != 1)",
//     "plural_rules": {
//       "one": "n is 1",
//       "other": "everything else"
//     }
//   },
//   "links": {…}
//   "relationships": {…}
//   "related": {…}
// }

//
async function getLanguageDetails() {
  console.log(chalk.yellow(`📥  Fetching language details…`));
  return getCollection(api.Language)
    .then(vals => {
      for (const val of vals) {
        languages.set(val.id, val);
      }
    });
}


//
async function getRapidLanguageStats() {
  console.log(chalk.yellow(`📥  Fetching Rapid language stats…`));
  const iter = api.ResourceLanguageStats.filter({ project: RAPID_PROJECT, resource: CORE_RESOURCE });

  return getCollection(iter)
    .then(vals => {
      // We want this list sorted, so that as we iterate through it, we can fallback.
      // If this code includes a territory like `zh-CN`, we will allow a fallback to `zh`.
      languages_rapid = vals.map(val => val.related.language.id).sort(localeCompare);
    });
}


// writeLocalesFile
// We'll include only the locales supported by the Rapid project.
function writeLocalesFile() {
  console.log(chalk.yellow(`✏️   Writing 'locales.json'…`));

  const locales = {}
  for (const languageID of languages_rapid) {
    const language = languages.get(languageID);
    if (!language)  throw new Error(`Missing language '${languageID}'`);

    // Note: replace CLDR-style underscores with BCP47-style hypens to make things easier.
    const code = language.attributes.code.replace(/_/g, '-');
    let rtl = language.attributes.rtl;
    if (code === 'ku') {  // exception: Kurdish written in Latin script, see iD#4783
      rtl = false;
    }

    locales[code] = { rtl: rtl };
  }

  fs.writeFileSync('data/locales.json', stringify({ locales: sortObject(locales) }) + '\n');
}


// getCore
async function getCore() {
  await getSourceStrings('core', CORE_RESOURCE, sources_core);
  for (const languageID of languages_rapid) {
    if (languageID === 'l:en') continue;   // skip `l:en`, it's the source language
    await getTranslationStrings('core', CORE_RESOURCE, languageID, translations_core);
    await processTranslations('core', languageID, sources_core, translations_core);
  }
}

// getCommunity
async function getCommunity() {
  await getSourceStrings('community', COMMUNITY_RESOURCE, sources_community);
  for (const languageID of languages_rapid) {
    if (languageID === 'l:en') continue;   // skip `l:en`, it's the source language
    await getTranslationStrings('community', COMMUNITY_RESOURCE, languageID, translations_community);
    await processTranslations('community', languageID, sources_community, translations_community);
  }
}

// getImagery
async function getImagery() {
  await getSourceStrings('imagery', IMAGERY_RESOURCE, sources_imagery);
  for (const languageID of languages_rapid) {
    if (languageID === 'l:en') continue;   // skip `l:en`, it's the source language
    await getTranslationStrings('imagery', IMAGERY_RESOURCE, languageID, translations_imagery);
    await processTranslations('imagery', languageID, sources_imagery, translations_imagery);
  }
}

// getTagging
async function getTagging() {
  await getSourceStrings('tagging', TAGGING_RESOURCE, sources_tagging);
  for (const languageID of languages_rapid) {
    if (languageID === 'l:en') continue;   // skip `l:en`, it's the source language
    await getTranslationStrings('tagging', TAGGING_RESOURCE, languageID, translations_tagging);
    await processTranslations('tagging', languageID, sources_tagging, translations_tagging);
  }
}


// example ResourceString:
// {
//   "id": "o:openstreetmap:p:id-editor:r:core:s:9e6b7e75e8405d21eb9c2458ab412b18",
//   "attributes": {
//     "appearance_order": 0,
//     "key": "icons.download",
//     "context": "",
//     "strings": {
//       "other": "download"
//     },
//     "tags": [],
//     "occurrences": null,
//     "developer_comment": null,
//     "instructions": null,
//     "character_limit": null,
//     "pluralized": false,
//     "string_hash": "9e6b7e75e8405d21eb9c2458ab412b18",
//     "datetime_created": "2018-10-11T20:31:55Z",
//     "metadata_datetime_modified": "2018-10-11T20:31:55Z",
//     "strings_datetime_modified": "2018-10-11T20:31:55Z"
//   },
//   "links": {…}
//   "relationships": {…}
//   "related": {…}
// }

//
async function getSourceStrings(resourceName, resourceID, collection) {
  console.log(chalk.yellow(`📥  Fetching '${resourceName}' source strings…`));
  const iter = api.ResourceString.filter({ resource: resourceID });

  return getCollection(iter)
    .then(vals => {
      for (const val of vals) {
        collection.set(val.id, val);
      }
    });
}


// example ResourceTranslation:
// {
//   "id": "o:openstreetmap:p:id-editor:r:core:s:9e6b7e75e8405d21eb9c2458ab412b18:l:eo",
//   "attributes": {
//     "strings": {
//       "other": "elŝuti"
//     },
//     "reviewed": false,
//     "proofread": false,
//     "finalized": false,
//     "origin": "EDITOR",
//     "datetime_created": "2018-10-11T20:31:55Z",
//     "datetime_translated": "2018-10-14T13:34:50Z",
//     "datetime_reviewed": null,
//     "datetime_proofread": null
//   },
//   "links": {…}
//   "relationships": {…}
//   "related": {…}
// }

//
async function getTranslationStrings(resourceName, resourceID, languageID, collection) {
  const translations = new Map();   //  Map<stringID, ResourceTranslation>
  collection.set(languageID, translations);

  console.log(chalk.yellow(`📥  Fetching '${resourceName}' translations for '${languageID}'`));
  const iter = api.ResourceTranslation.filter({ resource: resourceID, language: languageID, translated: true });

  return getCollection(iter)
    .then(vals => {
      for (const val of vals) {
        if (!val.attributes.strings) continue;   // string is not yet translated
        const stringID = val.relationships.resource_string.data.id;
        translations.set(stringID, val);
      }
    });
}


// processTranslations
// Here we collect all of the translated strings and write them into JSON format.
// We compare each translated string against the source English string and only write strings that are actually changed.
async function processTranslations(resourceName, languageID, sourceCollection, translationCollection) {
  // At this point in the script execution things shouldn't be missing
  const translations = translationCollection.get(languageID);  //  Map<stringID, ResourceTranslation>
  if (!translations)  throw new Error(`Missing translations for '${languageID}'`);

  const language = languages.get(languageID);
  if (!language)  throw new Error(`Missing language '${languageID}'`);

  // Note: Replace CLDR-style underscores with BCP47-style hypens to make things easier.
  const code = language.attributes.code.replace(/_/g, '-');

  // If this code includes a territory like `zh-CN`, we will allow a fallback to `zh`.
  const [langCode, territoryCode] = code.split('-', 2);
  let fallbacks;
  if (territoryCode) {
    fallbacks = translationCollection.get(`l:${langCode}`);  //  Map<stringID, ResourceTranslation>
  }

  const data = {};
  let count = 0;

  for (const [stringID, translation] of translations) {
    const tstrings = translation.attributes.strings;

    // Translated strings arrive with all their plural forms. (e.g. 'one', 'many', etc.)
    // If a string doesn't have plural forms, it will have a single default value 'other'
    const pluralForms = Object.keys(tstrings ?? {});
    if (pluralForms.length === 0)  throw new Error(`Missing translation strings for '${stringID}'`);
    const hasPlurals = (pluralForms.length > 1 || (pluralForms.length === 1 && !pluralForms.includes('other')));

    const source = sourceCollection.get(stringID);
    if (!source)  throw new Error(`Missing source for '${stringID}'`);
    const sstrings = source.attributes.strings;

    const key = source.attributes.key;
    if (!key)  throw new Error(`Missing key for '${stringID}'`);

    const fallback = fallbacks?.get(stringID);  // fallback is optional
    const fstrings = fallback?.attributes?.strings || {};

    const path = key.split('.');
    let isRedundant = false;   // We'll remove redundant translations below

    if (hasPlurals) {
      //
      // If a string has plurals, the plural rules are the leafs of the tree:
      // operations: {
      //   merge: {
      //     annotation: {
      //       one: 'Merged a feature.',
      //       other: 'Merged {n} features.''
      //     }
      //   }
      // }
      //
      for (const [pluralRule, tstring] of Object.entries(tstrings)) {
        if (!tstring)  throw new Error(`Missing plural string for '${stringID}' - '${pluralRule}'`);

        // Skip this translated string if it's identical to the source or fallback string..
        if (tstring === fstrings[pluralRule] || tstring === sstrings[pluralRule]) {
          isRedundant = true;
          break;

        } else {  // Keep this translated string..
          // Walk to the leaf, extending the tree if necessary..
          let branch = data;
          for (const p of path) {
            if (!branch[p])  branch[p] = {};
            branch = branch[p];
          }

          branch[pluralRule] = tstring;
          count++;
        }
      }

    } else {
      //
      // If a string doesn't have plurals, the last part of the path is the leaf of the tree:
      // operations: {
      //   merge: {
      //     title: 'Merge'
      //   }
      // }
      // (We don't make a 'operations.merge.title.other', even though Transifex has it this way.)
      //
      const leaf = path.pop();
      const pluralRule = 'other';
      const tstring = tstrings[pluralRule];
      if (!tstring)  throw new Error(`Missing singular string for '${stringID}' - '${pluralRule}'`);

      // Skip this translated string if it's identical to the source or fallback string..
      if (tstring === fstrings[pluralRule] || tstring === sstrings[pluralRule]) {
        isRedundant = true;

      } else {  // Keep this translated string..
        // Walk to the leaf, extending the tree if necessary..
        let branch = data;
        for (const p of path) {
          if (!branch[p])  branch[p] = {};
          branch = branch[p];
        }

        branch[leaf] = tstring;
        count++;
      }
    }

    // Only remove the redundant translations from the Rapid 'core' resource, not the iD projects
    if (resourceName === 'core' && isRedundant) {
      console.log(chalk.yellow(`🔪   Removing redundant '${languageID}' translation…`));
      await saveWithRetry(translation, { strings: null });
    }
  }


  // 'core' resource only:  Include LanguageNames and ScriptNames from CLDR.
  // As above, we'll include some logic to check for redundancy between these strings
  // and whatever strings are present in the fallback language (if any) and in English.
  if (resourceName === 'core') {
    const langNames = CLDR.languageNamesInLanguageOf(code);
    const langNamesEn = CLDR.languageNamesInLanguageOf('en');
    // If this code includes a territory like `zh-CN`, we will allow a fallback to `zh`.
    let langNamesFallback = {};
    if (territoryCode) {
      langNamesFallback = CLDR.languageNamesInLanguageOf(langCode);
    }

    for (const [key, name] of Object.entries(langNames)) {
      if (name === langNamesFallback[key] || name === langNamesEn[key]) continue;  // redundant
      if (!data.languageNames)  data.languageNames = {};
      data.languageNames[key] = name;
      count++;
    }

    const scriptNames = CLDR.scriptNamesInLanguageOf(code);
    const scriptNamesEn = CLDR.scriptNamesInLanguageOf('en');
    // If this code includes a territory like `zh-CN`, we will allow a fallback to `zh`.
    let scriptNamesFallback = {};
    if (territoryCode) {
      scriptNamesFallback = CLDR.scriptNamesInLanguageOf(langCode);
    }

    for (const [key, name] of Object.entries(scriptNames)) {
      if (name === scriptNamesFallback[key] || name === scriptNamesEn[key]) continue;  // redundant
      if (!data.scriptNames)  data.scriptNames = {};
      data.scriptNames[key] = name;
      count++;
    }
  }

  if (count > 0) {
    console.log(chalk.yellow(`✏️   Writing '${resourceName}.${code}.json'…`));
    const output = {};
    output[code] = data;
    fs.writeFileSync(`data/l10n/${resourceName}.${code}.json`, JSON.stringify(output, null, 2) + '\n');
  } else {
    console.log(chalk.yellow(`🔦  No meaningful translations found…`));
  }
  console.log(chalk.reset(count.toString()));

  return true;
}


// getCollection
// This just wraps a `for await` that gathers all values from the given iterable.
// The iterables we are using here represent collections of stuff fetched lazily from Transifex.
// (We expect that they must have an `.all()` method, and won't loop infinitely)
async function getCollection(iterable, showCount = true) {
  const results = [];

  if (!process.stdout.isTTY) showCount = false;

  if (showCount) {
    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);
    process.stdout.write('0');
  }

  for await (const val of iterable.all()) {
    results.push(val);
    if (showCount) {
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
      process.stdout.write(results.length.toString());
    }
  }

  if (showCount) {
    process.stdout.write('\n');
  }

  return results;
}


// saveWithRetry
// This retries a `save` call if we get an error like:
//  500 - Something went wrong, please try again
function saveWithRetry(resource, arg1, arg2) {
  return resource.save(arg1, arg2)
    .catch(err => {
      console.error(err);
      if (err.statusCode === 500 || err.statusCode === 429 || err.code === 'ETIMEDOUT') {  // server error or rate limit
        return new Promise(r => setTimeout(r, 10000))          // wait 10 sec
          .then(() => saveWithRetry(resource, arg1, arg2));    // try again
      } else {
        throw err;
      }
    });
}


// Returns an object with sorted keys and sorted values.
function sortObject(obj) {
  if (!obj) return null;

  const sorted = {};
  Object.keys(obj).sort(localeCompare).forEach(k => sorted[k] = obj[k]);

  return sorted;
}
