import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';


describe('actionConnect', () => {

  it('chooses the first non-new node as the survivor', () => {
    const graph = new Rapid.Graph([
      Rapid.osmNode({id: 'a'}),
      Rapid.osmNode({id: 'b', version: '1'}),
      Rapid.osmNode({id: 'c', version: '1'})
    ]);

    const result = Rapid.actionConnect(['a', 'b', 'c'])(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.ok(!result.hasEntity('a'));
    assert.ok(result.hasEntity('b'));
    assert.ok(!result.hasEntity('c'));
  });


  it('chooses the last node as the survivor when all are new', () => {
    const graph = new Rapid.Graph([
      Rapid.osmNode({id: 'a'}),
      Rapid.osmNode({id: 'b'}),
      Rapid.osmNode({id: 'c'})
    ]);

    const result = Rapid.actionConnect(['a', 'b', 'c'])(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.ok(!result.hasEntity('a'));
    assert.ok(!result.hasEntity('b'));
    assert.ok(result.hasEntity('c'));
  });


  it('replaces non-surviving nodes in parent ways', () => {
    // a --- b --- c
    //
    //       e
    //       |
    //       d
    //
    // Connect [e, b].
    //
    // Expected result:
    //
    // a --- b --- c
    //       |
    //       d
    //
    const graph = new Rapid.Graph([
      Rapid.osmNode({id: 'a'}),
      Rapid.osmNode({id: 'b'}),
      Rapid.osmNode({id: 'c'}),
      Rapid.osmNode({id: 'd'}),
      Rapid.osmNode({id: 'e'}),
      Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c']}),
      Rapid.osmWay({id: '|', nodes: ['d', 'e']})
    ]);

    const result = Rapid.actionConnect(['e', 'b'])(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity('-').nodes, ['a', 'b', 'c']);
    assert.deepEqual(result.entity('|').nodes, ['d', 'b']);
  });


  it('handles circular ways', () => {
    // c -- a   d === e
    // |   /
    // |  /
    // | /
    // b
    //
    // Connect [a, d].
    //
    const graph = new Rapid.Graph([
      Rapid.osmNode({id: 'a'}),
      Rapid.osmNode({id: 'b'}),
      Rapid.osmNode({id: 'c'}),
      Rapid.osmNode({id: 'd'}),
      Rapid.osmNode({id: 'e'}),
      Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'a']}),
      Rapid.osmWay({id: '=', nodes: ['d', 'e']})
    ]);

    const result = Rapid.actionConnect(['a', 'd'])(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity('-').nodes, ['d', 'b', 'c', 'd']);
  });


  it('merges adjacent nodes', () => {
    // a --- b --- c
    //
    // Connect [b, c]
    //
    // Expected result:
    //
    // a --- c
    //
    const graph = new Rapid.Graph([
      Rapid.osmNode({id: 'a'}),
      Rapid.osmNode({id: 'b'}),
      Rapid.osmNode({id: 'c'}),
      Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c']})
    ]);

    const result = Rapid.actionConnect(['b', 'c'])(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity('-').nodes, ['a', 'c']);
    assert.ok(!result.hasEntity('b'));
  });


  it('merges adjacent nodes with connections', () => {
    // a --- b --- c
    //       |
    //       d
    //
    // Connect [b, c]
    //
    // Expected result:
    //
    // a --- c
    //       |
    //       d
    //
    const graph = new Rapid.Graph([
      Rapid.osmNode({id: 'a'}),
      Rapid.osmNode({id: 'b'}),
      Rapid.osmNode({id: 'c'}),
      Rapid.osmNode({id: 'd'}),
      Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c']}),
      Rapid.osmWay({id: '|', nodes: ['b', 'd']})
    ]);

    const result = Rapid.actionConnect(['b', 'c'])(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity('-').nodes, ['a', 'c']);
    assert.deepEqual(result.entity('|').nodes, ['c', 'd']);
    assert.ok(!result.hasEntity('b'));
  });


  it('deletes a degenerate way', () => {
    // a --- b
    //
    // Connect [a, b]
    //
    const graph = new Rapid.Graph([
      Rapid.osmNode({id: 'a'}),
      Rapid.osmNode({id: 'b'}),
      Rapid.osmWay({id: '-', nodes: ['a', 'b']})
    ]);

    const result = Rapid.actionConnect(['a', 'b'])(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.ok(!result.hasEntity('-'));
    assert.ok(!result.hasEntity('a'));
    assert.ok(!result.hasEntity('b'));
  });


  it('merges tags to the surviving node', () => {
    const graph = new Rapid.Graph([
      Rapid.osmNode({id: 'a', tags: {a: 'a'}}),
      Rapid.osmNode({id: 'b', tags: {b: 'b'}}),
      Rapid.osmNode({id: 'c', tags: {c: 'c'}})
    ]);

    const result = Rapid.actionConnect(['a', 'b', 'c'])(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity('c').tags, { a: 'a', b: 'b', c: 'c' });
  });


  it('merges memberships to the surviving node', () => {
    const graph = new Rapid.Graph([
      Rapid.osmNode({id: 'a'}),
      Rapid.osmNode({id: 'b'}),
      Rapid.osmNode({id: 'c'}),
      Rapid.osmNode({id: 'c'}),
      Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
      Rapid.osmWay({id: '=', nodes: ['c', 'd']}),
      Rapid.osmRelation({id: 'r1', members: [{id: 'b', role: 'r1', type: 'node'}]}),
      Rapid.osmRelation({id: 'r2', members: [{id: 'b', role: 'r2', type: 'node'}, {id: 'c', role: 'r2', type: 'node'}]})
    ]);

    const result = Rapid.actionConnect(['b', 'c'])(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity('r1').members, [{ id: 'c', role: 'r1', type: 'node' }]);
    assert.deepEqual(result.entity('r2').members, [{ id: 'c', role: 'r2', type: 'node' }]);
  });


  describe('#disabled', () => {
    it('returns falsy when connecting members of the same relation and same roles', () => {
      const graph = new Rapid.Graph([
        Rapid.osmNode({id: 'a'}),
        Rapid.osmNode({id: 'b'}),
        Rapid.osmNode({id: 'c'}),
        Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c']}),
        Rapid.osmRelation({id: 'r1', members: [
          { id: 'b', type: 'node', role: 'foo' },
          { id: 'c', type: 'node', role: 'foo' }
        ]})
      ]);

      const disabled = Rapid.actionConnect(['b', 'c']).disabled(graph);
      assert.ok(!disabled);
    });


    it('returns falsy when connecting members of different relation and different roles', () => {
      const graph = new Rapid.Graph([
        Rapid.osmNode({id: 'a'}),
        Rapid.osmNode({id: 'b'}),
        Rapid.osmNode({id: 'c'}),
        Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c']}),
        Rapid.osmRelation({id: 'r1', members: [{ id: 'b', type: 'node', role: 'foo' } ]}),
        Rapid.osmRelation({id: 'r2', members: [{ id: 'c', type: 'node', role: 'bar' } ]})
      ]);

      const disabled = Rapid.actionConnect(['b', 'c']).disabled(graph);
      assert.ok(!disabled);
    });


    it('returns \'relation\' when connecting members of the same relation but different roles', () => {
      const graph = new Rapid.Graph([
        Rapid.osmNode({id: 'a'}),
        Rapid.osmNode({id: 'b'}),
        Rapid.osmNode({id: 'c'}),
        Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c']}),
        Rapid.osmRelation({id: 'r1', members: [
          { id: 'b', type: 'node', role: 'foo' },
          { id: 'c', type: 'node', role: 'bar' }
        ]})
      ]);

      const disabled = Rapid.actionConnect(['b', 'c']).disabled(graph);
      assert.equal(disabled, 'relation');
    });


    it('returns falsy when connecting a node unrelated to the restriction', () => {
      //
      //  a --- b   d ~~~ e        r1:  `no_right_turn`
      //        |                        FROM '-'
      //        |                        VIA  'b'
      //        c                        TO   '|'
      //
      const graph = new Rapid.Graph([
          Rapid.osmNode({id: 'a'}),
          Rapid.osmNode({id: 'b'}),
          Rapid.osmNode({id: 'c'}),
          Rapid.osmNode({id: 'd'}),
          Rapid.osmNode({id: 'e'}),
          Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
          Rapid.osmWay({id: '|', nodes: ['b', 'c']}),
          Rapid.osmWay({id: '~', nodes: ['d', 'e']}),
          Rapid.osmRelation({id: 'r1', tags: { type: 'restriction', restriction: 'no_right_turn' }, members: [
              { id: '-', type: 'way', role: 'from' },
              { id: 'b', type: 'node', role: 'via' },
              { id: '|', type: 'way', role: 'to' }
          ]})
      ]);

      const disabledAD = Rapid.actionConnect(['a', 'd']).disabled(graph);
      assert.ok(!disabledAD);
      const disabledBD = Rapid.actionConnect(['b', 'd']).disabled(graph);
      assert.ok(!disabledBD);
      const disabledCD = Rapid.actionConnect(['c', 'd']).disabled(graph);
      assert.ok(!disabledCD);
    });

    it('returns falsy when connecting nodes that would not break a via-node restriction', () => {
      //
      //  a --- b --- c      r1:  `no_right_turn`
      //              |            FROM '-'
      //              d            VIA  'c'
      //              |            TO   '|'
      //              e
      //
      const graph = new Rapid.Graph([
        Rapid.osmNode({id: 'a'}),
        Rapid.osmNode({id: 'b'}),
        Rapid.osmNode({id: 'c'}),
        Rapid.osmNode({id: 'd'}),
        Rapid.osmNode({id: 'e'}),
        Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c']}),
        Rapid.osmWay({id: '|', nodes: ['c', 'd', 'e']}),
        Rapid.osmRelation({id: 'r1', tags: { type: 'restriction', restriction: 'no_right_turn' }, members: [
          { id: '-', type: 'way', role: 'from' },
          { id: 'c', type: 'node', role: 'via' },
          { id: '|', type: 'way', role: 'to' }
        ]})
      ]);

      // allowed: adjacent connections that don't destroy a way
      const disabledAB = Rapid.actionConnect(['a', 'b']).disabled(graph);
      assert.ok(!disabledAB);
      const disabledBC = Rapid.actionConnect(['b', 'c']).disabled(graph);
      assert.ok(!disabledBC);
      const disabledCD = Rapid.actionConnect(['c', 'd']).disabled(graph);
      assert.ok(!disabledCD);
      const disabledDE = Rapid.actionConnect(['d', 'e']).disabled(graph);
      assert.ok(!disabledDE);
    });


    it('returns falsy when connecting nodes that would not break a via-way restriction', () => {
      //
      //  a --- b --- c      r1:  `no_u_turn`
      //              |            FROM '='
      //              d            VIA  '|'
      //              |            TO   '-'
      //  g === f === e
      //
      const graph = new Rapid.Graph([
        Rapid.osmNode({id: 'a'}),
        Rapid.osmNode({id: 'b'}),
        Rapid.osmNode({id: 'c'}),
        Rapid.osmNode({id: 'd'}),
        Rapid.osmNode({id: 'e'}),
        Rapid.osmNode({id: 'f'}),
        Rapid.osmNode({id: 'g'}),
        Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c']}),
        Rapid.osmWay({id: '|', nodes: ['c', 'd', 'e']}),
        Rapid.osmWay({id: '=', nodes: ['e', 'f', 'g']}),
        Rapid.osmRelation({id: 'r1', tags: { type: 'restriction', restriction: 'no_u_turn' }, members: [
          { id: '=', type: 'way', role: 'from' },
          { id: '|', type: 'way', role: 'via' },
          { id: '-', type: 'way', role: 'to' }
        ]})
      ]);

      // allowed: adjacent connections that don't destroy a way
      const disabledAB = Rapid.actionConnect(['a', 'b']).disabled(graph);
      assert.ok(!disabledAB);
      const disabledBC = Rapid.actionConnect(['b', 'c']).disabled(graph);
      assert.ok(!disabledBC);
      const disabledCD = Rapid.actionConnect(['c', 'd']).disabled(graph);
      assert.ok(!disabledCD);
      const disabledDE = Rapid.actionConnect(['d', 'e']).disabled(graph);
      assert.ok(!disabledDE);
      const disabledEF = Rapid.actionConnect(['e', 'f']).disabled(graph);
      assert.ok(!disabledEF);
      const disabledFG = Rapid.actionConnect(['f', 'g']).disabled(graph);
      assert.ok(!disabledFG);
    });


    it('returns \'restriction\' when connecting nodes that would break a via-node restriction', () => {
      //
      //  a --- b --- c      r1:  `no_right_turn`
      //              |            FROM '-'
      //              d            VIA  'c'
      //              |            TO   '|'
      //              e
      //
      const graph = new Rapid.Graph([
        Rapid.osmNode({id: 'a'}),
        Rapid.osmNode({id: 'b'}),
        Rapid.osmNode({id: 'c'}),
        Rapid.osmNode({id: 'd'}),
        Rapid.osmNode({id: 'e'}),
        Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c']}),
        Rapid.osmWay({id: '|', nodes: ['c', 'd', 'e']}),
        Rapid.osmRelation({id: 'r1', tags: { type: 'restriction', restriction: 'no_right_turn' }, members: [
          { id: '-', type: 'way', role: 'from' },
          { id: 'c', type: 'node', role: 'via' },
          { id: '|', type: 'way', role: 'to' }
        ]})
      ]);

      // prevented:
      // extra connections to the VIA node, or any connections between distinct FROM and TO
      const disabledAC = Rapid.actionConnect(['a', 'c']).disabled(graph);
      assert.equal(disabledAC, 'restriction', 'extra connection FROM-VIA');
      const disabledEC = Rapid.actionConnect(['e', 'c']).disabled(graph);
      assert.equal(disabledEC, 'restriction', 'extra connection TO-VIA');
      const disabledBD = Rapid.actionConnect(['b', 'd']).disabled(graph);
      assert.equal(disabledBD, 'restriction', 'extra connection FROM-TO');
    });


    it('returns falsy when connecting nodes on a via-node u_turn restriction', () => {
      //
      //  a --- b --- c      r1:  `no_u_turn`
      //              |            FROM '-'
      //              d            VIA  'c'
      //              |            TO   '-'
      //              e
      //
      const graph = new Rapid.Graph([
        Rapid.osmNode({id: 'a'}),
        Rapid.osmNode({id: 'b'}),
        Rapid.osmNode({id: 'c'}),
        Rapid.osmNode({id: 'd'}),
        Rapid.osmNode({id: 'e'}),
        Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c']}),
        Rapid.osmWay({id: '|', nodes: ['c', 'd', 'e']}),
        Rapid.osmRelation({id: 'r1', tags: { type: 'restriction', restriction: 'no_u_turn' }, members: [
          { id: '-', type: 'way', role: 'from' },
          { id: 'c', type: 'node', role: 'via' },
          { id: '-', type: 'way', role: 'to' }
        ]})
      ]);

      // The u-turn case is one where a connection between FROM-TO should be allowed
      const disabledAB = Rapid.actionConnect(['a', 'b']).disabled(graph);
      assert.ok(!disabledAB);
      const disabledBC = Rapid.actionConnect(['b', 'c']).disabled(graph);
      assert.ok(!disabledBC);
    });


    it('returns \'restriction\' when connecting nodes that would break a via-way restriction', () => {
      //
      //  a --- b --- c      r1:  `no_u_turn`
      //              |            FROM '='
      //              d            VIA  '|'
      //              |            TO   '-'
      //  g === f === e
      //
      const graph = new Rapid.Graph([
        Rapid.osmNode({id: 'a'}),
        Rapid.osmNode({id: 'b'}),
        Rapid.osmNode({id: 'c'}),
        Rapid.osmNode({id: 'd'}),
        Rapid.osmNode({id: 'e'}),
        Rapid.osmNode({id: 'f'}),
        Rapid.osmNode({id: 'g'}),
        Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c']}),
        Rapid.osmWay({id: '|', nodes: ['c', 'd', 'e']}),
        Rapid.osmWay({id: '=', nodes: ['e', 'f', 'g']}),
        Rapid.osmRelation({id: 'r1', tags: { type: 'restriction', restriction: 'no_u_turn' }, members: [
          { id: '=', type: 'way', role: 'from' },
          { id: '|', type: 'way', role: 'via' },
          { id: '-', type: 'way', role: 'to' }
        ]})
      ]);

      // prevented:
      // extra connections to any node along VIA way
      const disabledAC = Rapid.actionConnect(['a', 'c']).disabled(graph);
      assert.equal(disabledAC, 'restriction', 'extra connection TO-VIA c');
      const disabledBD = Rapid.actionConnect(['b', 'd']).disabled(graph);
      assert.equal(disabledBD, 'restriction', 'extra connection TO-VIA d');
      const disabledBE = Rapid.actionConnect(['b', 'e']).disabled(graph);
      assert.equal(disabledBE, 'restriction', 'extra connection TO-VIA e');

      const disabledCE = Rapid.actionConnect(['c', 'e']).disabled(graph);
      assert.equal(disabledCE, 'restriction', 'extra connection VIA-VIA');

      const disabledFC = Rapid.actionConnect(['f', 'c']).disabled(graph);
      assert.equal(disabledFC, 'restriction', 'extra connection FROM-VIA c');
      const disabledFD = Rapid.actionConnect(['f', 'd']).disabled(graph);
      assert.equal(disabledFD, 'restriction', 'extra connection FROM-VIA d');
      const disabledGE = Rapid.actionConnect(['g', 'e']).disabled(graph);
      assert.equal(disabledGE, 'restriction', 'extra connection FROM-VIA e');
    });


    it('returns \'restriction\' when connecting would destroy a way in a via-node restriction', () => {
      //
      //  a --- b      r1:  `no_right_turn`
      //        |            FROM '-'
      //        |            VIA  'b'
      //        c            TO   '|'
      //
      const graph = new Rapid.Graph([
        Rapid.osmNode({id: 'a'}),
        Rapid.osmNode({id: 'b'}),
        Rapid.osmNode({id: 'c'}),
        Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
        Rapid.osmWay({id: '|', nodes: ['b', 'c']}),
        Rapid.osmRelation({id: 'r1', tags: { type: 'restriction', restriction: 'no_right_turn' }, members: [
          { id: '-', type: 'way', role: 'from' },
          { id: 'b', type: 'node', role: 'via' },
          { id: '|', type: 'way', role: 'to' }
        ]})
      ]);

      const disabledAB = Rapid.actionConnect(['a', 'b']).disabled(graph);
      assert.equal(disabledAB, 'restriction', 'destroy FROM');
      const disabledBC = Rapid.actionConnect(['b', 'c']).disabled(graph);
      assert.equal(disabledBC, 'restriction', 'destroy TO');
    });


    it('returns \'restriction\' when connecting would destroy a way in via-way restriction', () => {
      //
      //  a --- b      r1:  `no_u_turn`
      //        |            FROM '='
      //        |            VIA  '|'
      //  d === c            TO   '-'
      //
      const graph = new Rapid.Graph([
        Rapid.osmNode({id: 'a'}),
        Rapid.osmNode({id: 'b'}),
        Rapid.osmNode({id: 'c'}),
        Rapid.osmNode({id: 'd'}),
        Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
        Rapid.osmWay({id: '|', nodes: ['b', 'c']}),
        Rapid.osmWay({id: '=', nodes: ['c', 'd']}),
        Rapid.osmRelation({id: 'r1', tags: { type: 'restriction', restriction: 'no_u_turn' }, members: [
          { id: '=', type: 'way', role: 'from' },
          { id: '|', type: 'way', role: 'via' },
          { id: '-', type: 'way', role: 'to' }
        ]})
      ]);

      const disabledAB = Rapid.actionConnect(['a', 'b']).disabled(graph);
      assert.equal(disabledAB, 'restriction', 'destroy TO');
      const disabledBC = Rapid.actionConnect(['b', 'c']).disabled(graph);
      assert.equal(disabledBC, 'restriction', 'destroy VIA');
      const disabledCD = Rapid.actionConnect(['c', 'd']).disabled(graph);
      assert.equal(disabledCD, 'restriction', 'destroy FROM');
    });

  });
});
