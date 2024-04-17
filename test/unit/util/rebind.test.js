import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';


describe('utilRebind', () => {
  it('copy methods from source to target', () => {
    // Define source object with some methods
    const source = {
      add: function(a, b) {
        return a + b;
      },
      subtract: function(a, b) {
        return a - b;
      }
    };

    // Define target object
    const target = {};

    // Copy methods from source to target
    Rapid.utilRebind(target, source, 'add', 'subtract');

    // Check if methods were copied correctly
    assert.strictEqual(typeof target.add, 'function');
    assert.strictEqual(typeof target.subtract, 'function');
    assert.strictEqual(target.add(3, 2), 5);
    assert.strictEqual(target.subtract(3, 2), 1);
  });
});