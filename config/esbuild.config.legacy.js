import esbuild from 'esbuild';
import fs from 'node:fs';

esbuild
  .build({
    bundle: true,
    sourcemap: true,
    entryPoints: ['./modules/main.js'],
    legalComments: 'none',
    logLevel: 'info',
    metafile: true,
    outfile: 'dist/rapid.legacy.js',
    loader: { '.js': 'jsx' },
    target: 'es2016',
  })
  .then(result => {
    fs.writeFileSync('./dist/esbuild-legacy.json', JSON.stringify(result.metafile, null, 2));
  })
  .catch(() => process.exit(1));
