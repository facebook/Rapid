import esbuild from 'esbuild';
import fs from 'node:fs';

esbuild
  .build({
    minify: true,
    bundle: true,
    sourcemap: false,
    metafile: true,
    entryPoints: ['./modules/main_prod.js'],
    legalComments: 'none',
    logLevel: 'info',
    outfile: 'dist/rapid.min.js',
    target: 'esnext'
  })
  .then(result => {
    fs.writeFileSync('./dist/esbuild.json', JSON.stringify(result.metafile, null, 2));
  })
  .catch(() => process.exit(1));
