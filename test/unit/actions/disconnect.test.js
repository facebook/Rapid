import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';


describe('actionDisconnect', () => {

  it('replaces the node with a new node in all but the first way', () => {
    // Situation:
    //    a --- b --- c
    //          |
    //          d
    // Disconnect at b.
    //
    // Expected result:
    //    a --- b --- c
    //
    //          *
    //          |
    //          d
    //
    const graph = new Rapid.Graph([
      Rapid.osmNode({id: 'a'}),
      Rapid.osmNode({id: 'b'}),
      Rapid.osmNode({id: 'c'}),
      Rapid.osmNode({id: 'd'}),
      Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c']}),
      Rapid.osmWay({id: '|', nodes: ['d', 'b']})
    ]);

    const result = Rapid.actionDisconnect('b', '*')(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity('-').nodes, ['a', 'b', 'c']);
    assert.deepEqual(result.entity('|').nodes, ['d', '*']);
  });


  it('disconnects only the ways specified by limitWays', () => {
    // Situation:
    //    a --- b === c
    //          |
    //          d
    // Disconnect - at b.
    //
    // Expected result:
    //    a --- *  b === c
    //             |
    //             d
    //
    const graph = new Rapid.Graph([
      Rapid.osmNode({id: 'a'}),
      Rapid.osmNode({id: 'b'}),
      Rapid.osmNode({id: 'c'}),
      Rapid.osmNode({id: 'd'}),
      Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
      Rapid.osmWay({id: '=', nodes: ['b', 'c']}),
      Rapid.osmWay({id: '|', nodes: ['d', 'b']})
    ]);

    const result = Rapid.actionDisconnect('b', '*').limitWays(['-'])(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity('-').nodes, ['a', '*']);
    assert.deepEqual(result.entity('=').nodes, ['b', 'c']);
    assert.deepEqual(result.entity('|').nodes, ['d', 'b']);
  });


  it('keeps a closed line closed, when being disconnected at the closing node', () => {
    // Situation:
    //    a === b -- c
    //          |    |
    //          e -- d
    //
    // Disconnect - at b
    //
    // Expected result:
    //    a === b * -- c
    //            |    |
    //            e -- d
    //
    const graph = new Rapid.Graph([
      Rapid.osmNode({id: 'a'}),
      Rapid.osmNode({id: 'b'}),
      Rapid.osmNode({id: 'c'}),
      Rapid.osmNode({id: 'd'}),
      Rapid.osmNode({id: 'e'}),
      Rapid.osmWay({id: '=', nodes: ['a', 'b']}),
      Rapid.osmWay({id: '-', nodes: ['b', 'c', 'd', 'e', 'b']})
    ]);

    const result = Rapid.actionDisconnect('b', '*')(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity('=').nodes, ['a', 'b']);
    assert.deepEqual(result.entity('-').nodes, ['*', 'c', 'd', 'e', '*']);   // still closed
  });


  it('disconnects the closing node of a linear way (not area)', () => {
    // Situation:
    //  a --- b
    //   \   /
    //    \ /
    //     c
    // Disconnect at a
    //
    // Expected result:
    //  a --- b
    //        |
    //  * --- c
    //
    const graph = new Rapid.Graph([
      Rapid.osmNode({id: 'a'}),
      Rapid.osmNode({id: 'b'}),
      Rapid.osmNode({id: 'c'}),
      Rapid.osmWay({id: 'w', nodes: ['a', 'b', 'c', 'a']})
    ]);

    const result = Rapid.actionDisconnect('a', '*')(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity('w').nodes, ['a', 'b', 'c', '*']);
  });


  it('disconnects a shared non-closing node in an area without breaking the area', () => {
    // Situation:
    //  a -- b -- c
    //       |    |
    //       e -- d
    //
    // An area that is connected to itself (not normally allowed)
    // Disconnect at b
    //
    // Expected Result:
    //  a -- b -- c
    //  |         |
    //  * -- e -- d
    //
    const graph = new Rapid.Graph([
      Rapid.osmNode({id: 'a'}),
      Rapid.osmNode({id: 'b'}),
      Rapid.osmNode({id: 'c'}),
      Rapid.osmNode({id: 'd'}),
      Rapid.osmNode({id: 'e'}),
      Rapid.osmWay({id: 'w', nodes: ['a', 'b', 'c', 'd', 'e', 'b', 'a'], tags: {area: 'yes'}})
    ]);

    const result = Rapid.actionDisconnect('b', '*')(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity('w').nodes, ['a', 'b', 'c', 'd', 'e', '*', 'a']);  // still closed
  });


  it('disconnects the closing node of an area without breaking the area', () => {
    // Situation:
    // a --- b --- d
    //  \   / \   /
    //   \ /   \ /
    //    c     e
    // 2 areas: a-b-c-a  and  b-d-e-b
    //
    // Disconnect at b
    //
    // Expected Result:
    // a --- b   * --- d
    //  \   /     \   /
    //   \ /       \ /
    //    c         e
    // 2 areas: a-b-c-a  and  *-d-e-*

    const graph = new Rapid.Graph([
      Rapid.osmNode({id: 'a'}),
      Rapid.osmNode({id: 'b'}),
      Rapid.osmNode({id: 'c'}),
      Rapid.osmNode({id: 'd'}),
      Rapid.osmNode({id: 'e'}),
      Rapid.osmWay({id: 'w1', nodes: ['a', 'b', 'c', 'a'], tags: {area: 'yes'}}),
      Rapid.osmWay({id: 'w2', nodes: ['b', 'd', 'e', 'b'], tags: {area: 'yes'}})
    ]);

    const result = Rapid.actionDisconnect('b', '*')(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity('w1').nodes, ['a', 'b', 'c', 'a']);  // still closed
    assert.deepEqual(result.entity('w2').nodes, ['*', 'd', 'e', '*']);  // still closed
  });


  it('disconnects multiple closing nodes of multiple areas without breaking the areas', () => {
    // Situation:
    // a --- b --- d
    //  \   / \   /
    //   \ /   \ /
    //    c     e
    // 2 areas: b-c-a-b  and  b-d-e-b
    //
    // Disconnect at b
    //
    // Expected Result:
    // a --- b   * --- d
    //  \   /     \   /
    //   \ /       \ /
    //    c         e
    // 2 areas: b-c-a-b  and  *-d-e-*

    const graph = new Rapid.Graph([
      Rapid.osmNode({id: 'a'}),
      Rapid.osmNode({id: 'b'}),
      Rapid.osmNode({id: 'c'}),
      Rapid.osmNode({id: 'd'}),
      Rapid.osmNode({id: 'e'}),
      Rapid.osmWay({id: 'w1', nodes: ['b', 'c', 'a', 'b'], tags: {area: 'yes'}}),
      Rapid.osmWay({id: 'w2', nodes: ['b', 'd', 'e', 'b'], tags: {area: 'yes'}})
    ]);

    const result = Rapid.actionDisconnect('b', '*')(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity('w1').nodes, ['b', 'c', 'a', 'b']);  // still closed
    assert.deepEqual(result.entity('w2').nodes, ['*', 'd', 'e', '*']);  // still closed
  });


  it('copies location and tags to the new nodes', () => {
    const tags = { highway: 'traffic_signals' };
    const loc = [1, 2];
    const graph = new Rapid.Graph([
      Rapid.osmNode({id: 'a'}),
      Rapid.osmNode({id: 'b', loc: loc, tags: tags}),
      Rapid.osmNode({id: 'c'}),
      Rapid.osmNode({id: 'd'}),
      Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c']}),
      Rapid.osmWay({id: '|', nodes: ['d', 'b']})
    ]);

    const result = Rapid.actionDisconnect('b', '*')(graph);
    assert.ok(result instanceof Rapid.Graph);

// why?? I would expect it to make copies (the test even says "copies")
    // Immutable loc => should be shared by identity.
    // expect(graph.entity('b').loc).to.equal(loc);
    // expect(graph.entity('*').loc).to.equal(loc);
    assert.equal(result.entity('b').loc, loc);
    assert.equal(result.entity('*').loc, loc);

    // Immutable tags => should be shared by identity.
    // expect(graph.entity('b').tags).to.equal(tags);
    // expect(graph.entity('*').tags).to.equal(tags);
    assert.equal(result.entity('b').tags, tags);
    assert.equal(result.entity('*').tags, tags);
  });


  describe('#disabled', () => {
    it('returns \'not_connected\' for a node shared by less than two ways', () => {
      const graph = new Rapid.Graph([Rapid.osmNode({id: 'a'})]);
      const disabled = Rapid.actionDisconnect('a').disabled(graph);
      assert.equal(disabled, 'not_connected');
    });

    it('returns falsy for the closing node in a closed line', () => {
      //  a --- b
      //  |     |
      //  d --- c
      const graph = new Rapid.Graph([
        Rapid.osmNode({id: 'a'}),
        Rapid.osmNode({id: 'b'}),
        Rapid.osmNode({id: 'c'}),
        Rapid.osmNode({id: 'd'}),
        Rapid.osmWay({id: 'w', nodes: ['a', 'b', 'c', 'd', 'a']})
      ]);
      const disabled = Rapid.actionDisconnect('a').disabled(graph);
      assert.ok(!disabled);
    });

    it('returns not_connected for the closing node in a closed area', () => {
      //  a --- b
      //  |     |
      //  d --- c
      const graph = new Rapid.Graph([
        Rapid.osmNode({id: 'a'}),
        Rapid.osmNode({id: 'b'}),
        Rapid.osmNode({id: 'c'}),
        Rapid.osmNode({id: 'd'}),
        Rapid.osmWay({id: 'w', nodes: ['a', 'b', 'c', 'd', 'a'], tags: {area: 'yes'}})
      ]);
      const disabled = Rapid.actionDisconnect('a').disabled(graph);
      assert.equal(disabled, 'not_connected');
    });

    it('returns falsy for a shared non-closing node in an area', () => {
      //  a --- b --- c
      //        |     |
      //        e --- d
      const graph = new Rapid.Graph([
        Rapid.osmNode({id: 'a'}),
        Rapid.osmNode({id: 'b'}),
        Rapid.osmNode({id: 'c'}),
        Rapid.osmNode({id: 'd'}),
        Rapid.osmNode({id: 'e'}),
        Rapid.osmWay({id: 'w', nodes: ['a', 'b', 'c', 'd', 'e', 'b', 'a'], tags: {area: 'yes'}})
      ]);
      const disabled = Rapid.actionDisconnect('b').disabled(graph);
      assert.ok(!disabled);
    });

    it('returns falsy for a node shared by two or more ways', () => {
      //  a --- b --- c
      //        |
      //        d
      const graph = new Rapid.Graph([
        Rapid.osmNode({id: 'a'}),
        Rapid.osmNode({id: 'b'}),
        Rapid.osmNode({id: 'c'}),
        Rapid.osmNode({id: 'd'}),
        Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c']}),
        Rapid.osmWay({id: '|', nodes: ['d', 'b']})
      ]);
      const disabled = Rapid.actionDisconnect('b').disabled(graph);
      assert.ok(!disabled);
    });

    it('returns falsy for an intersection of two ways with way specified by limitWays', () => {
      //  a --- b === c
      //        |
      //        d
      const graph = new Rapid.Graph([
        Rapid.osmNode({id: 'a'}),
        Rapid.osmNode({id: 'b'}),
        Rapid.osmNode({id: 'c'}),
        Rapid.osmNode({id: 'd'}),
        Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
        Rapid.osmWay({id: '=', nodes: ['b', 'c']}),
        Rapid.osmWay({id: '|', nodes: ['d', 'b']})
      ]);
      const disabled = Rapid.actionDisconnect('b').limitWays(['-']).disabled(graph);
      assert.ok(!disabled);
    });


    it('returns \'relation\' for a node connecting any two members of the same relation', () => {
      // Covers restriction relations, routes, multipolygons.
      // a --- b === c
      const graph = new Rapid.Graph([
        Rapid.osmNode({id: 'a'}),
        Rapid.osmNode({id: 'b'}),
        Rapid.osmNode({id: 'c'}),
        Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
        Rapid.osmWay({id: '=', nodes: ['b', 'c']}),
        Rapid.osmRelation({id: 'r', members: [{ id: '-' }, { id: '=' }]})
      ]);
      const disabled = Rapid.actionDisconnect('b').disabled(graph);
      assert.equal(disabled, 'relation');
    });

    it('returns falsy for a node connecting two members of an unaffected relation', () => {
      //  a --- b === c
      //        |
      //        d
      const graph = new Rapid.Graph([
        Rapid.osmNode({id: 'a'}),
        Rapid.osmNode({id: 'b'}),
        Rapid.osmNode({id: 'c'}),
        Rapid.osmNode({id: 'd'}),
        Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
        Rapid.osmWay({id: '=', nodes: ['b', 'c']}),
        Rapid.osmWay({id: '|', nodes: ['d', 'b']}),
        Rapid.osmRelation({id: 'r', members: [{ id: '-' }, { id: '=' }]})
      ]);
      const disabled = Rapid.actionDisconnect('b').limitWays(['|']).disabled(graph);
      assert.ok(!disabled);
    });
  });
});
