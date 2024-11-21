import { before, after, beforeEach, describe, it } from 'node:test';
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
  let origNavigator;

  before(() => {
    origNavigator = global.navigator;
  });

  after(() => {
    global.navigator = origNavigator;  // restore original
  });

  beforeEach(() => {
    const mock = {
      languages: ['en-US', 'en'],
      platform: 'MacIntel',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
    };
    // Copy the original navigator, so we can safely change things.
    global.navigator = Object.assign(origNavigator || mock);
  });

  it('should detect the browser and version', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3';
    global.navigator.userAgent = ua;
    const detected = Rapid.utilDetect(true);
    assert.strictEqual(detected.browser, 'Chrome');
    assert.strictEqual(detected.version, '58.0');
  });

  it('should detect the os and platform', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3';
    global.navigator.userAgent = ua;
    const detected = Rapid.utilDetect(true);
    assert.strictEqual(detected.os, 'win');
    assert.strictEqual(detected.platform, 'Windows');
  });

  it('should detect the locale', () => {
    global.navigator.languages = ['es'];
    const detected = Rapid.utilDetect(true);
    assert.ok(detected.locales.includes('es'));
  });
});
