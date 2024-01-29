import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';


describe('actionDeleteWay', () => {
  it('removes the way from the graph', () => {
    const w1 = Rapid.osmWay({id: 'w1'});
    const graph = new Rapid.Graph([w1]);
    const result = Rapid.actionDeleteWay('w1')(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.ok(!result.hasEntity('w1'));
  });

  it('removes a way from parent relations', () => {
    const w1 = Rapid.osmWay({id: 'w1'});
    const w2 = Rapid.osmWay({id: 'w2'});
    const r1 = Rapid.osmRelation({id: 'r1', members: [{ id: 'w1' }, { id: 'w2' }]});
    const graph = new Rapid.Graph([w1, w2, r1]);
    const result = Rapid.actionDeleteWay('w1')(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.ok(!result.hasEntity('w1'));
    assert.deepEqual(result.entity('r1').members, [{ id: 'w2' }]);
  });

  it('deletes child nodes not referenced by another parent', () => {
    const n1 = Rapid.osmNode({id: 'n1'});
    const w1 = Rapid.osmWay({id: 'w1', nodes: ['n1']});
    const graph = new Rapid.Graph([n1, w1]);
    const result = Rapid.actionDeleteWay('w1')(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.ok(!result.hasEntity('w1'));
    assert.ok(!result.hasEntity('n1'));
  });

  it('does not delete child nodes referenced by another parent', () => {
    const n1 = Rapid.osmNode({id: 'n1'});
    const w1 = Rapid.osmWay({id: 'w1', nodes: ['n1']});
    const w2 = Rapid.osmWay({id: 'w2', nodes: ['n1']});
    const graph = new Rapid.Graph([n1, w1, w2]);
    const result = Rapid.actionDeleteWay('w1')(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.ok(!result.hasEntity('w1'));
    assert.ok(result.hasEntity('w2'));
    assert.ok(result.hasEntity('n1'));
  });

  it('deletes uninteresting child nodes', () => {
    const n1 = Rapid.osmNode({id: 'n1'});
    const n2 = Rapid.osmNode({id: 'n2'});
    const w1 = Rapid.osmWay({id: 'w1', nodes: ['n1', 'n2']});
    const graph = new Rapid.Graph([n1, n2, w1]);
    const result = Rapid.actionDeleteWay('w1')(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.ok(!result.hasEntity('w1'));
    assert.ok(!result.hasEntity('n1'));
    assert.ok(!result.hasEntity('n2'));
  });

  it('deletes a circular way, including the start/end node', () => {
    const n1 = Rapid.osmNode({id: 'n1'});
    const n2 = Rapid.osmNode({id: 'n2'});
    const n3 = Rapid.osmNode({id: 'n3'});
    const w1 = Rapid.osmWay({id: 'w1', nodes: ['n1', 'n2', 'n3', 'n1']});
    const graph = new Rapid.Graph([n1, n2, n3, w1]);
    const result = Rapid.actionDeleteWay('w1')(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.ok(!result.hasEntity('w1'));
    assert.ok(!result.hasEntity('n1'));
    assert.ok(!result.hasEntity('n2'));
    assert.ok(!result.hasEntity('n3'));
  });

  it('does not delete child nodes with interesting tags', () => {
    const n1 = Rapid.osmNode({id: 'n1', tags: { highway: 'traffic_signals' }});
    const w1 = Rapid.osmWay({id: 'w1', nodes: ['n1']});
    const graph = new Rapid.Graph([n1, w1]);
    const result = Rapid.actionDeleteWay('w1')(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.ok(!result.hasEntity('w1'));
    assert.ok(result.hasEntity('n1'));
  });

  it('deletes parent relations that become empty', () => {
    const w1 = Rapid.osmWay({id: 'w1'});
    const r1 = Rapid.osmRelation({id: 'r1', members: [{ id: 'w1' }]});
    const graph = new Rapid.Graph([w1, r1]);
    const result = Rapid.actionDeleteWay('w1')(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.ok(!result.hasEntity('w1'));
    assert.ok(!result.hasEntity('r1'));
  });

//  // This was moved to operationDelete.  We should test operations and move this test there.
//  describe('#disabled', () => {
//    it('returns \'part_of_relation\' for members of route and boundary relations', () => {
//      const w1 = Rapid.osmWay({id: 'w1'});
//      const w2 = Rapid.osmWay({id: 'w2'});
//      const r1 = Rapid.osmRelation({id: 'r1', members: [{id: 'w1'}], tags: {type: 'route'}});      // route
//      const r2 = Rapid.osmRelation({id: 'r2', members: [{id: 'w2'}], tags: {type: 'boundary'}});   // boundary
//      const graph = new Rapid.Graph([w1, w2, r1, r2]);
//      expect(Rapid.actionDeleteWay('r1').disabled(graph)).to.equal('part_of_relation');
//      expect(Rapid.actionDeleteWay('r2').disabled(graph)).to.equal('part_of_relation');
//    });
//
//    it('returns \'part_of_relation\' for outer members of multipolygons', () => {
//      const w1 = Rapid.osmWay({id: 'w1'});
//      const r1 = Rapid.osmRelation({id: r1, members: [{id: 'w1', role: 'outer'}], tags: {type: 'multipolygon'}});
//      const graph = new Rapid.Graph([w1, r1]);
//      const action = Rapid.actionDeleteWay('w1');
//      expect(action.disabled(graph)).to.equal('part_of_relation');
//    });
//
//    it('returns falsy for inner members of multipolygons', () => {
//      const w1 = Rapid.osmWay({id: 'w1'});
//      const r1 = Rapid.osmRelation({id: 'r1', members: [{id: 'w1', role: 'inner'}], tags: {type: 'multipolygon'}});
//      const graph = new Rapid.Graph([w1, r1]);
//      const action = Rapid.actionDeleteWay('w1');
//      expect(action.disabled(graph)).not.ok;
//    });
//  });
});
