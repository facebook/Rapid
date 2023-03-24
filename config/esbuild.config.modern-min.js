import esbuild from 'esbuild';

esbuild
  .build({
    minify: true,
    bundle: true,
    sourcemap: true,
    entryPoints: ['./modules/main.js'],
    legalComments: 'none',
    logLevel: 'info',
    outfile: 'dist/rapid.min.js',
  })
  .catch(() => process.exit(1));
