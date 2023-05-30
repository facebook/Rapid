describe('Tree', () => {

  describe('#rebase', () => {
    it('adds entities to the tree', () => {
      const graph = new Rapid.Graph();
      const tree = new Rapid.Tree(graph);
      const node = Rapid.osmNode({id: 'n', loc: [1, 1]});

      graph.rebase([node], [graph]);
      tree.rebase([node]);

      expect(tree.intersects(new sdk.Extent([0, 0], [2, 2]), graph)).to.eql([node]);
    });

    it('is idempotent', () => {
      const graph = new Rapid.Graph();
      const tree = new Rapid.Tree(graph);
      const node = Rapid.osmNode({id: 'n', loc: [1, 1]});
      const extent = new sdk.Extent([0, 0], [2, 2]);

      graph.rebase([node], [graph]);
      tree.rebase([node]);
      expect(tree.intersects(extent, graph)).to.eql([node]);

      graph.rebase([node], [graph]);
      tree.rebase([node]);
      expect(tree.intersects(extent, graph)).to.eql([node]);
    });

    it('does not insert if entity has a modified version', () => {
      const g1 = new Rapid.Graph();
      const tree = new Rapid.Tree(g1);
      const n1 = Rapid.osmNode({id: 'n', loc: [1, 1]});
      const n2 = n1.update({loc: [10, 10]});
      const g2 = g1.replace(n2);

      expect(tree.intersects(new sdk.Extent([9, 9], [11, 11]), g2)).to.eql([n2]);

      g1.rebase([n1], [g1]);
      tree.rebase([n1]);

      expect(tree.intersects(new sdk.Extent([0, 0], [2, 2]), g2)).to.eql([]);
      expect(tree.intersects(new sdk.Extent([0, 0], [11, 11]), g2)).to.eql([n2]);
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

      expect(tree.intersects(new sdk.Extent([0, 0], [2, 2]), graph)).to.eql([relation]);
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

      expect(tree.intersects(new sdk.Extent([0, 0], [2, 2]), graph)).to.eql([]);
    });
  });

  describe('#intersects', () => {
    it('includes entities within extent, excludes those without', () => {
      let graph = new Rapid.Graph();
      const tree = new Rapid.Tree(graph);
      const n1 = Rapid.osmNode({loc: [1, 1]});
      const n2 = Rapid.osmNode({loc: [3, 3]});
      const extent = new sdk.Extent([0, 0], [2, 2]);

      graph = graph.replace(n1).replace(n2);
      expect(tree.intersects(extent, graph)).to.eql([n1]);
    });

    it('includes intersecting relations after incomplete members are loaded', () => {
      const graph = new Rapid.Graph();
      const tree = new Rapid.Tree(graph);
      const n1 = Rapid.osmNode({id: 'n1', loc: [0, 0]});
      const n2 = Rapid.osmNode({id: 'n2', loc: [1, 1]});
      const relation = Rapid.osmRelation({id: 'r', members: [{id: 'n1'}, {id: 'n2'}]});
      const extent = new sdk.Extent([0.5, 0.5], [1.5, 1.5]);

      graph.rebase([relation, n1], [graph]);
      tree.rebase([relation, n1]);
      expect(tree.intersects(extent, graph)).to.eql([]);

      graph.rebase([n2], [graph]);
      tree.rebase([n2]);
      expect(tree.intersects(extent, graph)).to.eql([n2, relation]);
    });

    // This happens when local storage includes a changed way but not its nodes.
    it('includes intersecting ways after missing nodes are loaded', () => {
      const base = new Rapid.Graph();
      const tree = new Rapid.Tree(base);
      const node = Rapid.osmNode({id: 'n', loc: [0.5, 0.5]});
      const way = Rapid.osmWay({nodes: ['n']});
      const graph = base.replace(way);
      const extent = new sdk.Extent([0, 0], [1, 1]);

      expect(tree.intersects(extent, graph)).to.eql([]);

      base.rebase([node], [base, graph]);
      tree.rebase([node]);
      expect(tree.intersects(extent, graph)).to.eql([node, way]);
    });

    it('adjusts parent ways when a member node is moved', () => {
      let graph = new Rapid.Graph();
      const tree = new Rapid.Tree(graph);
      const node = Rapid.osmNode({id: 'n', loc: [1, 1]});
      const way = Rapid.osmWay({nodes: ['n']});
      const extent = new sdk.Extent([0, 0], [2, 2]);

      graph = graph.replace(node).replace(way);
      expect(tree.intersects(extent, graph)).to.eql([node, way]);

      graph = graph.replace(node.move([3, 3]));
      expect(tree.intersects(extent, graph)).to.eql([]);
    });

    it('adjusts parent relations when a member node is moved', () => {
      let graph = new Rapid.Graph();
      const tree = new Rapid.Tree(graph);
      const node = Rapid.osmNode({id: 'n', loc: [1, 1]});
      const relation = Rapid.osmRelation({members: [{type: 'node', id: 'n'}]});
      const extent = new sdk.Extent([0, 0], [2, 2]);

      graph = graph.replace(node).replace(relation);
      expect(tree.intersects(extent, graph)).to.eql([node, relation]);

      graph = graph.replace(node.move([3, 3]));
      expect(tree.intersects(extent, graph)).to.eql([]);
    });

    it('adjusts parent relations of parent ways when a member node is moved', () => {
      let graph = new Rapid.Graph();
      const tree = new Rapid.Tree(graph);
      const node = Rapid.osmNode({id: 'n', loc: [1, 1]});
      const way = Rapid.osmWay({id: 'w', nodes: ['n']});
      const relation = Rapid.osmRelation({members: [{type: 'multipolygon', id: 'w'}]});
      const extent = new sdk.Extent([0, 0], [2, 2]);

      graph = graph.replace(node).replace(way).replace(relation);
      expect(tree.intersects(extent, graph)).to.eql([node, way, relation]);

      graph = graph.replace(node.move([3, 3]));
      expect(tree.intersects(extent, graph)).to.eql([]);
    });

    it('adjusts parent ways when a member node is removed', () => {
      let graph = new Rapid.Graph();
      const tree = new Rapid.Tree(graph);
      const n1 = Rapid.osmNode({id: 'n1', loc: [1, 1]});
      const n2 = Rapid.osmNode({id: 'n2', loc: [3, 3]});
      const way = Rapid.osmWay({nodes: ['n1', 'n2']});
      const extent = new sdk.Extent([0, 0], [2, 2]);

      graph = graph.replace(n1).replace(n2).replace(way);
      expect(tree.intersects(extent, graph)).to.eql([n1, way]);

      graph = graph.replace(way.removeNode('n1'));
      expect(tree.intersects(extent, graph)).to.eql([n1]);
    });

    it('don\'t include parent way multiple times when multiple child nodes are moved', () => {
      // checks against the following regression: https://github.com/openstreetmap/iD/issues/1978
      let graph = new Rapid.Graph();
      const tree = new Rapid.Tree(graph);
      const n1 = Rapid.osmNode({id: 'n1', loc: [1, 1]});
      const n2 = Rapid.osmNode({id: 'n2', loc: [3, 3]});
      const way = Rapid.osmWay({id: 'w1', nodes: ['n1', 'n2']});
      const extent = new sdk.Extent([0, 0], [4, 4]);

      graph = graph.replace(n1).replace(n2).replace(way);
      expect(tree.intersects(extent, graph)).to.eql([n1, n2, way]);

      graph = graph.replace(n1.move([1.1, 1.1])).replace(n2.move([2.1, 2.1]));
      const intersects = tree.intersects(extent, graph).map(e => e.id);
      expect(intersects).to.have.same.members(['n1','n2','w1']);
    });

    it('doesn\'t include removed entities', () => {
      let graph = new Rapid.Graph();
      const tree = new Rapid.Tree(graph);
      const node = Rapid.osmNode({loc: [1, 1]});
      const extent = new sdk.Extent([0, 0], [2, 2]);

      graph = graph.replace(node);
      expect(tree.intersects(extent, graph)).to.eql([node]);

      graph = graph.remove(node);
      expect(tree.intersects(extent, graph)).to.eql([]);
    });

    it('doesn\'t include removed entities after rebase', () => {
      const base = new Rapid.Graph();
      const tree = new Rapid.Tree(base);
      const node = Rapid.osmNode({id: 'n', loc: [1, 1]});
      const extent = new sdk.Extent([0, 0], [2, 2]);

      const graph = base.replace(node).remove(node);
      expect(tree.intersects(extent, graph)).to.eql([]);

      base.rebase([node], [base]);
      tree.rebase([node]);
      expect(tree.intersects(extent, graph)).to.eql([]);
    });

    it('handles recursive relations', () => {
      const base = new Rapid.Graph();
      const tree = new Rapid.Tree(base);
      const node = Rapid.osmNode({id: 'n', loc: [1, 1]});
      const r1   = Rapid.osmRelation({id: 'r1', members: [{id: 'n'}]});
      const r2   = Rapid.osmRelation({id: 'r2', members: [{id: 'r1'}]});
      const extent = new sdk.Extent([0, 0], [2, 2]);

      const graph = base.replace(r1).replace(r2);
      expect(tree.intersects(extent, graph)).to.eql([]);

      base.rebase([node], [base, graph]);
      tree.rebase([node]);
      expect(tree.intersects(extent, graph)).to.eql([node, r1, r2]);
    });
  });
});
