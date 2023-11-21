/* eslint-disable no-console */
import shell from 'shelljs';

// This script should normally only be run from a GitHub deploy action.
// It rewrites the urls in `index.html` to instead point to a unique 'distpath' in our S3 bucket.
// Then we can just copy this `index.html` around and things will just work.
// This is how we do deploys of Rapid.

const now = new Date();
const yyyy = now.getUTCFullYear();
const mm = ('0' + (now.getUTCMonth() + 1)).slice(-2);
const dd = ('0' + now.getUTCDate()).slice(-2);

// Get these things from environment (fallbacks for testing)
const yyyymmdd = process.env.YYYYMMDD ?? `${yyyy}${mm}${dd}`;
const revision = process.env.REVISION ?? 'deadc0de';     // normally the git short hash
const distpath = process.env.DISTPATH ?? `${yyyymmdd}-${revision}`;

let file = 'dist/index.html';

// If you want to test this script, uncomment these lines to copy 'index.html' instead of modifying it in place.
//shell.cp('-f', 'dist/index.html', 'dist/index-copy.html');
//file = 'dist/index-copy.html';

// Update `index.html` in place to use the distpath urls
shell.sed('-i', 'dist/', `/rapid/${distpath}/`, file);
shell.sed('-i', 'img/', `/rapid/${distpath}/img/`, file);
shell.sed('-i', 'rapid.css', `/rapid/${distpath}/rapid.css`, file);
shell.sed('-i', 'rapid.js', `/rapid/${distpath}/rapid.js`, file);
shell.sed('-i', 'rapid.min.js', `/rapid/${distpath}/rapid.min.js`, file);
shell.sed('-i', "context.assetPath = ''", `context.assetPath = '/rapid/${distpath}/'`, file);
shell.sed('-i', "context.revision = ''", `context.revision = '${revision}'`, file);
