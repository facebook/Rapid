#!/bin/bash

# This is an example script that shows how to pull the latest version
# of Rapid and replace the version string with a git short hash.
#
# To use this on your own site, you'll want to change the `cp` and `chgrp`
# lines at the end to match your web server's documentroot folder and security group.

git checkout -q main
git remote update > /dev/null

rev=`git rev-parse --short HEAD`
orig=`git rev-parse --short origin/main`

# pull latest code
if [[ "${rev}" != "${orig}" ]] ; then
  # avoid issues with local untracked locale files
  rm -f dist/locales/*.json
  git reset --hard HEAD
  git pull origin main

  rev=`git rev-parse --short HEAD`
  sed -i "s/context.version = .*;/context.version = '${rev}';/" modules/core/context.js

  npm prune
  npm install > /dev/null 2>&1
fi

# pull latest imagery
rm -rf node_modules/editor-layer-index/
git clone https://github.com/osmlab/editor-layer-index.git node_modules/editor-layer-index > /dev/null 2>&1
rm -rf node_modules/editor-layer-index/.git/

# build everything
npm run imagery
npm run all

# pull latest translations
if [[ -f transifex.auth ]] ; then
  npm run translations
fi

cp -Rf dist/* /var/www/path/to/rapid/
chgrp -R www-data /var/www/path/to/rapid/