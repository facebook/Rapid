import esbuild from 'esbuild';
import fs from 'node:fs';

esbuild
  .build({
    minify: false,
    bundle: true,
    sourcemap: true,
    metafile: true,
    entryPoints: ['./modules/main.js'],
    legalComments: 'none',
    logLevel: 'info',
    outfile: 'dist/rapid.js',
    target: 'esnext'
  })
  .then(result => {
    fs.writeFileSync('./dist/esbuild.json', JSON.stringify(result.metafile, null, 2));
  })
  .catch(() => process.exit(1));
