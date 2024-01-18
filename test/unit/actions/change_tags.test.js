import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';

test('actionChangeTags', async t => {
  await t.test('changes an entity\'s tags', t => {
    const entity = Rapid.osmEntity();
    const setTags = { foo: 'bar' };
    const graph = new Rapid.Graph([entity]);
    const result = Rapid.actionChangeTags(entity.id, setTags)(graph);

    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity(entity.id).tags, setTags);
  });
});
