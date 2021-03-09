## **RapiD** Release Checklist

#### Update `main` branch
```bash
$  git checkout main
$  rm -rf node_modules/editor-layer-index/
$  npm install
$  npm run imagery
$  npm run all
$  git add . && git commit -m 'npm run imagery'
```

- Update `CHANGELOG.md`
- Set release version number in `modules/core/rapid_context.js` and `package.json`

```bash
$  git add . && git commit -m 'vA.B.C'
$  git push origin main
```

#### Update and tag `release` branch
```bash
$  git checkout release
$  git reset --hard main
$  npm run all
$  git add -f dist/*.css dist/*.js dist/data/* dist/img/*.svg dist/mapillary-js/ dist/pannellum-streetside/
$  git commit -m 'Check in build'
$  git tag vA.B.C
$  git push origin -f release vA.B.C
```
- Open https://github.com/facebookincubator/RapiD/releases

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