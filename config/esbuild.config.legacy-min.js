import esbuild from 'esbuild';

esbuild
  .build({
    minify: true,
    bundle: true,
    sourcemap: true,
    entryPoints: ['./modules/main.js'],
    legalComments: 'none',
    logLevel: 'info',
    outfile: 'dist/rapid.legacy.min.js',
    target: 'es2016',
    loader: { '.js': 'jsx'},
  })
  .catch(() => process.exit(1));
