import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';


describe('actionDeleteRelation', () => {
  it('removes the relation from the graph', () => {
    const r1 = Rapid.osmRelation({id: 'r1'});
    const graph = new Rapid.Graph([r1]);
    const result = Rapid.actionDeleteRelation('r1')(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.ok(!result.hasEntity('r1'));
  });

  it('removes the relation from parent relations', () => {
    const r1 = Rapid.osmRelation({id: 'r1'});
    const r2 = Rapid.osmRelation({id: 'r2'});
    const r3 = Rapid.osmRelation({id: 'r3', members: [{ id: 'r1' }, { id: 'r2' }]});
    const graph = new Rapid.Graph([r1, r2, r3]);
    const result = Rapid.actionDeleteRelation('r1')(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.ok(!result.hasEntity('r1'));
    assert.ok(result.hasEntity('r2'));
    assert.ok(result.hasEntity('r3'));
    assert.deepEqual(result.entity('r3').members, [{ id: 'r2' }]);
  });

  it('deletes member nodes not referenced by another parent', () => {
    const n1 = Rapid.osmNode({id: 'n1'});
    const r1 = Rapid.osmRelation({ id: 'r1', members: [{ id: 'n1' }] });
    const graph = new Rapid.Graph([n1, r1]);
    const result = Rapid.actionDeleteRelation('r1')(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.ok(!result.hasEntity('r1'));
    assert.ok(!result.hasEntity('n1'));
  });

  it('does not delete member nodes referenced by another parent', () => {
    const n1 = Rapid.osmNode({id: 'n1'});
    const w1 = Rapid.osmWay({id: 'w1', nodes: ['n1']});
    const r1 = Rapid.osmRelation({id: 'r1', members: [{id: 'n1'}]});
    const graph = new Rapid.Graph([n1, w1, r1]);
    const result = Rapid.actionDeleteRelation('r1')(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.ok(!result.hasEntity('r1'));
    assert.ok(result.hasEntity('w1'));
    assert.ok(result.hasEntity('n1'));
  });

  it('does not delete member nodes with interesting tags', () => {
    const n1 = Rapid.osmNode({id: 'n1', tags: { highway: 'traffic_signals' }});
    const r1 = Rapid.osmRelation({id: 'r1', members: [{ id: 'n1' }]});
    const graph = new Rapid.Graph([n1, r1]);
    const result = Rapid.actionDeleteRelation('r1')(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.ok(!result.hasEntity('r1'));
    assert.ok(result.hasEntity('n1'));
  });

  it('deletes member ways not referenced by another parent', () => {
    const w1 = Rapid.osmWay({id: 'w1'});
    const r1 = Rapid.osmRelation({id: 'r1', members: [{id: 'w1'}]});
    const graph = new Rapid.Graph([w1, r1]);
    const result = Rapid.actionDeleteRelation('r1')(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.ok(!result.hasEntity('r1'));
    assert.ok(!result.hasEntity('w1'));
  });

  it('does not delete member ways referenced by another parent', () => {
    const w1 = Rapid.osmWay({id: 'w1'});
    const r1 = Rapid.osmRelation({id: 'r1', members: [{ id: 'w1' }]});
    const r2 = Rapid.osmRelation({id: 'r2', members: [{ id: 'w1' }]});
    const graph = new Rapid.Graph([w1, r1, r2]);
    const result = Rapid.actionDeleteRelation('r1')(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.ok(!result.hasEntity('r1'));
    assert.ok(result.hasEntity('r2'));
    assert.ok(result.hasEntity('w1'));
  });

  it('does not delete member ways with interesting tags', () => {
    const w1 = Rapid.osmWay({id: 'w1', tags: { highway: 'residential' }});
    const r1 = Rapid.osmRelation({id: 'r1', members: [{ id: 'w1' }]});
    const graph = new Rapid.Graph([w1, r1]);
    const result = Rapid.actionDeleteRelation('r1')(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.ok(!result.hasEntity('r1'));
    assert.ok(result.hasEntity('w1'));
  });

  it('deletes nodes of deleted member ways', () => {
    const n1 = Rapid.osmNode({id: 'n1'});
    const w1 = Rapid.osmWay({id: 'w1', nodes: ['n1']});
    const r1 = Rapid.osmRelation({id: 'r1', members: [{id: 'w1'}]});
    const graph = new Rapid.Graph([n1, w1, r1]);
    const result = Rapid.actionDeleteRelation('r1')(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.ok(!result.hasEntity('r1'));
    assert.ok(!result.hasEntity('w1'));
    assert.ok(!result.hasEntity('n1'));
  });

  it('deletes parent relations that become empty', () => {
    const r1 = Rapid.osmRelation({id: 'r1'});                            // child
    const r2 = Rapid.osmRelation({id: 'r2', members: [{ id: 'r1' }]});   // parent
    const graph = new Rapid.Graph([r1, r2]);
    const result = Rapid.actionDeleteRelation('r1')(graph);  // delete child
    assert.ok(result instanceof Rapid.Graph);
    assert.ok(!result.hasEntity('r1'));
    assert.ok(!result.hasEntity('r2'));
  });

  // This was moved to operationDelete.  We should test operations and move this test there.
  // describe('#disabled', () => {
  //   it('returns \'incomplete_relation\' if the relation is incomplete', () => {
  //     const r1 = Rapid.osmRelation({id: 'r1', members: [{ id: 'w1' }]});  // 'w1' not downloaded
  //     const graph = new Rapid.Graph([r1]);
  //     const action = Rapid.actionDeleteRelation('r1');
  //     expect(action.disabled(graph)).to.equal('incomplete_relation');
  //   });
  // });
});
