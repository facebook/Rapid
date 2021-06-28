/* eslint-disable no-console */
import colors from 'colors/safe.js';

import gaze from 'gaze/lib/gaze.js';
import StaticServer from 'static-server/server.js';
// const StaticServer = require('static-server');

import { buildCSS } from './build_css.js';


gaze(['css/**/*.css'], (err, watcher) => {
  watcher.on('all', () => buildCSS());
});

const server = new StaticServer({ rootPath: process.cwd(), port: 8080, followSymlink: true });
server.start(() => {
  console.log(colors.yellow(`Listening on ${server.port}`));
});