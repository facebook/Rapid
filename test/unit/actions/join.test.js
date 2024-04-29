import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';


describe('actionJoin', () => {
  describe('#disabled', () => {
    it('returns falsy for ways that share an end/start node', () => {
      // a --> b ==> c
      const graph = new Rapid.Graph([
        Rapid.osmNode({id: 'a', loc: [0,0]}),
        Rapid.osmNode({id: 'b', loc: [2,0]}),
        Rapid.osmNode({id: 'c', loc: [4,0]}),
        Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
        Rapid.osmWay({id: '=', nodes: ['b', 'c']})
      ]);

      const disabled = Rapid.actionJoin(['-', '=']).disabled(graph);
      assert.ok(!disabled);
    });

    it('returns falsy for ways that share a start/end node', () => {
      // a <-- b <== c
      const graph = new Rapid.Graph([
        Rapid.osmNode({id: 'a', loc: [0,0]}),
        Rapid.osmNode({id: 'b', loc: [2,0]}),
        Rapid.osmNode({id: 'c', loc: [4,0]}),
        Rapid.osmWay({id: '-', nodes: ['b', 'a']}),
        Rapid.osmWay({id: '=', nodes: ['c', 'b']})
      ]);

      const disabled = Rapid.actionJoin(['-', '=']).disabled(graph);
      assert.ok(!disabled);
    });

    it('returns falsy for ways that share a start/start node', () => {
      // a <-- b ==> c
      const graph = new Rapid.Graph([
        Rapid.osmNode({id: 'a', loc: [0,0]}),
        Rapid.osmNode({id: 'b', loc: [2,0]}),
        Rapid.osmNode({id: 'c', loc: [4,0]}),
        Rapid.osmWay({id: '-', nodes: ['b', 'a']}),
        Rapid.osmWay({id: '=', nodes: ['b', 'c']})
      ]);

      const disabled = Rapid.actionJoin(['-', '=']).disabled(graph);
      assert.ok(!disabled);
    });

    it('returns falsy for ways that share an end/end node', () => {
      // a --> b <== c
      const graph = new Rapid.Graph([
        Rapid.osmNode({id: 'a', loc: [0,0]}),
        Rapid.osmNode({id: 'b', loc: [2,0]}),
        Rapid.osmNode({id: 'c', loc: [4,0]}),
        Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
        Rapid.osmWay({id: '=', nodes: ['c', 'b']})
      ]);

      const disabled = Rapid.actionJoin(['-', '=']).disabled(graph);
      assert.ok(!disabled);
    });

    it('returns falsy for more than two ways when connected, regardless of order', () => {
      // a --> b ==> c ~~> d
      const graph = new Rapid.Graph([
        Rapid.osmNode({id: 'a', loc: [0,0]}),
        Rapid.osmNode({id: 'b', loc: [2,0]}),
        Rapid.osmNode({id: 'c', loc: [4,0]}),
        Rapid.osmNode({id: 'd', loc: [6,0]}),
        Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
        Rapid.osmWay({id: '=', nodes: ['b', 'c']}),
        Rapid.osmWay({id: '~', nodes: ['c', 'd']})
      ]);

      assert.ok(!Rapid.actionJoin(['-', '=', '~']).disabled(graph));
      assert.ok(!Rapid.actionJoin(['-', '~', '=']).disabled(graph));
      assert.ok(!Rapid.actionJoin(['=', '-', '~']).disabled(graph));
      assert.ok(!Rapid.actionJoin(['=', '~', '-']).disabled(graph));
      assert.ok(!Rapid.actionJoin(['~', '=', '-']).disabled(graph));
      assert.ok(!Rapid.actionJoin(['~', '-', '=']).disabled(graph));
    });

    it('returns \'not_eligible\' for non-line geometries', () => {
      const graph = new Rapid.Graph([
        Rapid.osmNode({id: 'a', loc: [0,0]})
      ]);

      const disabled = Rapid.actionJoin(['a']).disabled(graph);
      assert.equal(disabled, 'not_eligible');
    });

    it('returns \'not_adjacent\' for ways that don\'t share the necessary nodes', () => {
      // a -- b -- c
      //      |
      //      d
      const graph = new Rapid.Graph([
        Rapid.osmNode({id: 'a', loc: [0,0]}),
        Rapid.osmNode({id: 'b', loc: [2,0]}),
        Rapid.osmNode({id: 'c', loc: [4,0]}),
        Rapid.osmNode({id: 'd', loc: [2,2]}),
        Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c']}),
        Rapid.osmWay({id: '=', nodes: ['b', 'd']})
      ]);

      const disabled = Rapid.actionJoin(['-', '=']).disabled(graph);
      assert.equal(disabled, 'not_adjacent');
    });

    for (const type of ['restriction', 'connectivity']) {
      it(`returns ${type} in situations where a ${type} relation would be damaged (a)`, () => {
        // a --> b ==> c
        // from: -
        // to: =
        // via: b
        const graph = new Rapid.Graph([
          Rapid.osmNode({id: 'a', loc: [0,0]}),
          Rapid.osmNode({id: 'b', loc: [2,0]}),
          Rapid.osmNode({id: 'c', loc: [4,0]}),
          Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
          Rapid.osmWay({id: '=', nodes: ['b', 'c']}),
          Rapid.osmRelation({id: 'r', tags: {'type': type}, members: [
            {type: 'way', id: '-', role: 'from'},
            {type: 'way', id: '=', role: 'to'},
            {type: 'node', id: 'b', role: 'via'}
          ]})
        ]);

        const disabled = Rapid.actionJoin(['-', '=']).disabled(graph);
        assert.equal(disabled, type);
      });

      it(`returns ${type} in situations where a ${type} relation would be damaged (b)`, () => {
        // a --> b ==> c
        //       |
        //       d
        // from: -
        // to: |
        // via: b
        const graph = new Rapid.Graph([
          Rapid.osmNode({id: 'a', loc: [0,0]}),
          Rapid.osmNode({id: 'b', loc: [2,0]}),
          Rapid.osmNode({id: 'c', loc: [4,0]}),
          Rapid.osmNode({id: 'd', loc: [2,2]}),
          Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
          Rapid.osmWay({id: '=', nodes: ['b', 'c']}),
          Rapid.osmWay({id: '|', nodes: ['b', 'd']}),
          Rapid.osmRelation({id: 'r', tags: {'type': type}, members: [
            {type: 'way', id: '-', role: 'from'},
            {type: 'way', id: '|', role: 'to'},
            {type: 'node', id: 'b', role: 'via'}
          ]})
        ]);

        const disabled = Rapid.actionJoin(['-', '=']).disabled(graph);
        assert.equal(disabled, type);
      });

      it(`returns falsy in situations where a ${type} relation would not be damaged (a)`, () => {
        // a --> b ==> c
        // |
        // d
        // from: -
        // to: |
        // via: a
        const graph = new Rapid.Graph([
          Rapid.osmNode({id: 'a', loc: [0,0]}),
          Rapid.osmNode({id: 'b', loc: [2,0]}),
          Rapid.osmNode({id: 'c', loc: [4,0]}),
          Rapid.osmNode({id: 'd', loc: [0,2]}),
          Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
          Rapid.osmWay({id: '=', nodes: ['b', 'c']}),
          Rapid.osmWay({id: '|', nodes: ['a', 'd']}),
          Rapid.osmRelation({id: 'r', tags: {'type': type}, members: [
            {type: 'way', id: '-', role: 'from'},
            {type: 'way', id: '|', role: 'to'},
            {type: 'node', id: 'a', role: 'via'}
          ]})
        ]);

        const disabled = Rapid.actionJoin(['-', '=']).disabled(graph);
        assert.ok(!disabled);
      });

      it(`returns falsy in situations where a ${type} relation would not be damaged (b)`, () => {
        //       d
        //       |
        // a --> b ==> c
        //        \
        //         e
        // from: |
        // to: \
        // via: b
        const graph = new Rapid.Graph([
          Rapid.osmNode({id: 'a', loc: [0,0]}),
          Rapid.osmNode({id: 'b', loc: [2,0]}),
          Rapid.osmNode({id: 'c', loc: [4,0]}),
          Rapid.osmNode({id: 'd', loc: [2,-2]}),
          Rapid.osmNode({id: 'e', loc: [3,2]}),
          Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
          Rapid.osmWay({id: '=', nodes: ['b', 'c']}),
          Rapid.osmWay({id: '|', nodes: ['d', 'b']}),
          Rapid.osmWay({id: '\\', nodes: ['b', 'e']}),
          Rapid.osmRelation({id: 'r', tags: {'type': type}, members: [
            {type: 'way', id: '|', role: 'from'},
            {type: 'way', id: '\\', role: 'to'},
            {type: 'node', id: 'b', role: 'via'}
          ]})
        ]);

        const disabled = Rapid.actionJoin(['-', '=']).disabled(graph);
        assert.ok(!disabled);
      });
    }

    it('returns \'conflicting_relations\' when a relation would be extended', () => {
      // a --> b ==> c
      // members: -
      // not member: =
      const graph = new Rapid.Graph([
        Rapid.osmNode({id: 'a', loc: [0,0]}),
        Rapid.osmNode({id: 'b', loc: [2,0]}),
        Rapid.osmNode({id: 'c', loc: [4,0]}),
        Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
        Rapid.osmWay({id: '=', nodes: ['b', 'c']}),
        Rapid.osmRelation({id: 'r', tags: {}, members: [
          {type: 'way', id: '-'},
        ]})
      ]);

      const disabled = Rapid.actionJoin(['-', '=']).disabled(graph);
      assert.equal(disabled, 'conflicting_relations');
    });

    it('returns \'conflicting_relations\' when a relation would be forked', () => {
      // a --> b ==> c
      //       |
      //       d
      // members: -, =
      // not member: |
      const graph = new Rapid.Graph([
        Rapid.osmNode({id: 'a', loc: [0,0]}),
        Rapid.osmNode({id: 'b', loc: [2,0]}),
        Rapid.osmNode({id: 'c', loc: [4,0]}),
        Rapid.osmNode({id: 'd', loc: [2,2]}),
        Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
        Rapid.osmWay({id: '=', nodes: ['b', 'c']}),
        Rapid.osmWay({id: '|', nodes: ['b', 'd']}),
        Rapid.osmRelation({id: 'r', tags: {}, members: [
          {type: 'way', id: '-'},
          {type: 'way', id: '='},
        ]})
      ]);

      const disabled = Rapid.actionJoin(['-', '|']).disabled(graph);
      assert.equal(disabled, 'conflicting_relations');
    });

    it('returns falsy if they belong to same order-independent relations (same ordering)', () => {
      // a --> b ==> c
      // both '-' and '=' are members of r1, r2
      // r1, r2 are not restriction or connectivity relations
      let graph = new Rapid.Graph([
        Rapid.osmNode({id: 'a', loc: [0,0]}),
        Rapid.osmNode({id: 'b', loc: [2,0]}),
        Rapid.osmNode({id: 'c', loc: [4,0]}),
        Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
        Rapid.osmWay({id: '=', nodes: ['b', 'c']}),
        Rapid.osmRelation({id: 'r1', tags: {}, members: []}),
        Rapid.osmRelation({id: 'r2', tags: {}, members: []})
      ]);

      // Add members '-', and '=' in same order
      let r1 = graph.entity('r1');
      let r2 = graph.entity('r2');

      r1 = r1.addMember({type: 'way', id: '-'});
      r2 = r2.addMember({type: 'way', id: '-'});
      graph = graph.replace(r1).replace(r2);

      r1 = r1.addMember({type: 'way', id: '='});
      r2 = r2.addMember({type: 'way', id: '='});
      graph = graph.replace(r1).replace(r2);

      const disabled = Rapid.actionJoin(['-', '=']).disabled(graph);
      assert.ok(!disabled);
    });

    it('returns falsy if they belong to same order-independent relations (different ordering)', () => {
      // a --> b ==> c
      // both '-' and '=' are members of r1, r2
      // r1, r2 are not restriction or connectivity relations
      let graph = new Rapid.Graph([
        Rapid.osmNode({id: 'a', loc: [0,0]}),
        Rapid.osmNode({id: 'b', loc: [2,0]}),
        Rapid.osmNode({id: 'c', loc: [4,0]}),
        Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
        Rapid.osmWay({id: '=', nodes: ['b', 'c']}),
        Rapid.osmRelation({id: 'r1', tags: {}, members: []}),
        Rapid.osmRelation({id: 'r2', tags: {}, members: []})
      ]);

      // Add members '-', and '=' in opposite order
      // Do it this way to get `graph.parentRelations` to return out-of-order results?
      let r1 = graph.entity('r1');
      let r2 = graph.entity('r2');

      r1 = r1.addMember({type: 'way', id: '-'});
      r2 = r2.addMember({type: 'way', id: '='});
      graph = graph.replace(r1).replace(r2);

      r1 = r1.addMember({type: 'way', id: '='});
      r2 = r2.addMember({type: 'way', id: '-'});
      graph = graph.replace(r1).replace(r2);

      const disabled = Rapid.actionJoin(['-', '=']).disabled(graph);
      assert.ok(!disabled);
    });

    it('returns \'paths_intersect\' if resulting way intersects itself', () => {
      //   d
      //   |
      // a --- b
      //   |  /
      //   | /
      //   c
      const graph = new Rapid.Graph([
        Rapid.osmNode({id: 'a', loc: [0,0]}),
        Rapid.osmNode({id: 'b', loc: [0,10]}),
        Rapid.osmNode({id: 'c', loc: [5,5]}),
        Rapid.osmNode({id: 'd', loc: [-5,5]}),
        Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c']}),
        Rapid.osmWay({id: '=', nodes: ['c', 'd']}),
      ]);

      const disabled = Rapid.actionJoin(['-', '=']).disabled(graph);
      assert.equal(disabled, 'paths_intersect');
    });

    it('returns \'conflicting_tags\' for two entities that have conflicting tags', () => {
      const graph = new Rapid.Graph([
        Rapid.osmNode({id: 'a', loc: [0,0]}),
        Rapid.osmNode({id: 'b', loc: [2,0]}),
        Rapid.osmNode({id: 'c', loc: [4,0]}),
        Rapid.osmWay({id: '-', nodes: ['a', 'b'], tags: {highway: 'primary'}}),
        Rapid.osmWay({id: '=', nodes: ['b', 'c'], tags: {highway: 'secondary'}})
      ]);

      const disabled = Rapid.actionJoin(['-', '=']).disabled(graph);
      assert.equal(disabled, 'conflicting_tags');
    });

    it('takes tag reversals into account when calculating conflicts', () => {
      const graph = new Rapid.Graph([
        Rapid.osmNode({id: 'a', loc: [0,0]}),
        Rapid.osmNode({id: 'b', loc: [2,0]}),
        Rapid.osmNode({id: 'c', loc: [4,0]}),
        Rapid.osmWay({id: '-', nodes: ['a', 'b'], tags: {'oneway': 'yes'}}),
        Rapid.osmWay({id: '=', nodes: ['c', 'b'], tags: {'oneway': '-1'}})
      ]);

      const disabled = Rapid.actionJoin(['-', '=']).disabled(graph);
      assert.ok(!disabled);
    });

    it('returns falsy for exceptions to tag conflicts: missing tag', () => {
      const graph = new Rapid.Graph([
        Rapid.osmNode({id: 'a', loc: [0,0]}),
        Rapid.osmNode({id: 'b', loc: [2,0]}),
        Rapid.osmNode({id: 'c', loc: [4,0]}),
        Rapid.osmWay({id: '-', nodes: ['a', 'b'], tags: {highway: 'primary'}}),
        Rapid.osmWay({id: '=', nodes: ['b', 'c'], tags: {}})
      ]);

      const disabled = Rapid.actionJoin(['-', '=']).disabled(graph);
      assert.ok(!disabled);
    });

    it('returns falsy for exceptions to tag conflicts: uninteresting tag', () => {
      const graph = new Rapid.Graph([
        Rapid.osmNode({id: 'a', loc: [0,0]}),
        Rapid.osmNode({id: 'b', loc: [2,0]}),
        Rapid.osmNode({id: 'c', loc: [4,0]}),
        Rapid.osmWay({id: '-', nodes: ['a', 'b'], tags: {'tiger:cfcc': 'A41'}}),
        Rapid.osmWay({id: '=', nodes: ['b', 'c'], tags: {'tiger:cfcc': 'A42'}})
      ]);

      const disabled = Rapid.actionJoin(['-', '=']).disabled(graph);
      assert.ok(!disabled);
    });
  });


  it('joins a --> b ==> c', () => {
    // Expected result:
    // a --> b --> c
    const graph = new Rapid.Graph([
      Rapid.osmNode({id: 'a', loc: [0,0]}),
      Rapid.osmNode({id: 'b', loc: [2,0]}),
      Rapid.osmNode({id: 'c', loc: [4,0]}),
      Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
      Rapid.osmWay({id: '=', nodes: ['b', 'c']})
    ]);

    const result = Rapid.actionJoin(['-', '='])(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity('-').nodes, ['a', 'b', 'c']);
    assert.ok(!result.hasEntity('='));
  });

  it('joins a <-- b <== c', () => {
    // Expected result:
    // a <-- b <-- c
    const graph = new Rapid.Graph([
      Rapid.osmNode({id: 'a', loc: [0,0]}),
      Rapid.osmNode({id: 'b', loc: [2,0]}),
      Rapid.osmNode({id: 'c', loc: [4,0]}),
      Rapid.osmWay({id: '-', nodes: ['b', 'a']}),
      Rapid.osmWay({id: '=', nodes: ['c', 'b']})
    ]);

    const result = Rapid.actionJoin(['-', '='])(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity('-').nodes, ['c', 'b', 'a']);
    assert.ok(!result.hasEntity('='));
  });

  it('joins a <-- b ==> c', () => {
    // Expected result:
    // a --> b --> c
    const graph = new Rapid.Graph([
      Rapid.osmNode({id: 'a', loc: [0,0]}),
      Rapid.osmNode({id: 'b', loc: [2,0]}),
      Rapid.osmNode({id: 'c', loc: [4,0]}),
      Rapid.osmWay({id: '-', nodes: ['b', 'a'], tags: {'lanes:forward': 2}}),
      Rapid.osmWay({id: '=', nodes: ['b', 'c']})
    ]);

    const result = Rapid.actionJoin(['-', '='])(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity('-').nodes, ['c', 'b', 'a']);
    assert.deepEqual(result.entity('-').tags, {'lanes:forward': 2});
    assert.ok(!result.hasEntity('='));
  });

  it('joins a --> b <== c', () => {
    // Expected result:
    // a --> b --> c
    // tags on === reversed
    const graph = new Rapid.Graph([
      Rapid.osmNode({id: 'a', loc: [0,0]}),
      Rapid.osmNode({id: 'b', loc: [2,0]}),
      Rapid.osmNode({id: 'c', loc: [4,0]}),
      Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
      Rapid.osmWay({id: '=', nodes: ['c', 'b'], tags: {'lanes:forward': 2}})
    ]);

    const result = Rapid.actionJoin(['-', '='])(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity('-').nodes, ['a', 'b', 'c']);
    assert.deepEqual(result.entity('-').tags, {'lanes:backward': 2});
    assert.ok(!result.hasEntity('='));
  });

  it('joins a --> b <== c <++ d **> e', () => {
    // Expected result:
    // a --> b --> c --> d --> e
    // tags on === reversed
    const graph = new Rapid.Graph([
      Rapid.osmNode({id: 'a', loc: [0,0]}),
      Rapid.osmNode({id: 'b', loc: [2,0]}),
      Rapid.osmNode({id: 'c', loc: [4,0]}),
      Rapid.osmNode({id: 'd', loc: [6,0]}),
      Rapid.osmNode({id: 'e', loc: [8,0]}),
      Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
      Rapid.osmWay({id: '=', nodes: ['c', 'b'], tags: {'lanes:forward': 2}}),
      Rapid.osmWay({id: '+', nodes: ['d', 'c']}),
      Rapid.osmWay({id: '*', nodes: ['d', 'e'], tags: {'lanes:backward': 2}})
    ]);

    const result = Rapid.actionJoin(['-', '=', '+', '*'])(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity('-').nodes, ['a', 'b', 'c', 'd', 'e']);
    assert.deepEqual(result.entity('-').tags, {'lanes:backward': 2});
    assert.ok(!result.hasEntity('='));
    assert.ok(!result.hasEntity('+'));
    assert.ok(!result.hasEntity('*'));
  });

  it('prefers to choose an existing way as the survivor', () => {
    // a --> b ==> c ++> d
    // --- is new, === is existing, +++ is new
    // Expected result:
    // a ==> b ==> c ==> d
    const graph = new Rapid.Graph([
      Rapid.osmNode({id: 'a', loc: [0,0]}),
      Rapid.osmNode({id: 'b', loc: [2,0]}),
      Rapid.osmNode({id: 'c', loc: [4,0]}),
      Rapid.osmNode({id: 'd', loc: [6,0]}),
      Rapid.osmWay({id: 'w-1', nodes: ['a', 'b']}),
      Rapid.osmWay({id: 'w1', nodes: ['b', 'c']}),
      Rapid.osmWay({id: 'w-2', nodes: ['c', 'd']})
    ]);

    const result = Rapid.actionJoin(['w-1', 'w1', 'w-2'])(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity('w1').nodes, ['a', 'b', 'c', 'd']);
    assert.ok(!result.hasEntity('w-1'));
    assert.ok(!result.hasEntity('w-2'));
  });

  it('prefers to choose the oldest way as the survivor', () => {
    // n1 ==> n2 ++> n3 --> n4
    // ==> is existing, ++> is existing, --> is new
    // Expected result:
    // n1 ==> n2 ==> n3 ==> n4
    const graph = new Rapid.Graph([
      Rapid.osmNode({ id: 'n1', loc: [0,0] }),
      Rapid.osmNode({ id: 'n2', loc: [2,0] }),
      Rapid.osmNode({ id: 'n3', loc: [4,0] }),
      Rapid.osmNode({ id: 'n4', loc: [6,0] }),
      Rapid.osmWay({ id: 'w1', nodes: ['n2', 'n3'] }),
      Rapid.osmWay({ id: 'w2', nodes: ['n1', 'n2'] }),
      Rapid.osmWay({ id: 'w-1', nodes: ['n3', 'n4'] })
    ]);

    const result = Rapid.actionJoin(['w2', 'w1', 'w-1'])(graph);
    assert.ok(result instanceof Rapid.Graph);
    // way 1 is the oldest (it has the lower id) so it kept that one
    assert.deepEqual(result.entity('w1').nodes, ['n1', 'n2', 'n3', 'n4']);
    assert.ok(!result.hasEntity('w-1'));
    assert.ok(!result.hasEntity('w2'));
  });

  it('merges tags', () => {
    const graph = new Rapid.Graph([
      Rapid.osmNode({id: 'a', loc: [0,0]}),
      Rapid.osmNode({id: 'b', loc: [2,0]}),
      Rapid.osmNode({id: 'c', loc: [4,0]}),
      Rapid.osmNode({id: 'd', loc: [6,0]}),
      Rapid.osmNode({id: 'e', loc: [8,0]}),
      Rapid.osmWay({id: '-', nodes: ['a', 'b'], tags: {a: 'a', b: '-', c: 'c'}}),
      Rapid.osmWay({id: '=', nodes: ['b', 'c'], tags: {a: 'a', b: '=', d: 'd'}}),
      Rapid.osmWay({id: '+', nodes: ['c', 'd'], tags: {a: 'a', b: '=', e: 'e'}})
    ]);

    const result = Rapid.actionJoin(['-', '=', '+'])(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity('-').tags, {a: 'a', b: '-;=', c: 'c', d: 'd', e: 'e'});
    assert.ok(!result.hasEntity('='));
    assert.ok(!result.hasEntity('+'));
  });

  it('preserves sidedness of start segment, co-directional lines', () => {
    // a -----> b =====> c
    //   v v v
    //
    //  Expected result:
    // a -----> b -----> c
    //   v v v    v v v
    //
    const graph = new Rapid.Graph([
      Rapid.osmNode({id: 'a', loc: [0,0]}),
      Rapid.osmNode({id: 'b', loc: [2,0]}),
      Rapid.osmNode({id: 'c', loc: [4,0]}),
      Rapid.osmWay({id: '-', nodes: ['a', 'b'], tags: { natural: 'cliff' }}),
      Rapid.osmWay({id: '=', nodes: ['b', 'c']})
    ]);

    const result = Rapid.actionJoin(['-', '='])(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity('-').nodes, ['a', 'b', 'c']);
    assert.deepEqual(result.entity('-').tags, { natural: 'cliff' });
    assert.ok(!result.hasEntity('='));
  });

  it('preserves sidedness of end segment, co-directional lines', () => {
    // a -----> b =====> c
    //            v v v
    //
    //  Expected result:
    // a =====> b =====> c
    //   v v v    v v v
    //
    const graph = new Rapid.Graph([
      Rapid.osmNode({id: 'a', loc: [0,0]}),
      Rapid.osmNode({id: 'b', loc: [2,0]}),
      Rapid.osmNode({id: 'c', loc: [4,0]}),
      Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
      Rapid.osmWay({id: '=', nodes: ['b', 'c'], tags: { natural: 'cliff' }})
    ]);

    const result = Rapid.actionJoin(['-', '='])(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity('=').nodes, ['a', 'b', 'c']);
    assert.deepEqual(result.entity('=').tags, { natural: 'cliff' });
    assert.ok(!result.hasEntity('-'));
  });

  it('preserves sidedness of start segment, contra-directional lines', () => {
    // a -----> b <===== c
    //   v v v
    //
    //  Expected result:
    // a -----> b -----> c
    //   v v v    v v v
    //
    const graph = new Rapid.Graph([
      Rapid.osmNode({id: 'a', loc: [0,0]}),
      Rapid.osmNode({id: 'b', loc: [2,0]}),
      Rapid.osmNode({id: 'c', loc: [4,0]}),
      Rapid.osmWay({id: '-', nodes: ['a', 'b'], tags: { natural: 'cliff' }}),
      Rapid.osmWay({id: '=', nodes: ['c', 'b']})
    ]);

    const result = Rapid.actionJoin(['-', '='])(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity('-').nodes, ['a', 'b', 'c']);
    assert.deepEqual(result.entity('-').tags, { natural: 'cliff' });
    assert.ok(!result.hasEntity('='));
  });

  it('preserves sidedness of end segment, contra-directional lines', () => {
    // a -----> b <===== c
    //             v v v
    //
    //  Expected result:
    // a <===== b <===== c
    //    v v v    v v v
    //
    const graph = new Rapid.Graph([
      Rapid.osmNode({id: 'a', loc: [0,0]}),
      Rapid.osmNode({id: 'b', loc: [2,0]}),
      Rapid.osmNode({id: 'c', loc: [4,0]}),
      Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
      Rapid.osmWay({id: '=', nodes: ['c', 'b'], tags: { natural: 'cliff' }})
    ]);

    const result = Rapid.actionJoin(['-', '='])(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity('=').nodes, ['c', 'b', 'a']);
    assert.deepEqual(result.entity('=').tags, { natural: 'cliff' });
    assert.ok(!result.hasEntity('-'));
  });


  it('merges relations', () => {
    const graph = new Rapid.Graph([
      Rapid.osmNode({id: 'a', loc: [0,0]}),
      Rapid.osmNode({id: 'b', loc: [2,0]}),
      Rapid.osmNode({id: 'c', loc: [4,0]}),
      Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
      Rapid.osmWay({id: '=', nodes: ['b', 'c']}),
      Rapid.osmRelation({id: 'r1', members: [
        {id: '=', role: 'r1', type: 'way'}
      ]}),
      Rapid.osmRelation({id: 'r2', members: [
        {id: '=', role: 'r2', type: 'way'},
        {id: '-', role: 'r2', type: 'way'}
      ]})
    ]);

    const result = Rapid.actionJoin(['-', '='])(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity('r1').members, [ {id: '-', role: 'r1', type: 'way'} ]);
    assert.deepEqual(result.entity('r2').members, [ {id: '-', role: 'r2', type: 'way'} ]);
  });

  it('preserves duplicate route segments in relations', () => {
    //
    // Situation:
    //    a ---> b ===> c ~~~~> d                        join '-' and '='
    //    Relation: ['-', '=', '~', '~', '=', '-']
    //
    // Expected result:
    //    a ---> b ---> c ~~~~> d
    //    Relation: ['-', '~', '~', '-']
    //
    const graph = new Rapid.Graph([
      Rapid.osmNode({ id: 'a', loc: [0, 0] }),
      Rapid.osmNode({ id: 'b', loc: [1, 0] }),
      Rapid.osmNode({ id: 'c', loc: [2, 0] }),
      Rapid.osmNode({ id: 'd', loc: [3, 0] }),
      Rapid.osmWay({ id: '-', nodes: ['a', 'b'] }),
      Rapid.osmWay({ id: '=', nodes: ['b', 'c'] }),
      Rapid.osmWay({ id: '~', nodes: ['c', 'd'] }),
      Rapid.osmRelation({id: 'r', members: [
        {id: '-', role: 'forward', type: 'way'},
        {id: '=', role: 'forward', type: 'way'},
        {id: '~', role: 'forward', type: 'way'},
        {id: '~', role: 'forward', type: 'way'},
        {id: '=', role: 'forward', type: 'way'},
        {id: '-', role: 'forward', type: 'way'}
      ]})
    ]);

    const result = Rapid.actionJoin(['-', '='])(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity('-').nodes, ['a', 'b', 'c']);
    assert.deepEqual(result.entity('~').nodes, ['c', 'd']);
    assert.deepEqual(result.entity('r').members, [
      {id: '-', role: 'forward', type: 'way'},
      {id: '~', role: 'forward', type: 'way'},
      {id: '~', role: 'forward', type: 'way'},
      {id: '-', role: 'forward', type: 'way'}
    ]);
  });

  it('collapses resultant single-member multipolygon into basic area', () => {
    // Situation:
    // b --> c
    // |#####|
    // |# r #|
    // |#####|
    // a <== d
    //
    //  Expected result:
    // a --> b
    // |#####|
    // |#####|
    // |#####|
    // d <-- c
    const graph = new Rapid.Graph([
      Rapid.osmNode({id: 'a', loc: [0,0]}),
      Rapid.osmNode({id: 'b', loc: [0,2]}),
      Rapid.osmNode({id: 'c', loc: [2,2]}),
      Rapid.osmNode({id: 'd', loc: [2,0]}),
      Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd']}),
      Rapid.osmWay({id: '=', nodes: ['d', 'a']}),
      Rapid.osmRelation({id: 'r', tags: { type: 'multipolygon', man_made: 'pier' }, members: [
        {id: '-', role: 'outer', type: 'way'},
        {id: '=', role: 'outer', type: 'way'}
      ]})
    ]);

    const result = Rapid.actionJoin(['-', '='])(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity('-').nodes, ['a', 'b', 'c', 'd', 'a']);
    assert.deepEqual(result.entity('-').tags, { man_made: 'pier', area: 'yes' });
    assert.ok(!result.hasEntity('='));
    assert.ok(!result.hasEntity('r'));
  });

  it('does not collapse resultant single-member multipolygon into basic area when tags conflict', () => {
    // Situation:
    // b --> c
    // |#####|
    // |# r #|
    // |#####|
    // a <== d
    //
    //  Expected result:
    // a --> b
    // |#####|
    // |# r #|
    // |#####|
    // d <-- c
    const graph = new Rapid.Graph([
      Rapid.osmNode({id: 'a', loc: [0,0]}),
      Rapid.osmNode({id: 'b', loc: [0,2]}),
      Rapid.osmNode({id: 'c', loc: [2,2]}),
      Rapid.osmNode({id: 'd', loc: [2,0]}),
      Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd'], tags: { surface: 'paved' }}),
      Rapid.osmWay({id: '=', nodes: ['d', 'a']}),
      Rapid.osmRelation({id: 'r', members: [
        {id: '-', role: 'outer', type: 'way'},
        {id: '=', role: 'outer', type: 'way'}
      ], tags: {
        type: 'multipolygon',
        man_made: 'pier',
        surface: 'wood'
      }})
    ]);

    const result = Rapid.actionJoin(['-', '='])(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity('-').nodes, ['a', 'b', 'c', 'd', 'a']);
    assert.deepEqual(result.entity('-').tags, { surface: 'paved' });
    assert.ok(!result.hasEntity('='));
    assert.deepEqual(result.entity('r').tags, { type: 'multipolygon', man_made: 'pier', surface: 'wood' });
  });

});
