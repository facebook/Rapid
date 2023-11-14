/* eslint-disable no-console */
import chalk from 'chalk';
import fs from 'node:fs';
import stringify from 'json-stringify-pretty-compact';
import shell from 'shelljs';
import YAML from 'js-yaml';

import * as languageNames from './language_names.js';

// FontAwesome icons
import * as fontawesome from '@fortawesome/fontawesome-svg-core';
import { fas } from '@fortawesome/free-solid-svg-icons';
import { far } from '@fortawesome/free-regular-svg-icons';
import { fab } from '@fortawesome/free-brands-svg-icons';
fontawesome.library.add(fas, far, fab);

import categoriesJSON from '@openstreetmap/id-tagging-schema/dist/preset_categories.min.json' assert { type: 'json' }
import fieldsJSON from '@openstreetmap/id-tagging-schema/dist/fields.min.json' assert { type: 'json' }
import presetsJSON from '@openstreetmap/id-tagging-schema/dist/presets.min.json' assert { type: 'json' }
import qaDataJSON from '../data/qa_data.json' assert { type: 'json' }
import territoriesJSON from 'cldr-core/supplemental/territoryInfo.json' assert { type: 'json' };


let _currBuild = null;


// if called directly, do the thing.
if (process.argv[1].indexOf('build_data.js') > -1) {
  buildData();
} else {
  module.exports = buildData;
}


function buildData() {
  if (_currBuild) return _currBuild;

  const START = '🏗   ' + chalk.yellow('Building data...');
  const END = '👍  ' + chalk.green('data built');

  console.log('');
  console.log(START);
  console.time(END);

  // Create symlinks if necessary..  { 'target': 'source' }
  const symlinks = {
    'land.html': 'dist/land.html',
    img: 'dist/img'
  };

  for (const [target, source] of Object.entries(symlinks)) {
    if (!shell.test('-L', target)) {
      console.log(`Creating symlink:  ${target} -> ${source}`);
      shell.ln('-sf', source, target);
    }
  }

  // Start clean
  shell.rm('-f', [
    'data/territory_languages.json',
    'dist/locales/en.json',
    'dist/data/*',
    'svg/fontawesome/*.svg',
  ]);

  // Gather icons from various places that we need assembled into a spritesheet.
  // Start with icons we want to use in the UI that aren't tied to other data.
  const icons = new Set([
    'fas-filter',
    'fas-i-cursor',
    'fas-lock',
    'fas-palette',
    'fas-th-list',
    'fas-user-cog'
  ]);
  gatherQAIssueIcons(icons);
  gatherPresetIcons(icons);
  writeIcons(icons)

  const territoryLanguages = gatherTerritoryLanguages();
  fs.writeFileSync('data/territory_languages.json', stringify(territoryLanguages, { maxLength: 9999 }) );

  const languageInfo = languageNames.langNamesInNativeLang();
  fs.writeFileSync('data/languages.json', stringify(languageInfo, { maxLength: 200 }));
  fs.writeFileSync('dist/data/languages.min.json', JSON.stringify(languageInfo));

  writeEnJson();

  minifySync('data/address_formats.json', 'dist/data/address_formats.min.json');
  minifySync('data/imagery.json', 'dist/data/imagery.min.json');
  minifySync('data/intro_graph.json', 'dist/data/intro_graph.min.json');
  minifySync('data/intro_rapid_graph.json', 'dist/data/intro_rapid_graph.min.json');
  minifySync('data/keepRight.json', 'dist/data/keepRight.min.json');
  minifySync('data/languages.json', 'dist/data/languages.min.json');
  minifySync('data/phone_formats.json', 'dist/data/phone_formats.min.json');
  minifySync('data/preset_overrides.json', 'dist/data/preset_overrides.min.json');
  minifySync('data/qa_data.json', 'dist/data/qa_data.min.json');
  minifySync('data/shortcuts.json', 'dist/data/shortcuts.min.json');
  minifySync('data/territory_languages.json', 'dist/data/territory_languages.min.json');
  minifySync('data/colors.json', 'dist/data/colors.min.json')

  return _currBuild = Promise.resolve(true)
    .then(() => {
      console.timeEnd(END);
      console.log('');
      _currBuild = null;
    })
    .catch((err) => {
      console.error(err);
      console.log('');
      _currBuild = null;
      process.exit(1);
    });
}


function gatherQAIssueIcons(icons) {
  for (const data of Object.values(qaDataJSON)) {
    for (const icon of Object.values(data.icons)) {
      if (icon) {
        icons.add(icon);
      }
    }
  }
}


function gatherPresetIcons(icons) {
  for (const source of [presetsJSON, categoriesJSON, fieldsJSON]) {
    for (const item of Object.values(source)) {
      if (item.icon) {
        icons.add(item.icon);
      }
    }
  }
}


function writeIcons(icons) {
  for (const icon of icons) {
    const [prefix, ...rest] = icon.split('-');
    const name = rest.join('-');

    if (['iD', 'rapid', 'maki', 'temaki', 'roentgen'].includes(prefix)) {
      continue;  // These are expected to live in an existing spritesheet..

    } else if (['fas', 'far', 'fab'].includes(prefix)) {   // FontAwesome, must be extracted
      const def = fontawesome.findIconDefinition({ prefix: prefix, iconName: name });
      try {
        fs.writeFileSync(`svg/fontawesome/${icon}.svg`, fontawesome.icon(def).html.toString());
      } catch (error) {
        console.error(`Error: No FontAwesome icon for ${icon}`);
        throw (error);
      }

    } else {
      console.warn(`Unknown icon: ${icon}`);
    }
  }
}


function gatherTerritoryLanguages() {
  let allRawInfo = territoriesJSON.supplemental;
  let territoryLanguages = {};

  Object.keys(allRawInfo).forEach(territoryCode => {
    let territoryLangInfo = allRawInfo[territoryCode].languagePopulation;
    if (!territoryLangInfo) return;
    let langCodes = Object.keys(territoryLangInfo);

    territoryLanguages[territoryCode.toLowerCase()] = langCodes.sort((langCode1, langCode2) => {
      const popPercent1 = parseFloat(territoryLangInfo[langCode1]._populationPercent);
      const popPercent2 = parseFloat(territoryLangInfo[langCode2]._populationPercent);
      if (popPercent1 === popPercent2) {
        return langCode1.localeCompare(langCode2, 'en', { sensitivity: 'base' });
      }
      return popPercent2 - popPercent1;
    }).map(langCode => langCode.replace('_', '-'));
  });

  return territoryLanguages;
}


function writeEnJson() {
  try {
    // Start with contents of core.yaml and merge in the other stuff.
    let enjson = YAML.load(fs.readFileSync('data/core.yaml', 'utf8'));
    let imagery = YAML.load(fs.readFileSync('node_modules/editor-layer-index/i18n/en.yaml', 'utf8'));
    const community = YAML.load(fs.readFileSync('node_modules/osm-community-index/i18n/en.yaml', 'utf8'));
    const manualImagery = JSON.parse(fs.readFileSync('data/manual_imagery.json', 'utf8'));

    // Gather strings for additional imagery not included in the imagery index
    for (const source of manualImagery) {
      let target = {};
      if (source.attribution?.text)  target.attribution = { text: source.attribution.text };
      if (source.name)               target.name = source.name;
      if (source.description)        target.description = source.description;

      imagery.en.imagery[source.id] = target;
    }

    // Check for these properties before overwriting
    ['imagery', 'community', 'languageNames', 'scriptNames'].forEach(prop => {
      if (enjson.en[prop]) {
        throw(`Reserved property '${prop}' already exists in core strings`);
      }
    });

    enjson.en.imagery = imagery.en.imagery;
    enjson.en.community = community.en;
    enjson.en.languageNames = languageNames.languageNamesInLanguageOf('en');
    enjson.en.scriptNames = languageNames.scriptNamesInLanguageOf('en');

    fs.writeFileSync('dist/locales/en.min.json', JSON.stringify(enjson));

  } catch (err) {
    console.error(chalk.red(`Error - ${err.message}`));
    process.exit(1);
  }
}


function minifySync(inPath, outPath) {
  try {
    const contents = fs.readFileSync(inPath, 'utf8');
    const minified = JSON.stringify(JSON.parse(contents));
    fs.writeFileSync(outPath, minified);
  } catch (err) {
    console.error(chalk.red(`Error - ${err.message} minifying:`));
    console.error('  ' + chalk.yellow(inPath));
    process.exit(1);
  }
}


export default buildData;
