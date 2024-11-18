/* eslint-disable no-console */
/* eslint-disable no-process-env */
import chalk from 'chalk';
import fs from 'node:fs';
import JSON5 from 'json5';
import { parseArgs } from 'node:util';
import { transifexApi as api } from '@transifex/api';

const localeCompare = new Intl.Collator('en').compare;



//
// This script gets information about a given transifex key

// see also: https://developers.transifex.com/reference/api-introduction
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

const { positionals } = parseArgs({ allowPositionals: true });
if (!positionals.length) {
  console.error(chalk.yellow('  missing lookup key, example:'));
  console.error(chalk.yellow(`  tx_info.js modes.add_area.title`));
  console.error('');
  process.exit(1);
}
const LOOKUP_KEY = positionals[0];
console.log(chalk.yellow(`lookup key "${LOOKUP_KEY}"`));

const RAPID_PROJECT = 'o:rapid-editor:p:rapid-editor';
const CORE_RESOURCE = 'o:rapid-editor:p:rapid-editor:r:core';

let project_rapid;         // Project
let resource_core;         // Resource
let source_string;         // ResrouceString
let languageIDs;           // Array<languageID>

Promise.resolve()
  .then(getProjectDetails)
  .then(getSourceString)
  .then(getRapidLanguages)
  .then(getTranslationStrings)
  .then(() => {
    console.log(chalk.yellow(`✅  Done!`));
  });


//
async function getProjectDetails() {
  console.log(chalk.yellow(`📥  Fetching project details…`));
  project_rapid = await api.Project.get(RAPID_PROJECT);
  resource_core = await api.Resource.get(CORE_RESOURCE);
}


// example ResourceString:
// {
//   "id": "o:rapid-editor:p:rapid-editor:r:core:s:9e6b7e75e8405d21eb9c2458ab412b18",
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
//     "datetime_created": "2024-06-17T19:23:15Z",
//     "metadata_datetime_modified": "2024-06-17T19:23:15Z",
//     "strings_datetime_modified": "2024-06-17T19:23:15Z"
//   },
//   "links": {…}
//   "relationships": {…}
//   "related": {…}
// }

// getResourceString
async function getSourceString() {
  const opts = { resource: CORE_RESOURCE, key: LOOKUP_KEY };
  const query = api.ResourceString.filter(opts);
  await query.fetch();

  if (query.data.length === 0) {
    console.log(chalk.yellow(`❌  "${LOOKUP_KEY}" not found…`));
    process.exit(1);
  } else {
    source_string = query.data[0];
    console.log(chalk.yellow(`✅  found "${LOOKUP_KEY}":`));
  }
}


// getRapidLanguages
async function getRapidLanguages() {
  console.log(chalk.yellow(`📥  Fetching Rapid languages…`));
  const opts = { project: RAPID_PROJECT, resource: CORE_RESOURCE };
  const iter = api.ResourceLanguageStats.filter(opts).all();
  return getCollection(iter)
    .then(vals => {
      languageIDs = vals.map(val => val.related.language.id).sort(localeCompare);
    });
}


// example ResourceTranslation:
// {
//   "id": "o:rapid-editor:p:rapid-editor:r:core:s:9e6b7e75e8405d21eb9c2458ab412b18:l:eo",
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
async function getTranslationStrings() {
  // Print English first
  const sstrings = JSON.stringify(source_string.attributes.strings);
  console.log(chalk.yellow.inverse('l:en:') + chalk.reset.yellow(`    \t` + sstrings));

  for (const languageID of languageIDs) {
    if (languageID === 'l:en') continue;   // skip `l:en`, it's the source language

    const opts = { resource: CORE_RESOURCE, language: languageID, resource_string__key: LOOKUP_KEY, translated: true };
    const query = api.ResourceTranslation.filter(opts);
    await query.fetch();

    if (query.data.length === 0) {
      console.log(chalk.yellow.inverse(`${languageID}:`) + chalk.reset.yellow.dim(`    \t` + 'untranslated'));
    } else {
      const tstrings = JSON.stringify(query.data[0].attributes.strings);
      console.log(chalk.yellow.inverse(`${languageID}:`) + chalk.reset.yellow(`    \t` + tstrings));
    }
  }
}


// getCollection
// This just wraps a `for await` that gathers all values from the given iterable.
// The iterables we are using here represent collections of stuff fetched lazily from Transifex.
async function getCollection(iterable, showCount = true) {
  const results = [];

  if (!process.stdout.isTTY) showCount = false;

  if (showCount) {
    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);
    process.stdout.write('0');
  }

  for await (const val of iterable) {
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

