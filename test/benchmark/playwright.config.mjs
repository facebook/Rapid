// playwright.config.cjs
// @ts-check

/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
  // Look for test files in the "tests" directory, relative to this configuration file
  testDir: 'tests',

  // Each test is given 30 seconds
  timeout: 30000,

  // Forbid test.only on CI
  forbidOnly: !!process.env.CI,

  testMatch: '*.mjs',

  // Two retries for each test
  retries: 2,

  // Limit the number of workers on CI, use default locally
  workers: process.env.CI ? 2 : undefined,

  use: {
    // Configure browser and context here
  },
};

export default config;
