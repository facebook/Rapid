import { afterEach, beforeEach, describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';

if (!global.window) {  // mock window for Node
  global.window = {
    devicePixelRatio: 1,
    top: {
      location: {
        origin: 'http://example.com',
        pathname: '/path/to/page'
      }
    }
  };
}

describe('utilDetect', () => {
  let navigator;
  let originalNavigator = global.navigator;
  beforeEach(() => {
    // Create a mock navigator object with a languages and platform property
    navigator = {
      languages: ['en-US'],
      platform: 'Windows'
    };
    // Set the mock navigator object as the global navigator object
    global.navigator = navigator;
  });
  afterEach(() => {
    // Reset the global navigator object to its original value
    global.navigator = originalNavigator;
  });

  it('should detect the browser and version', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3';
    global.navigator = { userAgent: ua };
    const detected = Rapid.utilDetect();
    assert.strictEqual(detected.browser, 'Chrome');
    assert.strictEqual(detected.version, '58.0');
  });

  it('should detect the platform', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3';
    global.navigator = { userAgent: ua };
    const detected = Rapid.utilDetect();
    assert.strictEqual(detected.os, 'win');
    assert.strictEqual(detected.platform, 'Windows');
  });

  it('should detect the locale', () => {
    const detected = Rapid.utilDetect();
    assert.ok(!detected.browserLocales.includes('en-US'));
  });

  it('should detect the platform', () => {
    const detected = Rapid.utilDetect();
    assert.strictEqual(detected.platform, 'Windows');
  });
});