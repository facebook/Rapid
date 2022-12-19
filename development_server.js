/* eslint-disable no-console */
const colors = require('colors/safe');
const gaze = require('gaze');
const StaticServer = require('static-server');

const isDevelopment = process.argv[2] === 'develop';

const buildData = require('./build_data')(isDevelopment);
const buildSrc = require('./build_src')(isDevelopment);
const buildCSS = require('./build_css')(isDevelopment);


buildData()
  .then(() => buildSrc());

buildCSS();

if (isDevelopment) {
  gaze(['css/**/*.css'], (err, watcher) => {
    watcher.on('all', () => {
      buildCSS();
    });
  });

  gaze([
    'data/**/*.{js,json}',
    'data/core.yaml',
    // ignore the output files of `buildData`
    '!data/presets/categories.json',
    '!data/presets/fields.json',
    '!data/presets/presets.json',
    '!data/presets.yaml',
    '!data/taginfo.json',
    '!data/territory-languages.json',
    '!dist/locales/en.json'
  ],
    (err, watcher) => {
      watcher.on('all', () => {
        buildData()
          .then(() => buildSrc());
      });
    }
  );

  gaze(['modules/**/*.js'], (err, watcher) => {
    watcher.on('all', () => {
      buildSrc();
    });
  });

  const server = new StaticServer({ rootPath: __dirname, port: 8080, followSymlink: true });
  server.start(() => {
    console.log(chalk.yellow('Listening on ' + server.port));
  });
}
