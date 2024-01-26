import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';


describe('Graph', () => {

  describe('constructor', () => {
    it('accepts an entities Array', () => {
      const entity = Rapid.osmEntity();
      const graph = new Rapid.Graph([entity]);
      assert.ok(graph instanceof Rapid.Graph);
      assert.equal(graph.entity(entity.id), entity);
    });

    it('accepts a Graph', () => {
      const entity = Rapid.osmEntity();
      const graph1 = new Rapid.Graph([entity]);
      const graph2 = new Rapid.Graph(graph1);
      assert.equal(graph2.entity(entity.id), entity);
    });

    it('shallow copies other\'s entities', () => {
      const entity = Rapid.osmEntity();
      const graph1 = new Rapid.Graph([entity]);
      const graph2 = new Rapid.Graph(graph1);
      assert.notEqual(graph1.local, graph2.local);
      assert.notEqual(graph1.local.entities, graph2.local.entities);
    });

    it('shares base data among chain of Graphs', () => {
      const graph1 = new Rapid.Graph();
      const graph2 = new Rapid.Graph(graph1);
      assert.equal(graph1.base, graph2.base);
    });

    it('freezes by default', () => {
      assert.equal(new Rapid.Graph().frozen, true);
    });

    it('remains mutable if passed true as second argument', () => {
      assert.equal(new Rapid.Graph([], true).frozen, false);
    });
  });

  describe('#hasEntity', () => {
    it('returns the entity when present', () => {
      const node = Rapid.osmNode();
      const graph = new Rapid.Graph([node]);
      assert.equal(graph.hasEntity(node.id), node);
    });

    it('returns undefined when the entity is not present', () => {
      assert.equal(new Rapid.Graph().hasEntity('1'), undefined);
    });
  });

  describe('#entity', () => {
    it('returns the entity when present', () => {
      const node = Rapid.osmNode();
      const graph = new Rapid.Graph([node]);
      assert.equal(graph.entity(node.id), node);
    });

    it('throws when the entity is not present', () => {
      assert.throws(() => { Rapid.Graph().entity('1'); });
    });
  });

  describe('#rebase', () => {
    it('preserves existing entities', () => {
      const node = Rapid.osmNode({ id: 'n' });
      const graph = new Rapid.Graph([node]);
      graph.rebase([], [graph]);
      assert.equal(graph.entity('n'), node);
    });

    it('includes new entities', () => {
      const node = Rapid.osmNode({ id: 'n' });
      const graph = new Rapid.Graph();
      graph.rebase([node], [graph]);
      assert.equal(graph.entity('n'), node);
    });

    it('doesn\'t rebase deleted entities', () => {
      const node = Rapid.osmNode({ id: 'n', visible: false });
      const graph = new Rapid.Graph();
      graph.rebase([node], [graph]);
      assert.ok(!graph.hasEntity('n'));
    });

    it('gives precedence to existing entities', () => {
      const a = Rapid.osmNode({ id: 'n' });
      const b = Rapid.osmNode({ id: 'n' });
      const graph = new Rapid.Graph([a]);
      graph.rebase([b], [graph]);
      assert.equal(graph.entity('n'), a);
    });

    it('gives precedence to new entities when force = true', () => {
      const a = Rapid.osmNode({ id: 'n' });
      const b = Rapid.osmNode({ id: 'n' });
      const graph = new Rapid.Graph([a]);
      graph.rebase([b], [graph], true);
      assert.equal(graph.entity('n'), b);
    });

    it('inherits entities from base', () => {
      const graph = new Rapid.Graph();
      graph.rebase([Rapid.osmNode({ id: 'n' })], [graph]);
      assert.ok(!graph.local.entities.has('n'));
      assert.ok(graph.base.entities.has('n'));
    });

    it('updates parentWays', () => {
      const n = Rapid.osmNode({ id: 'n' });
      const w1 = Rapid.osmWay({ id: 'w1', nodes: ['n'] });
      const w2 = Rapid.osmWay({ id: 'w2', nodes: ['n'] });
      const graph = new Rapid.Graph([n, w1]);
      graph.rebase([w2], [graph]);

      const parents = graph.parentWays(n);
      assert.ok(parents instanceof Array);
      assert.ok(parents.includes(w1));
      assert.ok(parents.includes(w2));
      assert.ok(!graph.local.parentWays.has('n'));
      assert.ok(graph.base.parentWays.has('n'));
    });

    it('avoids adding duplicate parentWays', () => {
      const n = Rapid.osmNode({ id: 'n' });
      const w1 = Rapid.osmWay({ id: 'w1', nodes: ['n'] });
      const graph = new Rapid.Graph([n, w1]);
      graph.rebase([w1], [graph]);
      assert.deepEqual(graph.parentWays(n), [w1]);
    });

    it('updates parentWays for nodes with modified parentWays', () => {
      const n = Rapid.osmNode({ id: 'n' });
      const w1 = Rapid.osmWay({ id: 'w1', nodes: ['n'] });
      const w2 = Rapid.osmWay({ id: 'w2', nodes: ['n'] });
      const w3 = Rapid.osmWay({ id: 'w3', nodes: ['n'] });
      const graph = new Rapid.Graph([n, w1]);
      const graph2 = graph.replace(w2);
      graph.rebase([w3], [graph, graph2]);

      const parents = graph2.parentWays(n);
      assert.ok(parents instanceof Array);
      assert.ok(parents.includes(w1));
      assert.ok(parents.includes(w2));
      assert.ok(parents.includes(w3));
    });

    it('avoids re-adding a modified way as a parent way', () => {
      const n1 = Rapid.osmNode({ id: 'n1' });
      const n2 = Rapid.osmNode({ id: 'n2' });
      const w1 = Rapid.osmWay({ id: 'w1', nodes: ['n1', 'n2'] });
      const w2 = w1.removeNode('n2');
      const graph = new Rapid.Graph([n1, n2, w1]);
      const graph2 = graph.replace(w2);
      graph.rebase([w1], [graph, graph2]);
      assert.deepEqual(graph2.parentWays(n2), []);
    });

    it('avoids re-adding a deleted way as a parent way', () => {
      const n = Rapid.osmNode({ id: 'n' });
      const w1 = Rapid.osmWay({ id: 'w1', nodes: ['n'] });
      const graph = new Rapid.Graph([n, w1]);
      const graph2 = graph.remove(w1);
      graph.rebase([w1], [graph, graph2]);
      assert.deepEqual(graph2.parentWays(n), []);
    });

    it('re-adds a deleted node that is discovered to have another parent', () => {
      const n = Rapid.osmNode({ id: 'n' });
      const w1 = Rapid.osmWay({ id: 'w1', nodes: ['n'] });
      const w2 = Rapid.osmWay({ id: 'w2', nodes: ['n'] });
      const graph = new Rapid.Graph([n, w1]);
      const graph2 = graph.remove(n);
      graph.rebase([n, w2], [graph, graph2]);
      assert.equal(graph2.entity('n'), n);
    });

    it('updates parentRelations', () => {
      const n = Rapid.osmNode({ id: 'n' });
      const r1 = Rapid.osmRelation({ id: 'r1', members: [{ id: 'n'}] });
      const r2 = Rapid.osmRelation({ id: 'r2', members: [{ id: 'n'}] });
      const graph = new Rapid.Graph([n, r1]);
      graph.rebase([r2], [graph]);

      const parents = graph.parentRelations(n);
      assert.ok(parents instanceof Array);
      assert.ok(parents.includes(r1));
      assert.ok(parents.includes(r2));
      assert.ok(!graph.local.parentRels.has('n'));
      assert.ok(graph.base.parentRels.has('n'));
    });

    it('avoids re-adding a modified relation as a parent relation', () => {
      const n = Rapid.osmNode({ id: 'n' });
      const r1 = Rapid.osmRelation({ id: 'r1', members: [{ id: 'n'}] });
      const r2 = r1.removeMembersWithID('n');
      const graph = new Rapid.Graph([n, r1]);
      const graph2 = graph.replace(r2);
      graph.rebase([r1], [graph, graph2]);
      assert.deepEqual(graph2.parentRelations(n), []);
    });

    it('avoids re-adding a deleted relation as a parent relation', () => {
      const n = Rapid.osmNode({ id: 'n' });
      const r1 = Rapid.osmRelation({ id: 'r1', members: [{ id: 'n'}] });
      const graph = new Rapid.Graph([n, r1]);
      const graph2 = graph.remove(r1);
      graph.rebase([r1], [graph, graph2]);
      assert.deepEqual(graph2.parentRelations(n), []);
    });

    it('updates parentRels for nodes with modified parentWays', () => {
      const n = Rapid.osmNode({ id: 'n' });
      const r1 = Rapid.osmRelation({ id: 'r1', members: [{ id: 'n'}] });
      const r2 = Rapid.osmRelation({ id: 'r2', members: [{ id: 'n'}] });
      const r3 = Rapid.osmRelation({ id: 'r3', members: [{ id: 'n'}] });
      const graph = new Rapid.Graph([n, r1]);
      const graph2 = graph.replace(r2);
      graph.rebase([r3], [graph, graph2]);

      const parents = graph2.parentRelations(n);
      assert.ok(parents instanceof Array);
      assert.ok(parents.includes(r1));
      assert.ok(parents.includes(r2));
      assert.ok(parents.includes(r3));
    });

    it('invalidates transients', () => {
      const n = Rapid.osmNode({ id: 'n' });
      const w1 = Rapid.osmWay({ id: 'w1', nodes: ['n'] });
      const w2 = Rapid.osmWay({ id: 'w2', nodes: ['n'] });
      const graph = new Rapid.Graph([n, w1]);

      function numParents(entity) {
        return graph.transient(entity, 'numParents', () => {
          return graph.parentWays(entity).length;
        });
      }

      assert.equal(numParents(n), 1);
      graph.rebase([w2], [graph]);
      assert.equal(numParents(n), 2);
    });
  });

  describe('#remove', () => {
    it('returns a new graph', () => {
      const node = Rapid.osmNode();
      const graph = new Rapid.Graph([node]);
      const result = graph.remove(node);
      assert.ok(result instanceof Rapid.Graph);
      assert.notEqual(result, graph);
    });

    it('doesn\'t modify the receiver', () => {
      const node = Rapid.osmNode();
      const graph = new Rapid.Graph([node]);
      graph.remove(node);
      assert.equal(graph.entity(node.id), node);
    });

    it('removes the entity from the result', () => {
      const node = Rapid.osmNode();
      const graph = new Rapid.Graph([node]);
      assert.equal(graph.remove(node).hasEntity(node.id), undefined);
    });

    it('removes the entity as a parentWay', () => {
      const node = Rapid.osmNode({ id: 'n' });
      const w1 = Rapid.osmWay({ id: 'w', nodes: ['n'] });
      const graph = new Rapid.Graph([node, w1]);
      assert.deepEqual(graph.remove(w1).parentWays(node), []);
    });

    it('removes the entity as a parentRelation', () => {
      const node = Rapid.osmNode({ id: 'n' });
      const r1 = Rapid.osmRelation({ id: 'w', members: [{ id: 'n' }] });
      const graph = new Rapid.Graph([node, r1]);
      assert.deepEqual(graph.remove(r1).parentRelations(node), []);
    });
  });

  describe('#replace', () => {
    it('is a no-op if the replacement is identical to the existing entity', () => {
      const node = Rapid.osmNode();
      const graph = new Rapid.Graph([node]);
      assert.equal(graph.replace(node), graph);
    });

    it('returns a new graph', () => {
      const node = Rapid.osmNode();
      const graph = new Rapid.Graph([node]);
      const result = graph.replace(node.update());
      assert.ok(result instanceof Rapid.Graph);
      assert.notEqual(result, graph);
    });

    it('doesn\'t modify the receiver', () => {
      const node = Rapid.osmNode();
      const graph = new Rapid.Graph([node]);
      graph.replace(node);
      assert.equal(graph.entity(node.id), node);
    });

    it('replaces the entity in the result', () => {
      const node1 = Rapid.osmNode();
      const node2 = node1.update({});
      const graph = new Rapid.Graph([node1]);
      assert.equal(graph.replace(node2).entity(node2.id), node2);
    });

    it('adds parentWays', () => {
      const node = Rapid.osmNode({ id: 'n' });
      const w1 = Rapid.osmWay({ id: 'w', nodes: ['n'] });
      const graph = new Rapid.Graph([node]);
      const result = graph.replace(w1);
      const parents = result.parentWays(node);
      assert.ok(parents.includes(w1));
    });

    it('removes parentWays', () => {
      const node = Rapid.osmNode({ id: 'n' });
      const w1 = Rapid.osmWay({ id: 'w1', nodes: ['n'] });
      const graph = new Rapid.Graph([node, w1]);
      const result = graph.replace(Rapid.osmWay({ id: 'w1', nodes: [] }));
      assert.deepEqual(result.parentWays(node), []);
    });

    it('doesn\'t add duplicate parentWays', () => {
      const node = Rapid.osmNode({ id: 'n' });
      const w1 = Rapid.osmWay({ id: 'w', nodes: ['n'] });
      const graph = new Rapid.Graph([node, w1]);
      assert.deepEqual(graph.replace(w1).parentWays(node), [w1]);
    });

    it('adds parentRelations', () => {
      const node = Rapid.osmNode({ id: 'n' });
      const r1 = Rapid.osmRelation({ id: 'r', members: [{ id: 'n'}] });
      const graph = new Rapid.Graph([node]);
      const result = graph.replace(r1);
      const parents = result.parentRelations(node);
      assert.ok(parents.includes(r1));
    });

    it('removes parentRelations', () => {
      const node = Rapid.osmNode({ id: 'n' });
      const r1 = Rapid.osmRelation({ id: 'r', members: [{ id: 'n'}] });
      const graph = new Rapid.Graph([node, r1]);
      const result = graph.replace(Rapid.osmRelation({ id: 'r', members: [] }));
      assert.deepEqual(result.parentRelations(node), []);
    });

    it('doesn\'t add duplicate parentRelations', () => {
      const node = Rapid.osmNode({ id: 'n' });
      const r1 = Rapid.osmRelation({ id: 'r', members: [{ id: 'n'}] });
      const graph = new Rapid.Graph([node, r1]);
      assert.deepEqual(graph.replace(r1).parentRelations(node), [r1]);
    });
  });

  describe('#revert', () => {
    it('is a no-op if the head entity is identical to the base entity', () => {
      const n1 = Rapid.osmNode({ id: 'n' });
      const graph = new Rapid.Graph([n1]);
      assert.equal(graph.revert('n'), graph);
    });

    it('returns a new graph', () => {
      const n1 = Rapid.osmNode({ id: 'n' });
      const n2 = n1.update({});
      const graph = new Rapid.Graph([n1]).replace(n2);
      const result = graph.revert('n');
      assert.ok(result instanceof Rapid.Graph);
      assert.notEqual(result, graph);
    });

    it('doesn\'t modify the receiver', () => {
      const n1 = Rapid.osmNode({ id: 'n' });
      const n2 = n1.update({});
      const graph = new Rapid.Graph([n1]).replace(n2);
      graph.revert('n');
      assert.equal(graph.hasEntity('n'), n2);
    });

    it('removes a new entity', () => {
      const n1 = Rapid.osmNode({ id: 'n' });
      let graph = new Rapid.Graph().replace(n1);
      graph = graph.revert('n');
      assert.equal(graph.hasEntity('n'), undefined);
    });

    it('reverts an updated entity to the base version', () => {
      const n1 = Rapid.osmNode({ id: 'n' });
      const n2 = n1.update({});
      let graph = new Rapid.Graph([n1]).replace(n2);
      graph = graph.revert('n');
      assert.equal(graph.hasEntity('n'), n1);
    });

    it('restores a deleted entity', () => {
      const n1 = Rapid.osmNode({ id: 'n' });
      let graph = new Rapid.Graph([n1]).remove(n1);
      graph = graph.revert('n');
      assert.equal(graph.hasEntity('n'), n1);
    });

    it('removes new parentWays', () => {
      const n1 = Rapid.osmNode({ id: 'n' });
      const w1 = Rapid.osmWay({ id: 'w', nodes: ['n'] });
      let graph = new Rapid.Graph().replace(n1).replace(w1);
      graph = graph.revert('w');
      assert.equal(graph.hasEntity('n'), n1);
      assert.deepEqual(graph.parentWays(n1), []);
    });

    it('removes new parentRelations', () => {
      const n1 = Rapid.osmNode({ id: 'n' });
      const r1 = Rapid.osmRelation({ id: 'r', members: [{ id: 'n'}] });
      let graph = new Rapid.Graph().replace(n1).replace(r1);
      graph = graph.revert('r');
      assert.equal(graph.hasEntity('n'), n1);
      assert.deepEqual(graph.parentRelations(n1), []);
    });

    it('reverts updated parentWays', () => {
      const n1 = Rapid.osmNode({ id: 'n' });
      const w1 = Rapid.osmWay({ id: 'w', nodes: ['n'] });
      const w2 = w1.removeNode('n');
      let graph = new Rapid.Graph([n1, w1]).replace(w2);
      graph = graph.revert('w');
      assert.equal(graph.hasEntity('n'), n1);
      assert.deepEqual(graph.parentWays(n1), [w1]);
    });

    it('reverts updated parentRelations', () => {
      const n1 = Rapid.osmNode({ id: 'n' });
      const r1 = Rapid.osmRelation({ id: 'r', members: [{ id: 'n'}] });
      const r2 = r1.removeMembersWithID('n');
      let graph = new Rapid.Graph([n1, r1]).replace(r2);
      graph = graph.revert('r');
      assert.equal(graph.hasEntity('n'), n1);
      assert.deepEqual(graph.parentRelations(n1), [r1]);
    });

    it('restores deleted parentWays', () => {
      const n1 = Rapid.osmNode({ id: 'n' });
      const w1 = Rapid.osmWay({ id: 'w', nodes: ['n'] });
      let graph = new Rapid.Graph([n1, w1]).remove(w1);
      graph = graph.revert('w');
      assert.equal(graph.hasEntity('n'), n1);
      assert.deepEqual(graph.parentWays(n1), [w1]);
    });

    it('restores deleted parentRelations', () => {
      const n1 = Rapid.osmNode({ id: 'n' });
      const r1 = Rapid.osmRelation({ id: 'r', members: [{ id: 'n'}] });
      let graph = new Rapid.Graph([n1, r1]).remove(r1);
      graph = graph.revert('r');
      assert.equal(graph.hasEntity('n'), n1);
      assert.deepEqual(graph.parentRelations(n1), [r1]);
    });
  });

  describe('#update', () => {
    it('returns a new graph if self is frozen', () => {
      const graph = new Rapid.Graph();
      const result = graph.update();
      assert.ok(result instanceof Rapid.Graph);
      assert.notEqual(result, graph);
    });

    it('returns self if self is not frozen', () => {
      const graph = new Rapid.Graph([], true);
      const result = graph.update();
      assert.ok(result instanceof Rapid.Graph);
      assert.equal(result, graph);
    });

    it('doesn\'t modify self is self is frozen', () => {
      const node = Rapid.osmNode();
      const graph = new Rapid.Graph([node]);
      graph.update(function (graph) { graph.remove(node); });
      assert.equal(graph.entity(node.id), node);
    });

    it('modifies self is self is not frozen', () => {
      const node = Rapid.osmNode();
      const graph = new Rapid.Graph([node], true);
      graph.update(function (graph) { graph.remove(node); });
      assert.equal(graph.hasEntity(node.id), undefined);
    });

    it('executes all of the given functions', () => {
      const a = Rapid.osmNode();
      const b = Rapid.osmNode();
      let graph = new Rapid.Graph([a]);
      graph = graph.update(
        function (graph) { graph.remove(a); },
        function (graph) { graph.replace(b); }
      );

      assert.equal(graph.hasEntity(a.id), undefined);
      assert.equal(graph.entity(b.id), b);
    });
  });

  describe('#parentWays', () => {
    it('returns an array of ways that contain the given node id', () => {
      const n1 = Rapid.osmNode({ id: 'n1' });
      const n2 = Rapid.osmNode({ id: 'n2' });
      const w1 = Rapid.osmWay({ id: 'w1', nodes: ['n1'] });
      const graph = new Rapid.Graph([n1, n2, w1]);
      assert.deepEqual(graph.parentWays(n1), [w1]);
      assert.deepEqual(graph.parentWays(n2), []);
      assert.deepEqual(graph.parentWays(w1), []);
    });
  });

  describe('#parentRelations', () => {
    it('returns an array of relations that contain the given entity id', () => {
      const n1 = Rapid.osmNode({ id: 'n1' });
      const n2 = Rapid.osmNode({ id: 'n2' });
      const r1 = Rapid.osmRelation({ id: 'r1', members: [{ id: 'n1', role: 'from' }] });
      const graph = new Rapid.Graph([n1, n2, r1]);
      assert.deepEqual(graph.parentRelations(n1), [r1]);
      assert.deepEqual(graph.parentRelations(n2), []);
      assert.deepEqual(graph.parentRelations(r1), []);
    });
  });

  describe('#childNodes', () => {
    it('returns an array of child nodes', () => {
      const n1 = Rapid.osmNode({ id: 'n1' });
      const n2 = Rapid.osmNode({ id: 'n2' });
      const w1 = Rapid.osmWay({ id: 'w1', nodes: ['n1'] });
      const graph = new Rapid.Graph([n1, n2, w1]);
      assert.deepEqual(graph.childNodes(n1), []);
      assert.deepEqual(graph.childNodes(n2), []);
      assert.deepEqual(graph.childNodes(w1), [n1]);
    });
  });
});
