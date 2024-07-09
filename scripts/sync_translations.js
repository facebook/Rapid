/* eslint-disable no-console */
/* eslint-disable no-process-env */
import chalk from 'chalk';
import fs from 'node:fs';
import JSON5 from 'json5';
import { transifexApi as api } from '@transifex/api';

//
// This script will sync up the translations from `id-editor` -> `rapid-editor`
// The resource is named 'core' in both projects, and the source language is `l:en`
// see also: https://developers.transifex.com/reference/api-introduction
//
// Summary:
//  - Load "source" strings from both iD and Rapid
//  - Compare strings to find strings that are unchanged (these keys are stored in the `same` Set)
//  - Loop through each language from iD (that actually has >0 translations)
//    - Create that language on Rapid, if needed
//    - Get the "translated" strings for both iD and Rapid
//    - For all the string keys in the `same` set, copy the translation from iD -> Rapid, if needed.
//
// This is likely a one-time sync, and this script takes about a day to run to completion.
// At the time I wrote this, there are 171 languages, and 1675 strings.
// If this script stops because of a server issue, you can restart it.
// It will again iterate through each language, but will run quickly through the ones already done.
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


const USER = 'u:RapidEditor';
const ID_PROJECT = 'o:openstreetmap:p:id-editor';
const RAPID_PROJECT = 'o:rapid-editor:p:rapid-editor';
const ID_RESOURCE = 'o:openstreetmap:p:id-editor:r:core';
const RAPID_RESOURCE = 'o:rapid-editor:p:rapid-editor:r:core';

let user;             // user: RapidEditor
let project_id;       // project: id
let project_rapid;    // project: rapid
let core_id;          // resource: id core
let core_rapid;       // resource: rapid core

const languages = new Map();           // All Transifex languages  Map<languageID, language>
const languages_id = new Set();        // Set<languageIDs>
const languages_rapid = new Set();     // Set<languageIDs>
const keys_id = new Map();             // Index By Key     Map<key, stringID>
const keys_rapid = new Map();          // Index By Key     Map<key, stringID>
const sources_id = new Map();          // Source strings   Map<stringID, attributes object>
const sources_rapid = new Map();       // Source strings   Map<stringID, attributes object>
const same = new Set();                // Set<key>   // where source strings are the same in both iD and Rapid
const translations_id = new Map();     // Translated strings  Map<languageID, Map<stringID, attributes object>>
const translations_rapid = new Map();  // Translated_strings  Map<languageID, Map<stringID, attributes object>>


Promise.resolve()
  .then(getProjectDetails)
  .then(getLanguageDetails)
  .then(getiDLanguageStats)
  .then(getRapidLanguageStats)
  .then(getiDSourceStrings)
  .then(getRapidSourceStrings)
  .then(findSameSourceStrings)
  .then(processLanguages)
  .then(() => {
    console.log(chalk.yellow(`✅  Done!`));
  });


//
async function getProjectDetails() {
  console.log(chalk.yellow(`📥  Fetching project details…`));
  return Promise.all([
    api.User.get(USER),
    api.Project.get(ID_PROJECT),
    api.Project.get(RAPID_PROJECT),
    api.Resource.get(ID_RESOURCE),
    api.Resource.get(RAPID_RESOURCE)
  ])
  .then(vals => [user, project_id, project_rapid, core_id, core_rapid] = vals);
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
async function getiDLanguageStats() {
  console.log(chalk.yellow(`📥  Fetching iD language stats…`));
  const iter = api.ResourceLanguageStats.filter({ project: ID_PROJECT, resource: ID_RESOURCE });

  return getCollection(iter)
    .then(vals => {
      for (const val of vals) {
        const count = val.attributes.translated_strings;
        if (!count) continue;  // skip languages with no translations at all
        languages_id.add(val.related.language.id);
      }
    });
}

//
async function getRapidLanguageStats() {
  console.log(chalk.yellow(`📥  Fetching Rapid language stats…`));
  const iter = api.ResourceLanguageStats.filter({ project: RAPID_PROJECT, resource: RAPID_RESOURCE });

  return getCollection(iter)
    .then(vals => {
      for (const val of vals) {
        languages_rapid.add(val.related.language.id);
      }
    });
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
async function getiDSourceStrings() {
  console.log(chalk.yellow(`📥  Fetching iD source strings…`));
  const iter = api.ResourceString.filter({ resource: ID_RESOURCE });

  return getCollection(iter)
    .then(vals => {
      for (const val of vals) {
        keys_id.set(val.attributes.key, val.id);  // e.g. 'operations.merge.key' -> 's:68bc25087df5d9870b5a1da54ca7e72d'
        sources_id.set(val.id, val);
      }
    });
}

//
async function getRapidSourceStrings() {
  console.log(chalk.yellow(`📥  Fetching Rapid source strings…`));
  const iter = api.ResourceString.filter({ resource: RAPID_RESOURCE });

  return getCollection(iter)
    .then(vals => {
      for (const val of vals) {
        keys_rapid.set(val.attributes.key, val.id);
        sources_rapid.set(val.id, val);
      }
    });
}


//
function findSameSourceStrings() {
  console.log(chalk.yellow(`🔦  Finding source strings that are the same…`));

  // Note: 'keys' are our identifiers, like 'operations.merge.key'
  // use `keys_id` and `keys_rapid` to get the Transifex identifiers, like 's:68bc25087df5d9870b5a1da54ca7e72d'
  // use `sources_id` and `sources_rapid` to get to the actual source strings.
  for (const [key, stringID_id] of keys_id) {
    const stringID_rapid = keys_rapid.get(key);
    if (!stringID_id || !stringID_rapid) continue;

    const source_id = sources_id.get(stringID_id);
    const source_rapid = sources_rapid.get(stringID_rapid);
    if (!source_id || !source_rapid) continue;

    const strings_id = source_id.attributes.strings || {};
    const strings_rapid = source_rapid.attributes.strings || {};

    // compare all sub strings (plural forms)
    let isSame = true;
    for (const [pluralRule, string_id] of Object.entries(strings_id)) {
      const string_rapid = strings_rapid[pluralRule];
      if (string_id !== string_rapid) {
        isSame = false;
        break;
      }
    }
    if (isSame) {
      same.add(key);
      // console.log(`${key} looks same in iD and Rapid: ${strings_id.other}`);
    }
  }
  console.log(chalk.reset(same.size.toString()));
}


// processLanguages
// Loop through all languages and get all their translated strings.
async function processLanguages() {
  for (const languageID of languages_id) {
    if (languageID === 'l:en') continue;   // skip `l:en`, it's the source language
    await getiDTranslationsForLanguage(languageID);
    await getRapidTranslationsForLanguage(languageID);
    await updateRapidTranslationsForLanguage(languageID);
  }
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
async function getiDTranslationsForLanguage(languageID) {
  const translations = new Map();   //  Map<stringID, Object>
  translations_id.set(languageID, translations);

  console.log(chalk.yellow(`📥  Fetching iD translations for ${languageID}`));
  const iter = api.ResourceTranslation.filter({ resource: ID_RESOURCE, language: languageID });

  return getCollection(iter)
    .then(vals => {
      for (const val of vals) {
        if (!val.attributes.strings) continue;
        const stringID = val.relationships.resource_string.data.id;
        translations.set(stringID, val);
      }
    });
}


// getRapidTranslationsForLanguage
// Get all translated strings for the given language
async function getRapidTranslationsForLanguage(languageID) {
  const translations = new Map();   //  Map<stringID, Object>
  translations_rapid.set(languageID, translations);

  // Rapid project doesn't have this language yet, create one
  if (!languages_rapid.has(languageID)) {
    console.log(chalk.yellow(`📦  Creating language for Rapid for ${languageID}`));
    await project_rapid.add('languages', [languages.get(languageID)]);
    // We expect that after adding the language, we should get a collection of empty ResourceTranslations below.
  }

  console.log(chalk.yellow(`📥  Fetching Rapid translations for ${languageID}`));
  const iter = api.ResourceTranslation.filter({ resource: RAPID_RESOURCE, language: languageID });

  return getCollection(iter)
    .then(vals => {
      for (const val of vals) {
        const stringID = val.relationships.resource_string.data.id;
        translations.set(stringID, val);
      }
    });
}


// updateRapidTranslationsForLanguage
// update the translations where the source strings are the same
async function updateRapidTranslationsForLanguage(languageID, showCount = true) {
  const from_id = translations_id.get(languageID);        //  Map<stringID, Object>
  const to_rapid = translations_rapid.get(languageID);    //  Map<stringID, Object>

  console.log(chalk.yellow(`✏️   Syncing translations iD -> Rapid for ${languageID}`));
  let count = 0;
  if (!process.stdout.isTTY) showCount = false;

  // At this point in the script execution things shouldn't be missing
  if (!from_id)  throw new Error(`iD missing language ${languageID}`);
  if (!to_rapid) throw new Error(`Rapid missing language ${languageID}`);

  for (const [stringID_id, translation_id] of from_id) {
    const source_id = sources_id.get(stringID_id);
    if (!source_id)  throw new Error(`iD missing source string ${stringID_id}`);
    if (!translation_id)  throw new Error(`iD missing translation string ${stringID_id}`);

    const key = source_id.attributes.key;
    const isSame = same.has(key);
    if (!isSame) continue;

    const stringID_rapid = keys_rapid.get(key);
    const source_rapid = sources_rapid.get(stringID_rapid);
    const translation_rapid = to_rapid.get(stringID_rapid);
    if (!source_rapid)  throw new Error(`Rapid missing source string ${stringID_rapid}`);
    if (!translation_rapid)  throw new Error(`Rapid missing translation string ${stringID_rapid}`);

    // compare
    //console.log(`lang: ${languageID}`);
    //console.log(`key: ${key}`);
    //console.log(`isSame: ${isSame}`);
    //console.log(`iD source stringID: ${stringID_id}`);
    //console.log(`iD source string: ${source_id.attributes.strings.other}`);
    //console.log(`iD translated string: ${translation_id.attributes.strings.other}`);
    //console.log(`Rapid source stringID: ${stringID_rapid}`);
    //console.log(`Rapid source string: ${source_rapid.attributes.strings.other}`);
    //console.log(`Rapid translated string: ${translation_rapid.attributes?.strings?.other}`);
    //console.log('');

    // compare all sub strings (plural forms)
    let needsUpdate = false;
    for (const [pluralRule, tstring_id] of Object.entries(translation_id.attributes.strings)) {
      if (!tstring_id) continue;
      const tstrings_rapid = translation_rapid.attributes?.strings || {};
      if (tstring_id !== tstrings_rapid[pluralRule]) {
        needsUpdate = true;
        break;
      }
    }
    if (needsUpdate) {
      count++;
      if (showCount) {
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
        process.stdout.write(key);
      }
      // weird: it will crash in postSave looking for the `id` if we don't supply a translator.
      translation_rapid.set('translator', user);
      translation_rapid.set('strings', translation_id.attributes.strings);
      await saveWithRetry(translation_rapid, ['strings']);
    }
  }

  if (showCount) {
    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);
    process.stdout.write(count.toString() + '\n');
  }
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
