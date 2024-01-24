import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';

describe('actionChangeMember', () => {
  it('updates the member at the specified index', () => {
    const node = Rapid.osmNode();
    const relation = Rapid.osmRelation({members: [{id: node.id}]});
    const action = Rapid.actionChangeMember(relation.id, {id: node.id, role: 'node'}, 0);
    const graph = new Rapid.Graph([node, relation]);
    const result = action(graph);

    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity(relation.id).members, [{id: node.id, role: 'node'}]);
  });
});
