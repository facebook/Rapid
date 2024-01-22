import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';

test('actionNoop', async t => {
  await t.test('does nothing', () => {
    const graph = new Rapid.Graph();
    const result = Rapid.actionNoop()(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.equal(graph, result);
  });
});