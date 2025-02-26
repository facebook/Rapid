import esbuild from 'esbuild';

esbuild
  .build({
    minify: true,
    bundle: true,
    sourcemap: false,
    entryPoints: ['./modules/main_prod.js'],
    legalComments: 'none',
    logLevel: 'info',
    outfile: 'dist/rapid.legacy.min.js',
    target: 'es2016'
  })
  .catch(() => process.exit(1));
