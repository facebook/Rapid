// Karma configuration
// Generated on Wed Sep 01 2021 16:45:06 GMT+0200 (Central European Summer Time)

module.exports = function (config) {
  config.set({
    // base path that will be used to resolve all patterns (eg. files, exclude)
    basePath: '',

    plugins: ['karma-coverage', 'karma-mocha', 'karma-chrome-launcher', 'karma-json-fixtures-preprocessor'],

    // frameworks to use
    // available frameworks: https://www.npmjs.com/search?q=keywords:karma-adapter
    frameworks: ['mocha'],

    // list of files / patterns to load in the browser
    files: [
      'node_modules/chai/chai.js',
      'node_modules/sinon/pkg/sinon.js',
      'node_modules/sinon-chai/lib/sinon-chai.js',
      'node_modules/happen/happen.js',
      'node_modules/fetch-mock/es5/client-bundle.js',
      { pattern: 'dist/iD.js', included: true },
      { pattern: 'dist/iD.css', included: true },
      { pattern: 'dist/**/*', included: false },
      { pattern: 'test/spec/renderer/*.json', included: true, served: true},
      'test/spec/spec_helpers.js',
      'test/spec/**/*.js',
    ],

    // list of files / patterns to exclude
    exclude: [
      '**/*.js.map',
      'test/spec/behaviors/*.js',
      'test/spec/renderer/features.js',

      // Comment the next line to run the OSM renderer-specific unit test, which right now merely exercise the code.
      // These tests don't actually make any assertions and therefore always succeed.
      'test/spec/renderer/PixiRenderer.js'
    ],

    proxies: {
      '/dist/': 'http://localhost:9876/base/dist/',
      '/data/': 'http://localhost:9876/base/dist/data/',
      '/img/': 'http://localhost:9876/base/dist/img/'
    },

    // preprocess matching files before serving them to the browser
    // available preprocessors: https://www.npmjs.com/search?q=keywords:karma-preprocessor
    preprocessors: {
      'dist/iD.js': ['coverage'],
      'test/spec/renderer/*.json': ['json_fixtures']
    },

    // test results reporter to use
    // possible values: 'dots', 'progress'
    // available reporters: https://www.npmjs.com/search?q=keywords:karma-reporter
    reporters: ['progress', 'coverage'],

    // web server port
    port: 9876,

    // enable / disable colors in the output (reporters and logs)
    colors: true,

    // level of logging
    // possible values: config.LOG_DISABLE || config.LOG_ERROR || config.LOG_WARN || config.LOG_INFO || config.LOG_DEBUG
    logLevel: config.LOG_INFO,

    // enable / disable watching file and executing tests whenever any file changes
    autoWatch: true,

    // start these browsers
    // available browser launchers: https://www.npmjs.com/search?q=keywords:karma-launcher
    browsers: [
      'ChromeHeadless',
    ],

    // Continuous Integration mode
    // if true, Karma captures browsers, runs the tests and exits
    singleRun: true,

    // Concurrency level
    // how many browser instances should be started simultaneously
    concurrency: Infinity,

    remapIstanbulReporter: {
      remapOptions: {
        exclude: [
          'node_modules'
        ]
      }, //additional remap options
      reportOptions: {
        basePath: 'modules'
      }, //additional report options
      reports: {
        lcovonly: 'coverage/lcof.info',
        html: 'coverage'
      }
    }
  });
};