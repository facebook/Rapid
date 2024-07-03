/* eslint-disable no-console */
import fs from 'node:fs';
import JSON5 from 'json5';

//
// This script gets all the supported language names from CLDR
// - langNamesInNativeLang()
// - languageNamesInLanguageOf(code)
// - scriptNamesInLanguageOf(code)
//

const CLDR_ROOT = 'node_modules/cldr-localenames-full/main/';
const rematchCodes = { 'ar-AA': 'ar', 'zh-CN': 'zh', 'zh-HK': 'zh-Hant-HK', 'zh-TW': 'zh-Hant', 'pt-BR': 'pt', 'pt': 'pt-PT' };

const codesToSkip = ['ase', 'mis', 'mul', 'und', 'zxx'];
const referencedScripts = [];

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
    const languagesFile = `${CLDR_ROOT}${code}/languages.json`;
    if (!fs.existsSync(languagesFile)) continue;

    const languageData = JSON5.parse(fs.readFileSync(languagesFile, 'utf8')).main[code];
    const identity = languageData.identity;

    // skip locale-specific languages
    if (identity.letiant || identity.territory) continue;

    const info = {};
    const script = identity.script;
    if (script) {
      referencedScripts.push(script);
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
  const languagesFile = `${CLDR_ROOT}en/languages.json`;
  const languagesJSON = JSON5.parse(fs.readFileSync(languagesFile, 'utf8'));
  const englishNamesByCode = languagesJSON.main.en.localeDisplayNames.languages;
  Object.keys(englishNamesByCode).forEach(code => {
    if (code in unordered) return;
    if (code.indexOf('-') !== -1) return;
    if (codesToSkip.indexOf(code) !== -1) return;
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
  if (rematchCodes[code]) code = rematchCodes[code];

  const languagesFile = `${CLDR_ROOT}${code}/languages.json`;
  if (!fs.existsSync(languagesFile)) return null;

  const languagesJSON = JSON5.parse(fs.readFileSync(languagesFile, 'utf8'));
  const translatedLangsByCode = languagesJSON.main[code].localeDisplayNames.languages;

  // ignore codes for non-languages
  codesToSkip.forEach(skipCode => {
    delete translatedLangsByCode[skipCode];
  });

  for (let langCode in translatedLangsByCode) {
    const altLongIndex = langCode.indexOf('-alt-long');
    if (altLongIndex !== -1) {    // prefer long names (e.g. Chinese -> Mandarin Chinese)
      const base = langCode.substring(0, altLongIndex);
      translatedLangsByCode[base] = translatedLangsByCode[langCode];
    }

    if (langCode.includes('-alt-')) {
      // remove alternative names
      delete translatedLangsByCode[langCode];
    } else if (langCode === translatedLangsByCode[langCode]) {
      // no localized value available
      delete translatedLangsByCode[langCode];
    } else if (!langNamesInNativeLang[langCode]){
      // we don't need to include language names that we probably won't be showing in the UI
      delete translatedLangsByCode[langCode];
    }
  }

  return translatedLangsByCode;
}


//
//
//
export function scriptNamesInLanguageOf(code) {
  if (rematchCodes[code]) code = rematchCodes[code];

  const scriptsFile = `${CLDR_ROOT}${code}/scripts.json`;
  if (!fs.existsSync(scriptsFile)) return null;

  const scriptsJSON = JSON5.parse(fs.readFileSync(scriptsFile, 'utf8'));
  const allTranslatedScriptsByCode = scriptsJSON.main[code].localeDisplayNames.scripts;

  const translatedScripts = {};
  referencedScripts.forEach(script => {
    if (!allTranslatedScriptsByCode[script] || script === allTranslatedScriptsByCode[script]) return;
    translatedScripts[script] = allTranslatedScriptsByCode[script];
  });

  return translatedScripts;
}
