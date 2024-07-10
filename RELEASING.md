## **Rapid** Release Checklist

### To update translations

Create a file `transifex.auth` in the root folder of the Rapid project.
This file should contain your API bearer token, for example:
```js
 { "token": "1/f306870b35f5182b5c2ef80aa4fd797196819cb132409" }
```
See: https://developers.transifex.com/reference/api-authentication for information on generating an API bearer token.
(This file is `.gitignore`d)


### Update `main` branch

The `main` branch includes all the code, but we don't check in the built assets to git.
(Many of the files in `/dist` are in `.gitignore`)

```bash

# Make sure your main branch is up to date and all tests pass
git checkout main
git pull origin
npm run test

# Pick a version, see https://semver.org/ - for example: 'A.B.C' or 'A.B.C-pre.D'
#  - We do this step first because the files in `/dist` will include this version in their metadata
#  - Update `CHANGELOG.md`
#  - Set release version number in `modules/core/context.js` and `package.json`

# Store in environment variable for later (replace below with the actual version)
export VERSION=rapid-A.B.C-pre.D
npm run build
git add . && git commit -m  "$VERSION"

# Update imagery
rm -rf package-lock.json node_modules/editor-layer-index/
npm install
npm run imagery
npm run build
git add . && git commit -m 'npm run imagery'

# Update translations
npm run translations
npm run build
git add . && git commit -m 'npm run translations'

# Update main branch
git push origin main

```


### Update and tag `release` branch

The `release` branch checks in the contents of `/dist` too, this makes it suitable for deployment.
It's basically a copy of `main` but with one additional commit appended to it.
This will also be the commit that we tag and publish.
(We use `-f` to force check-in all the files in `/dist`)

```bash
git checkout release
git reset --hard main
npm run all
git add -f dist
git commit -m 'Check in build'
git push origin -f release
```

Sanity check:
- At this point, our GitHub deploy action should notice that a commit was pushed to the release branch.
- You can check the status of the action to see where the release got deployed:
  https://github.com/facebook/Rapid/actions/workflows/deploy.yml
- There will be a URL like https://rapideditor.org/rapid/release-3549c3c/index.html
- Test it!
- If something looks wrong, you can still go back to `main` and push more commits, then remake the `release` branch as above.


The point of no return, tag and publish:
```bash
git tag "$VERSION"
git push origin "$VERSION"
npm publish
```

Set as latest release on GitHub:
- Open https://github.com/facebook/Rapid/blob/main/CHANGELOG.md and copy the URL to the new release
- Open https://github.com/facebook/Rapid/tags and pick the new tag you just pushed
- There should be a link like "create a release from the tag", click that, and paste in the link to the changelog.


### Deploys

Rapid is set up to do deploys automatically from a GitHub Action (see above).
(We use AWS web console to promote a release to `rapideditor.org/rapid` or other URLs.)

You can also manually deploy Rapid someplace just by copying the `/dist` folder, for example:

```bash
git checkout release
aws s3 cp dist <destination>
```

### Notify Partners

Notify anyone who uses Rapid that there is a new release.
This section is to keep track of those.

#### OpenStreetMap Communities
- Discourse: https://community.openstreetmap.org/
- Diaries:  https://openstreetmap.org/diary
- OSM-US Slack:  https://osmus.slack.com/
- Discord: https://discord.gg/openstreetmap

#### MapRoulette
https://github.com/maproulette/maproulette3

#### HOT Tasking Manager
https://github.com/hotosm/tasking-manager

