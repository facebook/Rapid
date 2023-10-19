/* eslint-disable no-console */
import chalk from 'chalk';
import gaze from 'gaze/lib/gaze.js';
import StaticServer from 'static-server/server.js';

import { buildCSS } from './build_css.js';
// import { buildData } from './build_data.js';


gaze(['css/**/*.css'], (err, watcher) => {
  watcher.on('all', () => buildCSS());
});

// // added gaze watcher for all .js files
// gaze(['**/*.js'], (err, watcher) => {
//   watcher.on('all', () => buildData());
// });

const server = new StaticServer({ rootPath: process.cwd(), port: 8080, followSymlink: true });
server.start(() => {
  console.log(chalk.yellow(`Listening on ${server.port}`));
});
