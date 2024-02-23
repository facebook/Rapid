import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';


describe('utilFetchResponse', () => {
  it('should handle successful JSON response', async () => {
    // Mock a successful fetch response with JSON content
    const mockResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      url: 'http://example.com/data.json',
      headers: {
        get: () => 'application/json'
      },
      json: () => Promise.resolve({ key: 'value' })
    };

    const result = await Rapid.utilFetchResponse(mockResponse);
    assert.deepStrictEqual(result, { key: 'value' });
  });

  it('should throw FetchError for unsuccessful response', async () => {
    // Mock an unsuccessful fetch response
    const mockResponse = {
      ok: false,
      status: 404,
      statusText: 'Not Found',
      url: 'http://example.com/data.json',
      headers: {
        get: () => 'application/json'
      }
    };

    try {
      await Rapid.utilFetchResponse(mockResponse);
      assert.fail('Expected utilFetchResponse to throw');
    } catch (err) {
      assert(err instanceof Rapid.FetchError);
      assert.strictEqual(err.status, 404);
      assert.strictEqual(err.statusText, 'Not Found');
    }
  });
});