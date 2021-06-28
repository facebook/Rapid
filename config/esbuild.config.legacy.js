import esbuild from 'esbuild';
import babel from 'esbuild-plugin-babel';

esbuild
    .build({
        entryPoints: ['./modules/id.js'],
        bundle: true,
        outfile: 'dist/iD.legacy.js',
        plugins: [babel({
            filter: /.*/,
            namespace: '',
            babelHelpers: 'bundled',
            // avoid circular dependencies due to `useBuiltIns: usage` option
            exclude: [/\/core-js\//],
            sourceType: 'unambiguous',
        })],
         target: ['es5']
    })
    .catch(() => process.exit(1));
