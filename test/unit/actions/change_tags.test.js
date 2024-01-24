import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';

describe('actionChangeTags', () => {
  it('changes an entity\'s tags', () => {
    const entity = Rapid.osmEntity();
    const setTags = { foo: 'bar' };
    const graph = new Rapid.Graph([entity]);
    const result = Rapid.actionChangeTags(entity.id, setTags)(graph);

    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity(entity.id).tags, setTags);
  });
});
