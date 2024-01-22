import { test, beforeEach } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';


test('actionExtract', async t => {
  const tags = { 'name': 'test' };

  function createTargetNode(id, lonlat) {
    return Rapid.osmNode({ id: id, loc: lonlat, tags: tags });
  }

  await t.test('linear way', async t => {
    let graph;
    beforeEach(() => {
      // a -- b -- c -- d
      graph = new Rapid.Graph([
        Rapid.osmNode({ id: 'a', loc: [0, 0] }),
        Rapid.osmNode({ id: 'b', loc: [1, 0] }),
        Rapid.osmNode({ id: 'c', loc: [2, 0] }),
        Rapid.osmNode({ id: 'd', loc: [3, 0] }),
        Rapid.osmWay({ id: '-', nodes: ['a', 'b', 'c', 'd'] })
      ]);
    });

    await t.test('target in first position', async t => {
      beforeEach(() => {
        // Swap target into the location & position of A
        const target = createTargetNode('a', graph.entity('a').loc);
        graph = graph.replace(target);
      });

      await t.test('does not change length of way', t => {
        const result = Rapid.actionExtract('a')(graph);
        assert.ok(result instanceof Rapid.Graph);

        // Confirm that the way still has 4 nodes
        const nodes = result.entity('-').nodes;
        assert.equal(nodes.length, 4);
      });

      await t.test('does not change order of nodes', t => {
        const result = Rapid.actionExtract('a')(graph);
        assert.ok(result instanceof Rapid.Graph);

        // Confirm that the way is ordered correctly
        // Note that we can't be sure of the id of the replacement node
        // so we only assert the nodes we know the ids for
        const nodes = result.entity('-').nodes;
        assert.equal(nodes[1], 'b');
        assert.equal(nodes[2], 'c');
        assert.equal(nodes[3], 'd');
      });

      await t.test('does not change location of nodes', t => {
        const result = Rapid.actionExtract('a')(graph);
        assert.ok(result instanceof Rapid.Graph);

        // Confirm that the nodes have not moved, including the replacement node
        const nodes = result.entity('-').nodes;
        assert.deepEqual(result.entity(nodes[0]).loc, [0, 0]);
        assert.deepEqual(result.entity(nodes[1]).loc, [1, 0]);
        assert.deepEqual(result.entity(nodes[2]).loc, [2, 0]);
        assert.deepEqual(result.entity(nodes[3]).loc, [3, 0]);
      });

      await t.test('does replace target node', t => {
        const result = Rapid.actionExtract('a')(graph);
        assert.ok(result instanceof Rapid.Graph);

        const nodes = result.entity('-').nodes;
        const replacement = result.entity(nodes[0]);
        assert.notEqual(replacement.id, 'a');     // Confirm that the replacement is no longer 'a'
        assert.deepEqual(replacement.tags, {});   // and that the tags are not present
      });

      await t.test('does detach target node', t => {
        const result = Rapid.actionExtract('a')(graph);
        assert.ok(result instanceof Rapid.Graph);

        const target = result.entity('a');
        assert.ok(target instanceof Rapid.osmNode);       // Confirm that 'a' still exists, and…
        assert.deepEqual(target.loc, [0, 0]);             // the location is correct
        assert.deepEqual(target.tags, tags);              // the tags are intact
        assert.deepEqual(result.parentWays(target), []);  // the target has detached from the way
      });
    });
  });

//
//    await t.test('target in second position', t => {
//      beforeEach(() => {
//        // Swap target into the location & position of B
//        const target = createTargetNode('b', graph.entity('b').loc);
//        graph = graph.replace(target);
//      });
//
//      await t.test('does not change length of way', t => {
//        const result = Rapid.actionExtract('b')(graph);
//
//        // Confirm that the way still has 4 nodes
//        const target = result.entity('-');
//        expect(target.nodes.length).to.eql(4);
//      });
//
//      await t.test('does not change order of nodes', t => {
//        const result = Rapid.actionExtract('b')(graph);
//
//        // Confirm that the way is ordered correctly
//        const target = result.entity('-');
//        // Note that we can't be sure of the id of the replacement node
//        // so we only assert the nodes we know the ids for
//        // As we have already confirmed the size of the array we can assume
//        // that the replacement node is in the correct posisiton by a process of elimination
//        expect(target.nodes[0]).to.eql('a');
//        expect(target.nodes[2]).to.eql('c');
//        expect(target.nodes[3]).to.eql('d');
//      });
//
//      await t.test('does not change location of nodes', t => {
//        const result = Rapid.actionExtract('b')(graph);
//
//        // Confirm that the nodes have not moved, including the replacement node
//        const nodes = result.entity('-').nodes;
//        expect(result.entity(nodes[0]).loc).to.eql([0, 0]);
//        expect(result.entity(nodes[1]).loc).to.eql([1, 0]);
//        expect(result.entity(nodes[2]).loc).to.eql([2, 0]);
//        expect(result.entity(nodes[3]).loc).to.eql([3, 0]);
//      });
//
//      await t.test('does replace target node', t => {
//        const result = Rapid.actionExtract('b')(graph);
//
//        const nodes = result.entity('-').nodes;
//        // Confirm that the target is no longer "a"
//        expect(nodes[1]).not.to.eql('b');
//        // and that the tags are not present
//        expect(result.entity(nodes[1]).tags).to.eql({});
//      });
//
//      await t.test('does detach target node', t => {
//        const result = Rapid.actionExtract('b')(graph);
//
//        // confirm that a still exists
//        const targetNode = result.entity('b');
//        expect(targetNode).not.to.eql(undefined);
//        // ... and that the location is correct
//        expect(targetNode.loc).to.eql([1, 0]);
//        // ... and that the tags are intact
//        expect(targetNode.tags).to.eql(tags);
//        // ... and that the parentWay is empty
//        expect(result.parentWays(targetNode)).to.eql([]);
//      });
//    });
//  });


  await t.test('closed way', async t => {
    let graph;
    beforeEach(() => {
      //  d -- c
      //  |    |
      //  a -- b
      graph = new Rapid.Graph([
        Rapid.osmNode({ id: 'a', loc: [0, 0] }),
        Rapid.osmNode({ id: 'b', loc: [1, 0] }),
        Rapid.osmNode({ id: 'c', loc: [1, 1] }),
        Rapid.osmNode({ id: 'd', loc: [0, 1] }),
        Rapid.osmWay({ id: '-', nodes: ['a', 'b', 'c', 'd', 'a'] })
      ]);
    });

    await t.test('target in first position', async t => {
      beforeEach(() => {
        // Swap target into the location & position of A
        const targetNode = createTargetNode('a', graph.entity('a').loc);
        graph = graph.replace(targetNode);
      });

      await t.test('does not change length of way', t => {
        const result = Rapid.actionExtract('a')(graph);
        assert.ok(result instanceof Rapid.Graph);

        // Confirm that the way still has 5 nodes
        const nodes = result.entity('-').nodes;
        assert.equal(nodes.length, 5);
      });

      await t.test('does not change order of nodes', t => {
        const result = Rapid.actionExtract('a')(graph);
        assert.ok(result instanceof Rapid.Graph);

        // Confirm that the way is ordered correctly
        // Note that we can't be sure of the id of the replacement node
        // so we only assert the nodes we know the ids for
        const nodes = result.entity('-').nodes;
        assert.equal(nodes[1], 'b');
        assert.equal(nodes[2], 'c');
        assert.equal(nodes[3], 'd');
        assert.equal(nodes[0], nodes[4]); // way remains closed
      });

      await t.test('does not change location of nodes', t => {
        const result = Rapid.actionExtract('a')(graph);
        assert.ok(result instanceof Rapid.Graph);

        // Confirm that the nodes have not moved, including the replacement node
        const nodes = result.entity('-').nodes;
        assert.deepEqual(result.entity(nodes[0]).loc, [0, 0]);
        assert.deepEqual(result.entity(nodes[1]).loc, [1, 0]);
        assert.deepEqual(result.entity(nodes[2]).loc, [1, 1]);
        assert.deepEqual(result.entity(nodes[3]).loc, [0, 1]);
      });

      await t.test('does replace target node', t => {
        const result = Rapid.actionExtract('a')(graph);
        assert.ok(result instanceof Rapid.Graph);

        const nodes = result.entity('-').nodes;
        const replacement = result.entity(nodes[0]);
        assert.notEqual(replacement.id, 'a');     // Confirm that the replacement is no longer 'a'
        assert.deepEqual(replacement.tags, {});   // and that the tags are not present
      });

      await t.test('does detach target node', t => {
        const result = Rapid.actionExtract('a')(graph);
        assert.ok(result instanceof Rapid.Graph);

        const target = result.entity('a');
        assert.ok(target instanceof Rapid.osmNode);       // Confirm that 'a' still exists, and…
        assert.deepEqual(target.loc, [0, 0]);             // the location is correct
        assert.deepEqual(target.tags, tags);              // the tags are intact
        assert.deepEqual(result.parentWays(target), []);  // the target has detached from the way
      });
    });

//    await t.test('target in second position', t => {
//      beforeEach(() => {
//        // Swap target into the location & position of B
//        const targetNode = createTargetNode('b', graph.entity('b').loc);
//        graph = graph.replace(targetNode);
//      });
//
//      await t.test('does not change length of way', t => {
//        const result = Rapid.actionExtract('b')(graph);
//
//        // Confirm that the way still has 5 nodes
//        const target = result.entity('-');
//        expect(target.nodes.length).to.eql(5);
//      });
//
//      await t.test('does not change order of nodes', t => {
//        const result = Rapid.actionExtract('b')(graph);
//
//        // Confirm that the way is ordered correctly
//        const target = result.entity('-');
//        // Note that we can't be sure of the id of the replacement node
//        // so we only assert the nodes we know the ids for
//        // As we have already confirmed the size of the array we can assume
//        // that the replacement node is in the correct posisiton by a process of elimination
//        expect(target.nodes[0]).to.eql('a');
//        expect(target.nodes[2]).to.eql('c');
//        expect(target.nodes[3]).to.eql('d');
//        expect(target.nodes[4]).to.eql('a');
//      });
//
//      await t.test('does not change location of nodes', t => {
//        const result = Rapid.actionExtract('b')(graph);
//
//        // Confirm that the nodes have not moved, including the replacement node
//        const nodes = result.entity('-').nodes;
//        expect(result.entity(nodes[0]).loc).to.eql([0, 0]);
//        expect(result.entity(nodes[1]).loc).to.eql([1, 0]);
//        expect(result.entity(nodes[2]).loc).to.eql([1, 1]);
//        expect(result.entity(nodes[3]).loc).to.eql([0, 1]);
//        // Confirmed already that node[4] is node[0] so no further assertion needed
//      });
//
//      await t.test('does replace target node', t => {
//        const result = Rapid.actionExtract('b')(graph);
//
//        const nodes = result.entity('-').nodes;
//        // Confirm that the target is no longer "a"
//        expect(nodes[1]).not.to.eql('b');
//        // and that the tags are not present
//        expect(result.entity(nodes[1]).tags).to.eql({});
//      });
//
//      await t.test('does detach target node', t => {
//        const result = Rapid.actionExtract('b')(graph);
//
//        // confirm that a still exists
//        const targetNode = result.entity('b');
//        expect(targetNode).not.to.eql(undefined);
//        // ... and that the location is correct
//        expect(targetNode.loc).to.eql([1, 0]);
//        // ... and that the tags are intact
//        expect(targetNode.tags).to.eql(tags);
//        // ... and that the parentWay is empty
//        expect(result.parentWays(targetNode)).to.eql([]);
//      });
//    });
  });


  await t.test('intersecting linear ways', async t => {
    let graph;
    beforeEach(() => {
      //
      //           f
      //           ‖
      //           e
      //           ‖
      // a -- b -- c -- d
      //
      // Node c represents the target
      //
      graph = new Rapid.Graph([
        Rapid.osmNode({ id: 'a', loc: [0, 0] }),
        Rapid.osmNode({ id: 'b', loc: [1, 0] }),
        Rapid.osmNode({ id: 'c', loc: [2, 0], tags: tags }),
        Rapid.osmNode({ id: 'd', loc: [3, 0] }),
        Rapid.osmNode({ id: 'e', loc: [2, 1] }),
        Rapid.osmNode({ id: 'f', loc: [2, 2] }),
        Rapid.osmWay({ id: '-', nodes: ['a', 'b', 'c', 'd'] }),
        Rapid.osmWay({ id: '=', nodes: ['c', 'e', 'f'] })
      ]);
    });

    await t.test('does not change length of ways', t => {
      const result = Rapid.actionExtract('c')(graph);
      assert.ok(result instanceof Rapid.Graph);
      assert.equal(result.entity('-').nodes.length, 4);
      assert.equal(result.entity('=').nodes.length, 3);
    });

    await t.test('does not change order of nodes', t => {
      const result = Rapid.actionExtract('c')(graph);
      assert.ok(result instanceof Rapid.Graph);

      // Confirm that the way is ordered correctly
      // Note that we can't be sure of the id of the replacement node
      // so we only assert the nodes we know the ids for
      const way1 = result.entity('-');
      assert.equal(way1.nodes[0], 'a');
      assert.equal(way1.nodes[1], 'b');
      assert.equal(way1.nodes[3], 'd');
      const way2 = result.entity('=');
      assert.equal(way2.nodes[1], 'e');
      assert.equal(way2.nodes[2], 'f');
    });

    await t.test('does not change location of nodes', t => {
      const result = Rapid.actionExtract('c')(graph);
      assert.ok(result instanceof Rapid.Graph);

      // Confirm that the nodes have not moved, including the replacement node
      const way1 = result.entity('-');
      assert.deepEqual(result.entity(way1.nodes[0]).loc, [0, 0]);
      assert.deepEqual(result.entity(way1.nodes[1]).loc, [1, 0]);
      assert.deepEqual(result.entity(way1.nodes[2]).loc, [2, 0]);
      assert.deepEqual(result.entity(way1.nodes[3]).loc, [3, 0]);
      const way2 = result.entity('=');
      assert.deepEqual(result.entity(way2.nodes[0]).loc, [2, 0]);
      assert.deepEqual(result.entity(way2.nodes[1]).loc, [2, 1]);
      assert.deepEqual(result.entity(way2.nodes[2]).loc, [2, 2]);
    });

    await t.test('uses same replacement node at intersection', t => {
      const result = Rapid.actionExtract('c')(graph);
      assert.ok(result instanceof Rapid.Graph);

      // Confirm both ways have the same replacement node
      const way1 = result.entity('-');
      const way2 = result.entity('=');
      assert.equal(way1.nodes[2], way2.nodes[0]);
    });

    await t.test('does replace target node', t => {
      const result = Rapid.actionExtract('c')(graph);
      assert.ok(result instanceof Rapid.Graph);

      const way1 = result.entity('-');
      const replacement = result.entity(way1.nodes[2]);
      assert.notEqual(replacement.id, 'c');     // Confirm that the replacement is no longer 'c'
      assert.deepEqual(replacement.tags, {});   // and that the tags are not present
    });

    await t.test('does detach target node', t => {
      const result = Rapid.actionExtract('c')(graph);
      assert.ok(result instanceof Rapid.Graph);

      const target = result.entity('c');
      assert.ok(target instanceof Rapid.osmNode);       // Confirm that 'c' still exists, and…
      assert.deepEqual(target.loc, [2, 0]);             // the location is correct
      assert.deepEqual(target.tags, tags);              // the tags are intact
      assert.deepEqual(result.parentWays(target), []);  // the target has detached from the ways
    });
  });


  await t.test('intersecting closed way', async t => {
    let graph;
    beforeEach(() => {
      //
      //       g == f
      //       ‖    ‖
      //  d -- c == e
      //  |    |
      //  a -- b
      //
      // c is the target node
      //
      graph = new Rapid.Graph([
        Rapid.osmNode({ id: 'a', loc: [0, 0] }),
        Rapid.osmNode({ id: 'b', loc: [1, 0] }),
        Rapid.osmNode({ id: 'c', loc: [1, 1], tags: tags }),
        Rapid.osmNode({ id: 'd', loc: [0, 1] }),
        Rapid.osmNode({ id: 'e', loc: [2, 1] }),
        Rapid.osmNode({ id: 'f', loc: [2, 2] }),
        Rapid.osmNode({ id: 'g', loc: [1, 2] }),
        Rapid.osmWay({ id: '-', nodes: ['a', 'b', 'c', 'd', 'a'] }),
        Rapid.osmWay({ id: '=', nodes: ['c', 'e', 'f', 'g', 'c'] })
      ]);
    });

    await t.test('does not change length of ways', t => {
      const result = Rapid.actionExtract('c')(graph);
      assert.ok(result instanceof Rapid.Graph);
      assert.equal(result.entity('-').nodes.length, 5);
      assert.equal(result.entity('=').nodes.length, 5);
    });

    await t.test('does not change order of nodes', t => {
      const result = Rapid.actionExtract('c')(graph);
      assert.ok(result instanceof Rapid.Graph);

      // Confirm that the way is ordered correctly
      // Note that we can't be sure of the id of the replacement node
      // so we only assert the nodes we know the ids for
      const way1 = result.entity('-');
      assert.equal(way1.nodes[0], 'a');
      assert.equal(way1.nodes[1], 'b');
      assert.equal(way1.nodes[3], 'd');
      assert.equal(way1.nodes[0], way1.nodes[4]);  // still closed
      const way2 = result.entity('=');
      assert.equal(way2.nodes[1], 'e');
      assert.equal(way2.nodes[2], 'f');
      assert.equal(way2.nodes[3], 'g');
      assert.equal(way2.nodes[0], way2.nodes[4]);  // still closed
    });

    await t.test('does not change location of nodes', t => {
      const result = Rapid.actionExtract('c')(graph);
      assert.ok(result instanceof Rapid.Graph);

      // Confirm that the nodes have not moved, including the replacement node
      const way1 = result.entity('-');
      assert.deepEqual(result.entity(way1.nodes[0]).loc, [0, 0]);
      assert.deepEqual(result.entity(way1.nodes[1]).loc, [1, 0]);
      assert.deepEqual(result.entity(way1.nodes[2]).loc, [1, 1]);
      assert.deepEqual(result.entity(way1.nodes[3]).loc, [0, 1]);
      const way2 = result.entity('=');
      assert.deepEqual(result.entity(way2.nodes[0]).loc, [1, 1]);
      assert.deepEqual(result.entity(way2.nodes[1]).loc, [2, 1]);
      assert.deepEqual(result.entity(way2.nodes[2]).loc, [2, 2]);
      assert.deepEqual(result.entity(way2.nodes[3]).loc, [1, 2]);
    });

    await t.test('uses same replacement node at intersection', t => {
      const result = Rapid.actionExtract('c')(graph);
      assert.ok(result instanceof Rapid.Graph);

      // Confirm both ways have the same replacement node
      const way1 = result.entity('-');
      const way2 = result.entity('=');
      assert.equal(way1.nodes[2], way2.nodes[0]);
    });

    await t.test('does replace target node', t => {
      const result = Rapid.actionExtract('c')(graph);
      assert.ok(result instanceof Rapid.Graph);

      const way1 = result.entity('-');
      const replacement = result.entity(way1.nodes[0]);
      assert.notEqual(replacement.id, 'c');     // Confirm that the replacement is no longer 'c'
      assert.deepEqual(replacement.tags, {});   // and that the tags are not present
    });

    await t.test('does detach target node', t => {
      const result = Rapid.actionExtract('c')(graph);
      assert.ok(result instanceof Rapid.Graph);

      const target = result.entity('c');
      assert.ok(target instanceof Rapid.osmNode);       // Confirm that 'c' still exists, and…
      assert.deepEqual(target.loc, [1, 1]);             // the location is correct
      assert.deepEqual(target.tags, tags);              // the tags are intact
      assert.deepEqual(result.parentWays(target), []);  // the target has detached from the ways
    });
  });


  await t.test('with relation', async t => {
    let graph;

    beforeEach(() => {
      //
      // a -- b -- c
      //
      // Node b represents the target
      // With a relationship for the way including b
      //
      graph = new Rapid.Graph([
        Rapid.osmNode({ id: 'a', loc: [0, 0] }),
        Rapid.osmNode({ id: 'b', loc: [1, 0], tags: tags }),
        Rapid.osmNode({ id: 'c', loc: [2, 0] }),
        Rapid.osmWay({ id: '-', nodes: ['a', 'b', 'c'] }),
        Rapid.osmRelation({id: 'r', tags: {type: 'route', route: 'foot'},
          members: [
            { id: 'a', type: 'node', role: 'point' },
            { id: 'b', type: 'node', role: 'point' },
            { id: 'c', type: 'node', role: 'point' }
          ]
        })
      ]);
    });

    await t.test('target is not a member of relation', t => {
      const result = Rapid.actionExtract('b')(graph);
      assert.ok(result instanceof Rapid.Graph);

      // Confirm is not a member of the relation
      const target = result.entity('b');
      assert.deepEqual(result.parentRelations(target), []);  // the target has removed from the relation
    });

    await t.test('replacement is a member of relation', t => {
      const result = Rapid.actionExtract('b')(graph);
      assert.ok(result instanceof Rapid.Graph);

      // Find the new node
      const way = result.entity('-');
      const replacement = result.entity(way.nodes[1]);

      // Confirm replacement is a member of the relation
      const parents = result.parentRelations(replacement);
      assert.equal(parents.length, 1);
      assert.equal(parents[0].id, 'r');
    });

    await t.test('Relation membership has the same properties', t => {
      const result = Rapid.actionExtract('b')(graph);

      const way = result.entity('-');
      const replacement = result.entity(way.nodes[1]);
      const relation = result.entity('r');

      // Confirm membership is the same as original (except for the new id)
      const targetMember = relation.memberById(replacement.id);
      assert.deepEqual(targetMember, { id: replacement.id, index: 1, type: 'node', role: 'point' });
    });

  });
});
