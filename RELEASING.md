## **RapiD** Release Checklist

#### If you want to update translations
- If you don't have a `transifex.auth` file in the root of your RapiD project,
you'll need to create a Transifex account, ask @bhousel for admin rights
on the iD project, and then create this file with contents like<br>
```js
{ "user": "yourusername", "password": "*******" }
```
This file is not version-controlled and will not be checked in.


#### Update `main` branch
```bash
$  git checkout main
$  rm -rf package-lock.json node_modules/editor-layer-index/
$  npm install
$  npm run imagery
$  npm run all
$  git add . && git commit -m 'npm run imagery'
$  npm run translations
$  git add . && git commit -m 'npm run translations'
```

- Update `CHANGELOG.md`
- Set release version number in `modules/core/rapid_context.js` and `package.json`

```bash
$  git add . && git commit -m 'rapid-vA.B.C'
$  git push origin main
```

#### Update and tag `release` branch
```bash
$  git checkout release
$  git reset --hard main
$  npm run all
$  git add -f dist
$  git commit -m 'Check in build'
$  git tag rapid-vA.B.C
$  git push origin -f release rapid-vA.B.C
```
- Open https://github.com/facebook/RapiD/releases

#### Deploy
The Release branch contains everything to be deployed. For example:

```bash
$  git checkout release
$  aws s3 cp dist <destination>
```

#### Prepare `main` branch for further development
```bash
$  git checkout main
```

- Increment version number and add `-dev` suffix in `modules/core/rapid_context.js` and `package.json`, e.g. `2.18.5-dev`

```bash
$  git add . && git commit -m 'Set development version number'
$  git push origin main
```