import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';

describe('QAItem', () => {
  it('creates and updates QA item', () => {
    // Mock service
    const service = {
      id: 'testservice',
      getIcon: function() {
        return 'testicon';
      }
    };

    // Create QA item
    const item = new Rapid.QAItem(service, 'testtype', 'testid', { loc: [0, 0], prop1: 'value1' });
    assert.strictEqual(item.service, 'testservice');
    assert.strictEqual(item.itemType, 'testtype');
    assert.strictEqual(item.id, 'testid');
    assert.strictEqual(item.prop1, 'value1');
    assert.strictEqual(item.loc[0], 0);
    assert.strictEqual(item.loc[1], 0);
    assert.strictEqual(item.icon, 'testicon');

    // Update QA item
    item.update({ prop2: 'value2' });
    assert.strictEqual(item.prop2, 'value2');
    assert.strictEqual(item.id, 'testid');
  });
});
