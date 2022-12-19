// playwright.config.cjs
// @ts-check

/** @type {import('@playwright/test').PlaywrightTestConfig} */

import devices from "@playwright/test";

const config = {
  // Look for test files in the "tests" directory, relative to this configuration file
  testDir: "tests",

  // Each test is given 30 seconds
  timeout: 90000,

  // Forbid test.only on CI
  forbidOnly: !!process.env.CI,

  testMatch: "*.mjs",

  // Two retries for each test
  retries: 2,

  // Limit the number of workers on CI, use default locally
  workers: 1,

  reporter:  [['github'], [ 'json', { outputFile: "test/benchmark/test-results.json" }]],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  ],

  use: {
    // Configure browser and context here
  },
};

export default config;
