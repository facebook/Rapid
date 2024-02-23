import { afterEach, beforeEach, describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';

describe('ValidationIssue', () => {
  let context;
  beforeEach(() => {
    context = {
      systems: {
        l10n: {
          t: (key) => key,
        },
        validator: {
          ignoreIssue: () => {},
        },
      },
    };
  });
  afterEach(() => {
    context = null;
  });
  it('should construct a ValidationIssue object and test its methods', () => {
    const props = {
      type: 'Test Type',
      subtype: 'Test Subtype',
      severity: 'warning',
      entityIds: ['1', '2', '3'],
      loc: [0, 0],
      data: {},
      hash: 'Test Hash',
      autoArgs: {},
      message: function() { return 'Test Message'; },
      reference: function() { return 'Test Reference'; },
      dynamicFixes: function() { return []; },
    };
    const validationIssue = new Rapid.ValidationIssue(context, props);
    // Test properties
    assert.strictEqual(validationIssue.type, 'Test Type');
    assert.strictEqual(validationIssue.subtype, 'Test Subtype');
    assert.strictEqual(validationIssue.severity, 'warning');
    assert.deepStrictEqual(validationIssue.entityIds, ['1', '2', '3']);
    assert.deepStrictEqual(validationIssue.loc, [0, 0]);
    assert.deepStrictEqual(validationIssue.data, {});
    assert.strictEqual(validationIssue.hash, 'Test Hash');
    assert.deepStrictEqual(validationIssue.autoArgs, {});
    assert.strictEqual(validationIssue.message(), 'Test Message');
    assert.strictEqual(validationIssue.reference(), 'Test Reference');
    assert.deepStrictEqual(validationIssue.dynamicFixes(), []);
    assert.strictEqual(validationIssue.id.includes('Test Type'), true);
    assert.strictEqual(validationIssue.key.includes(validationIssue.id), true);
    // Test extent method
    const extent = validationIssue.extent();
    assert.strictEqual(extent.min[0], 0);
    assert.strictEqual(extent.min[1], 0);
    assert.strictEqual(extent.max[0], 0);
    assert.strictEqual(extent.max[1], 0);
    // Test fixes method
    const fixes = validationIssue.fixes();
    assert.strictEqual(fixes.length, 1);
    assert.strictEqual(fixes[0].title, 'issues.fix.ignore_issue.title');
    assert.strictEqual(fixes[0].issue, validationIssue);
  });
});