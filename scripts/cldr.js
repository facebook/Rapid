/* eslint-disable no-console */
import fs from 'node:fs';
import JSON5 from 'json5';

//
// This script gets all the supported language names from CLDR
// - langNamesInNativeLang()
// - languageNamesInLanguageOf(code)
// - scriptNamesInLanguageOf(code)
//

const CLDR_ROOT = 'node_modules/cldr-localenames-full/main';

const rematchCodes = {
  'zh-CN': 'zh',
  'zh-HK': 'zh-Hant-HK',
  'zh-TW': 'zh-Hant',
  'pt-BR': 'pt',
  'pt':    'pt-PT'
};

const skipLanguages = new Set([
  'ase',   // American Sign Language
  'mis',   // "not yet assigned"
  'mul',   // "multiple languages"
  'und',   // "undefined"
  'zxx'    // "no linguistic content / not applicable"
]);


//
//
//
export function langNamesInNativeLang() {
  // manually add languages we want that aren't in CLDR
  const unordered = {
    'ja-Hira': {
      base: 'ja',
      script: 'Hira'
    },
    'ja-Latn': {
      base: 'ja',
      script: 'Latn'
    },
    'ko-Latn': {
      base: 'ko',
      script: 'Latn'
    },
    'zh_pinyin': {
      base: 'zh',
      script: 'Latn'
    }
  };

  // The directory names are the codes
  for (const code of fs.readdirSync(CLDR_ROOT)) {
    const languagesFile = `${CLDR_ROOT}/${code}/languages.json`;
    if (!fs.existsSync(languagesFile)) continue;

    const languageData = JSON5.parse(fs.readFileSync(languagesFile, 'utf8')).main[code];
    const identity = languageData.identity;

    // skip locale-specific languages
    if (identity.letiant || identity.territory) continue;

    const info = {};
    const script = identity.script;
    if (script) {
      info.base = identity.language;
      info.script = script;
    }

    const nativeName = languageData.localeDisplayNames.languages[code];
    if (nativeName) {
      info.nativeName = nativeName;
    }

    unordered[code] = info;
  }

  // CLDR locales don't cover all the languages people might want to use for OSM tags,
  // so also add the language names that we have English translations for
  const languagesFile = `${CLDR_ROOT}/en/languages.json`;
  const languagesJSON = JSON5.parse(fs.readFileSync(languagesFile, 'utf8'));
  const englishNamesByCode = languagesJSON.main.en.localeDisplayNames.languages;
  Object.keys(englishNamesByCode).forEach(code => {
    if (code in unordered) return;
    if (code.indexOf('-') !== -1) return;
    if (skipLanguages.has(code)) return;
    unordered[code] = {};
  });

  const ordered = {};
  Object.keys(unordered).sort().forEach(key => ordered[key] = unordered[key]);
  return ordered;
}


//
//
//
export function languageNamesInLanguageOf(code) {
  if (rematchCodes[code])  code = rematchCodes[code];

  const languagesFile = `${CLDR_ROOT}/${code}/languages.json`;
  if (!fs.existsSync(languagesFile)) return {};

  const languagesJSON = JSON5.parse(fs.readFileSync(languagesFile, 'utf8'));
  const languages = languagesJSON.main[code].localeDisplayNames.languages;
  const results = {};

  for (const [code, name] of Object.entries(languages)) {
    if (skipLanguages.has(code)) continue;

    // Note: the codes are already sorted, so alternate forms will override standard forms
    const match = code.match(/^(.*)-alt-(.*)$/);  // e.g. "zh-Hans-alt-long"
    if (match !== null) {
      const base = match[1];
      const type = match[2];
      if (type === 'long' || type === 'menu') {   // only prefer these ones
        results[base] = name;
      }
    } else {
      results[code] = name;
    }
  }

  return results;
}


//
//
//
export function scriptNamesInLanguageOf(code) {
  if (rematchCodes[code])  code = rematchCodes[code];

  const scriptsFile = `${CLDR_ROOT}/${code}/scripts.json`;
  if (!fs.existsSync(scriptsFile)) return {};

  const scriptsJSON = JSON5.parse(fs.readFileSync(scriptsFile, 'utf8'));
  const scripts = scriptsJSON.main[code].localeDisplayNames.scripts;
  const results = {};

  for (const [code, name] of Object.entries(scripts)) {
    if (skipLanguages.has(code)) continue;

    // Note: the codes are already sorted, so alternate forms will override standard forms
    const match = code.match(/^(.*)-alt-(.*)$/);  // e.g. "Hans-alt-stand-alone"
    if (match !== null) {
      const base = match[1];
      const type = match[2];
      if (type === 'stand-alone') {   // only prefer these ones
        results[base] = name;
      }
    } else {
      results[code] = name;
    }
  }

  return results;
}
