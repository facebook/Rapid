import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';


describe('actionDeleteMember', () => {
  it('removes the member at the specified index', () => {
    const n1 = Rapid.osmNode({id: 'n1'});
    const n2 = Rapid.osmNode({id: 'n2'});
    const r1 = Rapid.osmRelation({ id: 'r1', members: [{id: 'n1'}, {id: 'n2'}] });
    const graph = new Rapid.Graph([n1, n2, r1]);
    const result = Rapid.actionDeleteMember('r1', 0)(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity('r1').members, [{id: 'n2'}]);
  });

  it('deletes relations that become empty', () => {
    const n1 = Rapid.osmNode({id: 'n1'});
    const r1 = Rapid.osmRelation({ id: 'r1', members: [{id: 'n1'}] });
    const graph = new Rapid.Graph([n1, r1]);
    const result = Rapid.actionDeleteMember('r1', 0)(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.ok(!result.hasEntity('r1'));
  });
});
