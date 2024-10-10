import esbuild from 'esbuild';

esbuild
  .build({
    minify: false,
    bundle: true,
    sourcemap: true,
    entryPoints: ['./modules/main_dev.js'],
    legalComments: 'none',
    logLevel: 'info',
    outfile: 'dist/rapid.js',
    target: 'esnext'
  })
  .catch(() => process.exit(1));
