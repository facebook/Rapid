import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';


describe('Tree', () => {

  describe('#rebase', () => {
    it('adds entities to the tree', () => {
      const graph = new Rapid.Graph();
      const tree = new Rapid.Tree(graph);
      const node = Rapid.osmNode({id: 'n', loc: [1, 1]});

      graph.rebase([node], [graph]);
      tree.rebase([node]);

      const result = tree.intersects(new Rapid.sdk.Extent([0, 0], [2, 2]), graph);
      assert.deepEqual(result, [node]);
    });

    it('is idempotent', () => {
      const graph = new Rapid.Graph();
      const tree = new Rapid.Tree(graph);
      const node = Rapid.osmNode({id: 'n', loc: [1, 1]});
      const extent = new Rapid.sdk.Extent([0, 0], [2, 2]);

      graph.rebase([node], [graph]);
      tree.rebase([node]);
      assert.deepEqual(tree.intersects(extent, graph), [node]);

      graph.rebase([node], [graph]);
      tree.rebase([node]);
      assert.deepEqual(tree.intersects(extent, graph), [node]);
    });

    it('does not insert if entity has a modified version', () => {
      const g1 = new Rapid.Graph();
      const tree = new Rapid.Tree(g1);
      const n1 = Rapid.osmNode({id: 'n', loc: [1, 1]});
      const n2 = n1.update({loc: [10, 10]});
      const g2 = g1.replace(n2);

      assert.deepEqual(tree.intersects(new Rapid.sdk.Extent([9, 9], [11, 11]), g2), [n2]);

      g1.rebase([n1], [g1]);
      tree.rebase([n1]);

      assert.deepEqual(tree.intersects(new Rapid.sdk.Extent([0, 0], [2, 2]), g2), []);
      assert.deepEqual(tree.intersects(new Rapid.sdk.Extent([0, 0], [11, 11]), g2), [n2]);
    });

    it('does not error on self-referencing relations', () => {
      const graph = new Rapid.Graph();
      const tree = new Rapid.Tree(graph);
      const node = Rapid.osmNode({id: 'n', loc: [1, 1]});
      let relation = Rapid.osmRelation();

      relation = relation.addMember({id: node.id});
      relation = relation.addMember({id: relation.id});

      graph.rebase([node, relation], [graph]);
      tree.rebase([relation]);

      assert.deepEqual(tree.intersects(new Rapid.sdk.Extent([0, 0], [2, 2]), graph), [relation]);
    });

    it('adjusts entities that are force-rebased', () => {
      const graph = new Rapid.Graph();
      const tree = new Rapid.Tree(graph);
      let node = Rapid.osmNode({id: 'n', loc: [1, 1]});

      graph.rebase([node], [graph]);
      tree.rebase([node]);

      node = node.move([-1, -1]);
      graph.rebase([node], [graph], true);
      tree.rebase([node], true);

      assert.deepEqual(tree.intersects(new Rapid.sdk.Extent([0, 0], [2, 2]), graph), []);
    });
  });


  describe('#intersects', () => {
    it('includes entities within extent, excludes those without', () => {
      let graph = new Rapid.Graph();
      const tree = new Rapid.Tree(graph);
      const n1 = Rapid.osmNode({loc: [1, 1]});
      const n2 = Rapid.osmNode({loc: [3, 3]});
      const extent = new Rapid.sdk.Extent([0, 0], [2, 2]);

      graph = graph.replace(n1).replace(n2);
      assert.deepEqual(tree.intersects(extent, graph), [n1]);
    });

    it('includes intersecting relations after incomplete members are loaded', () => {
      const graph = new Rapid.Graph();
      const tree = new Rapid.Tree(graph);
      const n1 = Rapid.osmNode({id: 'n1', loc: [0, 0]});
      const n2 = Rapid.osmNode({id: 'n2', loc: [1, 1]});
      const relation = Rapid.osmRelation({id: 'r', members: [{id: 'n1'}, {id: 'n2'}]});
      const extent = new Rapid.sdk.Extent([0.5, 0.5], [1.5, 1.5]);

      graph.rebase([relation, n1], [graph]);
      tree.rebase([relation, n1]);
      assert.deepEqual(tree.intersects(extent, graph), []);

      graph.rebase([n2], [graph]);
      tree.rebase([n2]);
      assert.deepEqual(tree.intersects(extent, graph), [n2, relation]);
    });

    // This happens when local storage includes a changed way but not its nodes.
    it('includes intersecting ways after missing nodes are loaded', () => {
      const base = new Rapid.Graph();
      const tree = new Rapid.Tree(base);
      const node = Rapid.osmNode({id: 'n', loc: [0.5, 0.5]});
      const way = Rapid.osmWay({nodes: ['n']});
      const graph = base.replace(way);
      const extent = new Rapid.sdk.Extent([0, 0], [1, 1]);

      assert.deepEqual(tree.intersects(extent, graph), []);

      base.rebase([node], [base, graph]);
      tree.rebase([node]);
      assert.deepEqual(tree.intersects(extent, graph), [node, way]);
    });

    it('adjusts parent ways when a member node is moved', () => {
      let graph = new Rapid.Graph();
      const tree = new Rapid.Tree(graph);
      const node = Rapid.osmNode({id: 'n', loc: [1, 1]});
      const way = Rapid.osmWay({nodes: ['n']});
      const extent = new Rapid.sdk.Extent([0, 0], [2, 2]);

      graph = graph.replace(node).replace(way);
      assert.deepEqual(tree.intersects(extent, graph), [node, way]);

      graph = graph.replace(node.move([3, 3]));
      assert.deepEqual(tree.intersects(extent, graph), []);
    });

    it('adjusts parent relations when a member node is moved', () => {
      let graph = new Rapid.Graph();
      const tree = new Rapid.Tree(graph);
      const node = Rapid.osmNode({id: 'n', loc: [1, 1]});
      const relation = Rapid.osmRelation({members: [{type: 'node', id: 'n'}]});
      const extent = new Rapid.sdk.Extent([0, 0], [2, 2]);

      graph = graph.replace(node).replace(relation);
      assert.deepEqual(tree.intersects(extent, graph), [node, relation]);

      graph = graph.replace(node.move([3, 3]));
      assert.deepEqual(tree.intersects(extent, graph), []);
    });

    it('adjusts parent relations of parent ways when a member node is moved', () => {
      let graph = new Rapid.Graph();
      const tree = new Rapid.Tree(graph);
      const node = Rapid.osmNode({id: 'n', loc: [1, 1]});
      const way = Rapid.osmWay({id: 'w', nodes: ['n']});
      const relation = Rapid.osmRelation({members: [{type: 'multipolygon', id: 'w'}]});
      const extent = new Rapid.sdk.Extent([0, 0], [2, 2]);

      graph = graph.replace(node).replace(way).replace(relation);
      assert.deepEqual(tree.intersects(extent, graph), [node, way, relation]);

      graph = graph.replace(node.move([3, 3]));
      assert.deepEqual(tree.intersects(extent, graph), []);
    });

    it('adjusts parent ways when a member node is removed', () => {
      let graph = new Rapid.Graph();
      const tree = new Rapid.Tree(graph);
      const n1 = Rapid.osmNode({id: 'n1', loc: [1, 1]});
      const n2 = Rapid.osmNode({id: 'n2', loc: [3, 3]});
      const way = Rapid.osmWay({nodes: ['n1', 'n2']});
      const extent = new Rapid.sdk.Extent([0, 0], [2, 2]);

      graph = graph.replace(n1).replace(n2).replace(way);
      assert.deepEqual(tree.intersects(extent, graph), [n1, way]);

      graph = graph.replace(way.removeNode('n1'));
      assert.deepEqual(tree.intersects(extent, graph), [n1]);
    });

    it('don\'t include parent way multiple times when multiple child nodes are moved', () => {
      // checks against the following regression: https://github.com/openstreetmap/iD/issues/1978
      let graph = new Rapid.Graph();
      const tree = new Rapid.Tree(graph);
      const n1 = Rapid.osmNode({id: 'n1', loc: [1, 1]});
      const n2 = Rapid.osmNode({id: 'n2', loc: [3, 3]});
      const way = Rapid.osmWay({id: 'w1', nodes: ['n1', 'n2']});
      const extent = new Rapid.sdk.Extent([0, 0], [4, 4]);

      graph = graph.replace(n1).replace(n2).replace(way);
      assert.deepEqual(tree.intersects(extent, graph), [n1, n2, way]);

      graph = graph.replace(n1.move([1.1, 1.1])).replace(n2.move([2.1, 2.1]));
      const intersects = tree.intersects(extent, graph).map(e => e.id);
      assert.ok(intersects.includes('n1'));
      assert.ok(intersects.includes('n2'));
      assert.ok(intersects.includes('w1'));
    });

    it('doesn\'t include removed entities', () => {
      let graph = new Rapid.Graph();
      const tree = new Rapid.Tree(graph);
      const node = Rapid.osmNode({loc: [1, 1]});
      const extent = new Rapid.sdk.Extent([0, 0], [2, 2]);

      graph = graph.replace(node);
      assert.deepEqual(tree.intersects(extent, graph), [node]);

      graph = graph.remove(node);
      assert.deepEqual(tree.intersects(extent, graph), []);
    });

    it('doesn\'t include removed entities after rebase', () => {
      const base = new Rapid.Graph();
      const tree = new Rapid.Tree(base);
      const node = Rapid.osmNode({id: 'n', loc: [1, 1]});
      const extent = new Rapid.sdk.Extent([0, 0], [2, 2]);

      const graph = base.replace(node).remove(node);
      assert.deepEqual(tree.intersects(extent, graph), []);

      base.rebase([node], [base]);
      tree.rebase([node]);
      assert.deepEqual(tree.intersects(extent, graph), []);
    });

    it('handles recursive relations', () => {
      const base = new Rapid.Graph();
      const tree = new Rapid.Tree(base);
      const node = Rapid.osmNode({id: 'n', loc: [1, 1]});
      const r1   = Rapid.osmRelation({id: 'r1', members: [{id: 'n'}]});
      const r2   = Rapid.osmRelation({id: 'r2', members: [{id: 'r1'}]});
      const extent = new Rapid.sdk.Extent([0, 0], [2, 2]);

      const graph = base.replace(r1).replace(r2);
      assert.deepEqual(tree.intersects(extent, graph), []);

      base.rebase([node], [base, graph]);
      tree.rebase([node]);
      assert.deepEqual(tree.intersects(extent, graph), [node, r1, r2]);
    });
  });
});
