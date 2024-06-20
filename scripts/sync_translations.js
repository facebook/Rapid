/* eslint-disable no-console */
/* eslint-disable no-process-env */
import btoa from 'btoa';
import chalk from 'chalk';
import fs from 'node:fs';
import { transifexApi as api } from '@transifex/api';

//
// This script will sync up the translations from `id-editor` -> `rapid-editor`
// The resource is named 'core' in both projects.
//


// Create a file 'transifex.auth' that contains your API bearer token, for example:
// { "token": "1/f306870b35f5182b5c2ef80aa4fd797196819cb132409" }
// This file will be `.gitignore`d

if (process.env.transifex_token) {
  api.setup({ auth: process.env.transifex_token });
} else {
  const auth = JSON.parse(fs.readFileSync('./transifex.auth', 'utf8'));
  api.setup({ auth: auth.token });
}

let project_id;       // project: id
let project_rapid;    // project: rapid
let core_id;          // resource: id core
let core_rapid;       // resource: rapid core
let languages_id;
let languages_rapid;
let translations_id = new Map();
let translations_rapid = new Map();

Promise.resolve()
  .then(() => {
    console.log(chalk.yellow(`📥  Fetching project details…`));
    return Promise.all([
      api.Project.get('o:openstreetmap:p:id-editor'),
      api.Project.get('o:rapid-editor:p:rapid-editor'),
      api.Resource.get('o:openstreetmap:p:id-editor:r:core'),
      api.Resource.get('o:rapid-editor:p:rapid-editor:r:core')
    ])
    .then(vals => [project_id, project_rapid, core_id, core_rapid] = vals);
  })

  .then(() => {
    console.log(chalk.yellow(`📥  Fetching iD language stats…`));
    const iter = api.ResourceLanguageStats.filter({
      project: 'o:openstreetmap:p:id-editor',
      resource: 'o:openstreetmap:p:id-editor:r:core'
    });
    return getAllAsync(iter)
      .then(vals => {
        languages_id = [];
        for (const stat of vals) {
          const language = stat.related.language.id;
          const count = stat.attributes.translated_strings;
          if (!count) continue;  // skip language with no translations at all
          languages_id.push(language);
        }
      });
  })

  .then(() => {
    console.log(chalk.yellow(`📥  Fetching Rapid language stats…`));
    const iter = api.ResourceLanguageStats.filter({
      project: 'o:rapid-editor:p:rapid-editor',
      resource: 'o:rapid-editor:p:rapid-editor:r:core'
    });
    return getAllAsync(iter)
      .then(vals => {
        languages_rapid = [];
        for (const stat of vals) {
          const language = stat.related.language.id;
          languages_rapid.push(language);
        }
      });
  })

  .then(() => getAllLanguagesTranslations(languages_id))

  .then(() => {
//    console.log(chalk.yellow(`ENGLISH`));
//    const en = translations_id.get('l:en');  // english
//    for (const [k, v] of en.entries()) {
//      console.log(`${k}: ${v}`);
//    }

    console.log(chalk.yellow(`ESPERANTO`));
    const eo = translations_id.get('l:eo');  // esperanto
    console.log(JSON.stringify(eo, null, 2));
  })

  .then(() => {
    // done
  });



// getAllAsync
// This just wraps a `for await` that gathers all values from the given iterable.
// The iterables we are using here represent collections of stuff fetched lazily from Transifex.
// (We expect that they must have an `.all()` method, and won't loop infinitely)
async function getAllAsync(iterable, showCount = true) {
  const results = [];

  if (!process.stdout.isTTY) showCount = false;

  for await (const val of iterable.all()) {
    results.push(val);
    if (showCount) {
       process.stdout.write(results.length.toString());
       process.stdout.cursorTo(0);
    }
  }
  if (showCount) {
    process.stdout.write('\n');
  }
  return results;
};


// getAllLanguageTranslations
// Loop through all languages and get all their translated strings.
// Sleep a bit so the API doesn't rate limit us.
async function getAllLanguagesTranslations(languages) {
// testing
languages = ['l:eo'];
  for (const language of languages) {
    await getLanguageTranslations(language);
    await new Promise(r => setTimeout(r, 500));  // sleep 500 ms
  }
};


// getLanguageTranslations
// Get all translated strings for the given language
async function getLanguageTranslations(language) {
  const translations = {};
  translations_id.set(language, translations);

  console.log(chalk.yellow(`📥  Fetching iD ${language} translations`));
  const iter = api.ResourceTranslation.filter({
    resource: 'o:openstreetmap:p:id-editor:r:core',
    language: language
  });

  return getAllAsync(iter)
    .then(vals => {
      for (const val of vals) {
        const stringID = val.relationships.resource_string.data.id;
        const translation = val.attributes.strings;
        translations[stringID] = translation;
      }
    });
};
