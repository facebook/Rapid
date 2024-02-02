import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';


describe('actionDeleteNode', () => {
  it('removes the node from the graph', () => {
    const n1 = Rapid.osmNode({id: 'n1'});
    const graph = new Rapid.Graph([n1]);
    const result = Rapid.actionDeleteNode('n1')(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.ok(!result.hasEntity('n1'));
  });

  it('removes the node from parent ways', () => {
    const n1 = Rapid.osmNode({id: 'n1'});
    const n2 = Rapid.osmNode({id: 'n2'});
    const n3 = Rapid.osmNode({id: 'n3'});
    const w1 = Rapid.osmWay({id: 'w1', nodes: ['n1', 'n2', 'n3']});
    const graph = new Rapid.Graph([n1, n2, n3, w1]);
    const result = Rapid.actionDeleteNode('n1')(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.ok(!result.hasEntity('n1'));
    assert.deepEqual(result.entity('w1').nodes, ['n2', 'n3']);
  });

  it('removes the node from parent relations', () => {
    const n1 = Rapid.osmNode({id: 'n1'});
    const n2 = Rapid.osmNode({id: 'n2'});
    const r1 = Rapid.osmRelation({ id: 'r1', members: [{ id: 'n1' }, { id: 'n2' }]});
    const graph = new Rapid.Graph([n1, n2, r1]);
    const result = Rapid.actionDeleteNode('n1')(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.ok(!result.hasEntity('n1'));
    assert.deepEqual(result.entity('r1').members, [{ id: 'n2' }]);
  });

  it('deletes linear parent ways that become degenerate', () => {
    const n1 = Rapid.osmNode({id: 'n1'});
    const n2 = Rapid.osmNode({id: 'n2'});
    const w1 = Rapid.osmWay({id: 'w1', nodes: ['n1', 'n2']});
    const graph = new Rapid.Graph([n1, n2, w1]);
    const result = Rapid.actionDeleteNode('n1')(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.ok(!result.hasEntity('n1'));
    assert.ok(!result.hasEntity('n2'));
    assert.ok(!result.hasEntity('w1'));
  });

  it('deletes circular parent ways that become degenerate', () => {
    const n1 = Rapid.osmNode({id: 'n1'});
    const n2 = Rapid.osmNode({id: 'n2'});
    const n3 = Rapid.osmNode({id: 'n3'});
    const w1 = Rapid.osmWay({id: 'w1', nodes: ['n1', 'n2', 'n3', 'n1']});
    const graph = new Rapid.Graph([n1, n2, n3, w1]);
    const result = Rapid.actionDeleteNode('n2')(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.ok(!result.hasEntity('n1'));
    assert.ok(!result.hasEntity('n2'));
    assert.ok(!result.hasEntity('n3'));
    assert.ok(!result.hasEntity('w1'));
  });

  it('deletes parent relations that become empty', () => {
    const n1 = Rapid.osmNode({id: 'n1'});
    const r1 = Rapid.osmRelation({id: 'r1', members: [{ id: 'n1' }]});
    const graph = new Rapid.Graph([n1, r1]);
    const result = Rapid.actionDeleteNode('n1')(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.ok(!result.hasEntity('n1'));
    assert.ok(!result.hasEntity('r1'));
  });
});
