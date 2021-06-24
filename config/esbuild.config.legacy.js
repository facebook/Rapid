import esbuild from 'esbuild';
import babel from 'esbuild-plugin-babel';

esbuild
    .build({
        entryPoints: ['./modules/id.js'],
        bundle: true,
        outfile: 'dist/iD.js',
        plugins: [babel({
            filter: /.*/,
            namespace: '',
            babelHelpers: 'bundled',
            // avoid circular dependencies due to `useBuiltIns: usage` option
            exclude: [/\/core-js\//]
            // babel config here or in babel.config.json
            // config: {
            //     ignore: ['**/*.json']
            // }
        })],
    })
    .catch(() => process.exit(1));
