import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';


describe('utilGetSetValue', () => {
  it('should get and set value', () => {
    // Mock a selection object
    const mockSelection = {
      property: function(prop) {
        return this[prop];
      },
      each: function(func) {
        func.call(this);
        return this;
      }
    };

    // Set value
    Rapid.utilGetSetValue(mockSelection, 'test value');
    assert.strictEqual(mockSelection.value, 'test value');

    // Get value
    const value = Rapid.utilGetSetValue(mockSelection);
    assert.strictEqual(value, 'test value');
  });

  it('should delete value for null or undefined', () => {
    const mockSelection = {
      property: function(prop) {
        return this[prop];
      },
      each: function(func) {
        func.call(this);
        return this;
      }
    };

    // Set value to null
    Rapid.utilGetSetValue(mockSelection, null);
    assert.strictEqual(mockSelection.value, undefined);

    // Set value to undefined
    Rapid.utilGetSetValue(mockSelection, undefined);
    assert.strictEqual(mockSelection.value, undefined);
  });
});