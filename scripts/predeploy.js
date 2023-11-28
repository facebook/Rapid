/* eslint-disable no-console */
import shell from 'shelljs';

// This script should normally only be run from a GitHub deploy action.
// It rewrites the urls in `index.html` to instead point to a unique 'buildID' in our S3 bucket.
// Then we can just copy this `index.html` around and things will just work.
// This is how we do deploys of Rapid.

const now = new Date();
const yyyy = now.getUTCFullYear();
const mm = ('0' + (now.getUTCMonth() + 1)).slice(-2);
const dd = ('0' + now.getUTCDate()).slice(-2);

// Get these things from environment (fallbacks for testing)
const yyyymmdd = process.env.YYYYMMDD  ?? `${yyyy}${mm}${dd}`;
const buildSHA = process.env.BUILD_SHA ?? 'deadc0de';     // normally the git short hash
const buildID  = process.env.BUILD_ID  ?? `local-${buildSHA}`;

const isDebug = /^(local|main|pull-request)-/.test(buildID);
const path = `/rapid/${buildID}`;

let file = 'dist/index.html';

// If you want to test this script, uncomment these lines to copy 'index.html' instead of modifying it in place.
// Then run `node scripts/predeploy.js`
//file = 'dist/index-copy.html';
//shell.cp('-f', 'dist/index.html', file);

// Update `index.html` in place to use the buildID urls
shell.sed('-i', 'dist/', `${path}/`, file);
shell.sed('-i', 'img/', `${path}/img/`, file);
shell.sed('-i', 'rapid.css', `${path}/rapid.css`, file);
shell.sed('-i', 'rapid.js', `${path}/rapid.js`, file);
shell.sed('-i', /context.assetPath.*;/, `context.assetPath = '${path}/';`, file);
shell.sed('-i', /context.buildID.*;/, `context.buildID = '${buildID}';`, file);
shell.sed('-i', /context.buildSHA.*;/, `context.buildSHA = '${buildSHA}';`, file);
shell.sed('-i', /context.buildDate.*;/, `context.buildDate = '${yyyymmdd}';`, file);

if (isDebug) {
  shell.sed('-i', 'rapid.min.js', `${path}/rapid.js`, file);                      // don't use minified rapid
  shell.sed('-i', 'const context =', 'const context = window.context =', file);   // make context global
} else {
  shell.sed('-i', 'rapid.min.js', `${path}/rapid.min.js`, file);
}
