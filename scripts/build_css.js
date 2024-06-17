/* eslint-disable no-console */
import autoprefixer from 'autoprefixer';
import chalk from 'chalk';
import concat from 'concat-files';
import fs from 'node:fs';
import { glob } from 'glob';
import postcss from 'postcss';
import prepend from 'postcss-selector-prepend';

//
// This script concats all of the `/css/*` files into a single `dist/rapid.css` file.
//

let _buildPromise = null;

// If called directly, do the thing.
if (process.argv[1].indexOf('build_css.js') > -1) {
  buildCSSAsync();
}

export function buildCSSAsync() {
  if (_buildPromise) return _buildPromise;

  const START = '🏗   ' + chalk.yellow('Building css...');
  const END = '👍  ' + chalk.green('css built');

  console.log('');
  console.log(START);
  console.time(END);

  return _buildPromise = glob('css/**/*.css')
    .then(files => concatAsync(files.sort(), 'dist/rapid.css'))
    .then(() => {
      const css = fs.readFileSync('dist/rapid.css', 'utf8');
      return postcss([ autoprefixer, prepend({ selector: '.ideditor ' }) ])
        .process(css, { from: 'dist/rapid.css', to: 'dist/rapid.css' });
    })
    .then(result => fs.writeFileSync('dist/rapid.css', result.css))
    .then(() => {
      console.timeEnd(END);
      console.log('');
      _buildPromise = null;
    })
    .catch(err => {
      console.error(err);
      console.log('');
      _buildPromise = null;
      process.exit(1);
    });
}


function concatAsync(files, output) {
  return new Promise((resolve, reject) => {
    concat(files, output, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}
