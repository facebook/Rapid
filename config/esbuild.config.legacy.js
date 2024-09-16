import esbuild from 'esbuild';

esbuild
  .build({
    minify: false,
    bundle: true,
    sourcemap: false,
    entryPoints: ['./modules/main.js'],
    legalComments: 'none',
    logLevel: 'info',
    outfile: 'dist/rapid.legacy.js',
    target: 'es2016'
  })
  .catch(() => process.exit(1));
