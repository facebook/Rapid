import esbuild from 'esbuild';
import fs from 'node:fs';

esbuild
  .build({
    bundle: true,
    sourcemap: true,
    entryPoints: ['./modules/rapid.js'],
    legalComments: 'none',
    logLevel: 'info',
    metafile: true,
    outfile: 'dist/iD.js',
    loader: { '.js': 'jsx'},
  })
  .then(result => {
    fs.writeFileSync('./dist/esbuild.json', JSON.stringify(result.metafile, null, 2));
  })
  .catch(() => process.exit(1));
