import { beforeEach, describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';

describe('osmRemoveLifecyclePrefix', () => {
  it('removes the lifecycle prefix from a tag key', () => {
    var result = Rapid.osmRemoveLifecyclePrefix('was:natural');
    assert.equal(result, 'natural');

    result = Rapid.osmRemoveLifecyclePrefix('destroyed:seamark:type');
    assert.equal(result, 'seamark:type');
  });


  it('ignores invalid lifecycle prefixes', () => {
    var result = Rapid.osmRemoveLifecyclePrefix('ex:leisure');
    assert.equal(result, 'ex:leisure');
  });
});


describe('osmTagSuggestingArea', () => {
  beforeEach(() => {
    Rapid.osmSetAreaKeys({ leisure: {} });
  });


  it('handles features with a lifecycle prefixes', () => {
    var result = Rapid.osmTagSuggestingArea({ leisure: 'stadium' });
    assert.deepEqual(result, { leisure: 'stadium' });

    result = Rapid.osmTagSuggestingArea({ 'disused:leisure': 'stadium' });
    assert.deepEqual(result, { 'disused:leisure': 'stadium' });

    result = Rapid.osmTagSuggestingArea({ 'ex:leisure': 'stadium' });
    assert.equal(result, null);
  });
});
