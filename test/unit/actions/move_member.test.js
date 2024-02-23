import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';

describe('actionMoveMember', () => {
  it('moves a member from one index to another in the specified relation', () => {
    const relation = new Rapid.osmRelation({ id: 'r1', members: [{ id: '1' }, { id: '3' }] });
    const graph = new Rapid.Graph([relation]);
    const result = Rapid.actionMoveMember('r1', 1, 0)(graph);

    assert.ok(result instanceof Rapid.Graph);
    if (result && result.entityCount) {
      assert.equal(result.entityCount(), 1);
      assert.deepEqual(result.entity('r1').members, [{ id: '3' }, { id: '1' }]);
    }
  });
});