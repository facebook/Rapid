## v3 Prototype Release Checklist

#### Update `master` branch
```bash
$  git checkout master
$  rm package-lock.json
$  rm -rf node_modules/editor-layer-index/
$  npm install
$  npm run imagery
$  npm run all
$  git add . && git commit -m 'npm run imagery'
$  git add -f dist
$  git commit -m 'Check in build'
$  git push origin master
```