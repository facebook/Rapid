import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';

import { EventEmitter } from '@pixi/utils';

describe('utilTriggerEvent', () => {
  it('trigger event', () => {
    // Define target object
    const target = new EventEmitter();
    target.each = function(func) {
      func.call(this);
    };
    // Listen for the event
    let eventTriggered = false;
    target.on('testevent', () => {
      eventTriggered = true;
    });
    // Define mock document object
    const mockDocument = {
      createEvent: function() {
        return {
          initEvent: function() {},
        };
      },
    };
    // Trigger event
    Rapid.utilTriggerEvent(target, 'testevent', mockDocument);
    // Check if event was triggered correctly
    assert.strictEqual(eventTriggered, true);
  });
});