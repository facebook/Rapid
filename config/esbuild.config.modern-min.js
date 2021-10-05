import esbuild from 'esbuild';

esbuild
  .build({
    minify: true,
    bundle: true,
    sourcemap: true,
    entryPoints: ['./modules/iD.modern.js'],
    legalComments: 'none',
    logLevel: 'info',
    outfile: 'dist/iD.min.js'
  })
  .catch(() => process.exit(1));

esbuild
  .build({
    minify: true,
    bundle: true,
    sourcemap: true,
    entryPoints: ['./modules/worker.modern.js'],
    legalComments: 'none',
    logLevel: 'info',
    outfile: 'dist/worker.min.js'
  })
  .catch(() => process.exit(1));
