module.exports = function (config) {
  config.set({
    // base path that will be used to resolve all patterns (eg. files, exclude)
    basePath: '',

    plugins: [
      'karma-coverage',
      'karma-mocha',
      'karma-mocha-reporter',
      'karma-chrome-launcher',
      'karma-json-fixtures-preprocessor'
    ],

    // frameworks to use
    // available frameworks: https://www.npmjs.com/search?q=keywords:karma-adapter
    frameworks: ['mocha'],

    // list of files / patterns to load in the browser
    files: [
      'node_modules/sinon/pkg/sinon.js',
      'node_modules/happen/happen.js',
      'node_modules/fetch-mock/es5/client-bundle.js',
      { pattern: 'dist/rapid.js', included: true },
      { pattern: 'dist/rapid.css', included: true },
      { pattern: 'dist/**/*', included: false },
      { pattern: 'node_modules/chai/*', included: false },
      { pattern: 'test/browser/renderer/*.json', included: false },
      { type: 'module', pattern: 'test/spec_helpers.js' },
      'test/browser/**/*.js'
    ],

    // list of files / patterns to exclude
    exclude: [
      'test/browser/pixi/*.js',
      // Comment the next line to run the OSM renderer-specific unit test, which right now merely exercise the code.
      // These tests don't actually make any assertions and therefore always succeed.
      'test/browser/renderer/PixiRenderer.js'
    ],

    proxies: {
      '/dist/': 'http://localhost:9876/base/dist/',
      '/data/': 'http://localhost:9876/base/dist/data/',
      '/img/': 'http://localhost:9876/base/dist/img/'
    },

    // preprocess matching files before serving them to the browser
    // available preprocessors: https://www.npmjs.com/search?q=keywords:karma-preprocessor
    preprocessors: {
      'dist/rapid.js': ['coverage'],
      'test/browser/renderer/*.json': ['json_fixtures']
    },

    // test results reporter to use
    // possible values: 'dots', 'progress'
    // available reporters: https://www.npmjs.com/search?q=keywords:karma-reporter
    reporters: ['mocha', 'coverage'],

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
      'ChromeHeadless'
    ],

    // Continuous Integration mode
    // if true, Karma captures browsers, runs the tests and exits
    singleRun: true,

    // Concurrency level
    // how many browser instances should be started simultaneously
    concurrency: 2,

    remapIstanbulReporter: {
      remapOptions: {
        exclude: [
          'node_modules'
        ]
      },
      reportOptions: {
        basePath: 'modules'
      },
      reports: {
        lcovonly: 'coverage/lcof.info',
        html: 'coverage'
      }
    }
  });
};
