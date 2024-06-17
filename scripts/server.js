/* eslint-disable no-console */
import chalk from 'chalk';
import gaze from 'gaze/lib/gaze.js';
import StaticServer from 'static-server/server.js';

import { buildCSSAsync } from './build_css.js';


gaze(['css/**/*.css'], (err, watcher) => {
  watcher.on('all', () => buildCSSAsync());
});

const server = new StaticServer({ rootPath: process.cwd(), port: 8080, followSymlink: true });
server.start(() => {
  console.log(chalk.yellow(`Listening on ${server.port}`));
});
