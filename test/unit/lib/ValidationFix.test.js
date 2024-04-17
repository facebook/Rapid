import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';

describe('ValidationFix', () => {
  it('constructs a ValidationFix object', () => {
    const props = {
      title: 'Test Title',
      // eslint-disable-next-line no-console
      onClick: () => console.log('Clicked'),
      disabledReason: 'Test Reason',
      icon: 'Test Icon',
      entityIds: ['1', '2', '3']
    };
    const validationFix = new Rapid.ValidationFix(props);
    assert.strictEqual(validationFix.title, 'Test Title');
    assert.strictEqual(typeof validationFix.onClick, 'function');
    assert.strictEqual(validationFix.disabledReason, 'Test Reason');
    assert.strictEqual(validationFix.icon, 'Test Icon');
    assert.deepStrictEqual(validationFix.entityIds, ['1', '2', '3']);
    assert.strictEqual(validationFix.issue, null);
  });
});