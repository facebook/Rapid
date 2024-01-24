import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';


describe('actionDeleteMultiple', () => {
  it('deletes multiple entities of heterogeneous types', () => {
    const n1 = Rapid.osmNode({id: 'n1'});
    const w1 = Rapid.osmWay({id: 'w1'});
    const r1 = Rapid.osmRelation({id: 'r1'});
    const graph = new Rapid.Graph([n1, w1, r1]);
    const result = Rapid.actionDeleteMultiple(['n1', 'w1', 'r1'])(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.ok(!result.hasEntity('n1'));
    assert.ok(!result.hasEntity('w1'));
    assert.ok(!result.hasEntity('r1'));
  });


  it('deletes a way and one of its nodes', () => {
    const n1 = Rapid.osmNode({id: 'n1'});
    const w1 = Rapid.osmWay({id: 'w1', nodes: ['n1']});
    const graph = new Rapid.Graph([n1, w1]);
    const result = Rapid.actionDeleteMultiple(['w1', 'n1'])(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.ok(!result.hasEntity('w1'));
    assert.ok(!result.hasEntity('n1'));
  });


  // This was moved to operationDelete.  We should test operations and move this test there.
  // describe('#disabled', () => {
  //   it('returns the result of the first action that is disabled', () => {
  //     const n1 = Rapid.osmNode({id: 'n1'});
  //     const r1 = Rapid.osmRelation({id: 'r1', members: [{id: 'w1'}]});  // 'w1' not downloaded
  //     const graph = new Rapid.Graph([n1, r1]);
  //     const action = Rapid.actionDeleteMultiple(['n1', 'r1']);
  //     expect(action.disabled(graph)).to.equal('incomplete_relation');
  //   });
  // });
});
