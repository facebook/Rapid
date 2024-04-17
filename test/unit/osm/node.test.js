import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';


describe('osmNode', () => {
  it('returns a node', () => {
    const node = Rapid.osmNode();
    assert.ok(node instanceof Rapid.osmNode);
    assert.equal(node.type, 'node');
  });


  it('defaults tags to an empty object', () => {
    const node = Rapid.osmNode();
    assert.deepEqual(node.tags, {});
  });


  it('sets tags as specified', () => {
    const node = Rapid.osmNode({ tags: { foo: 'bar' } });
    assert.deepEqual(node.tags, { foo: 'bar' });
  });


  describe('#extent', () => {
    it('returns a point extent', () => {
      const node = Rapid.osmNode({ loc: [5, 10] });
      const extent = node.extent();
      assert.deepEqual(extent, new Rapid.sdk.Extent([5, 10], [5, 10]));
    });
  });


  describe('#intersects', () => {
    it('returns true for a node within the given extent', () => {
      const node = Rapid.osmNode({ loc: [0, 0] });
      const extent = new Rapid.sdk.Extent([-5, -5], [5, 5]);
      assert.equal(node.intersects(extent), true);
    });


    it('returns false for a node outside the given extend', () => {
      const node = Rapid.osmNode({ loc: [6, 6] });
      const extent = new Rapid.sdk.Extent([-5, -5], [5, 5]);
      assert.equal(node.intersects(extent), false);
    });
  });


  describe('#geometry', () => {
    it('returns \'vertex\' if the node is a member of any way', () => {
      const node = Rapid.osmNode();
      const way = Rapid.osmWay({ nodes: [node.id] });
      const graph = new Rapid.Graph([node, way]);
      assert.equal(node.geometry(graph), 'vertex');
    });


    it('returns \'point\' if the node is not a member of any way', () => {
      const node = Rapid.osmNode();
      const graph = new Rapid.Graph([node]);
      assert.equal(node.geometry(graph), 'point');
    });
  });


  describe('#isEndpoint', () => {
    it('returns true for a node at an endpoint along a linear way', () => {
      const a = Rapid.osmNode({ id: 'a' });
      const b = Rapid.osmNode({ id: 'b' });
      const c = Rapid.osmNode({ id: 'c' });
      const w = Rapid.osmWay({ nodes: ['a', 'b', 'c'] });
      const graph = new Rapid.Graph([a, b, c, w]);
      assert.deepEqual(a.isEndpoint(graph), true, 'linear way, beginning node');
      assert.deepEqual(b.isEndpoint(graph), false, 'linear way, middle node');
      assert.deepEqual(c.isEndpoint(graph), true, 'linear way, ending node');
    });


    it('returns false for nodes along a circular way', () => {
      const a = Rapid.osmNode({ id: 'a' });
      const b = Rapid.osmNode({ id: 'b' });
      const c = Rapid.osmNode({ id: 'c' });
      const w = Rapid.osmWay({ nodes: ['a', 'b', 'c', 'a'] });
      const graph = new Rapid.Graph([a, b, c, w]);
      assert.strictEqual(a.isEndpoint(graph), false, 'circular way, connector node');
      assert.strictEqual(b.isEndpoint(graph), false, 'circular way, middle node');
      assert.strictEqual(c.isEndpoint(graph), false, 'circular way, ending node');
    });
  });


  describe('#isConnected', () => {
    it('returns true for a node with multiple parent ways, at least one interesting', () => {
      const node = Rapid.osmNode();
      const w1 = Rapid.osmWay({ nodes: [node.id] });
      const w2 = Rapid.osmWay({ nodes: [node.id], tags: { highway: 'residential' } });
      const graph = new Rapid.Graph([node, w1, w2]);
      assert.ok(node.isConnected(graph));
    });


    it('returns false for a node with only area parent ways', () => {
      const node = Rapid.osmNode();
      const w1 = Rapid.osmWay({ nodes: [node.id], tags: { area: 'yes' } });
      const w2 = Rapid.osmWay({ nodes: [node.id], tags: { area: 'yes' } });
      const graph = new Rapid.Graph([node, w1, w2]);
      assert.equal(node.isConnected(graph), false);
    });


    it('returns false for a node with only uninteresting parent ways', () => {
      const node = Rapid.osmNode();
      const w1 = Rapid.osmWay({ nodes: [node.id] });
      const w2 = Rapid.osmWay({ nodes: [node.id] });
      const graph = new Rapid.Graph([node, w1, w2]);
      assert.strictEqual(node.isConnected(graph), false);
    });


    it('returns false for a standalone node on a single parent way', () => {
      const node = Rapid.osmNode();
      const way = Rapid.osmWay({ nodes: [node.id] });
      const graph = new Rapid.Graph([node, way]);
      assert.strictEqual(node.isConnected(graph), false);
    });


    it('returns true for a self-intersecting node on a single parent way', () => {
      const a = Rapid.osmNode({ id: 'a' });
      const b = Rapid.osmNode({ id: 'b' });
      const c = Rapid.osmNode({ id: 'c' });
      const w = Rapid.osmWay({ nodes: ['a', 'b', 'c', 'b'] });
      const graph = new Rapid.Graph([a, b, c, w]);
      assert.ok(b.isConnected(graph));
    });


    it('returns false for the connecting node of a closed way', () => {
      const a = Rapid.osmNode({ id: 'a' });
      const b = Rapid.osmNode({ id: 'b' });
      const c = Rapid.osmNode({ id: 'c' });
      const w = Rapid.osmWay({ nodes: ['a', 'b', 'c', 'a'] });
      const graph = new Rapid.Graph([a, b, c, w]);
      assert.strictEqual(a.isConnected(graph), false);
    });
  });


  describe('#isIntersection', () => {
    it('returns true for a node shared by more than one highway', () => {
      const node = Rapid.osmNode();
      const w1 = Rapid.osmWay({ nodes: [node.id], tags: { highway: 'residential' } });
      const w2 = Rapid.osmWay({ nodes: [node.id], tags: { highway: 'residential' } });
      const graph = new Rapid.Graph([node, w1, w2]);
      assert.ok(node.isIntersection(graph));
    });


    it('returns true for a node shared by more than one waterway', () => {
      const node = Rapid.osmNode();
      const w1 = Rapid.osmWay({ nodes: [node.id], tags: { waterway: 'river' } });
      const w2 = Rapid.osmWay({ nodes: [node.id], tags: { waterway: 'river' } });
      const graph = new Rapid.Graph([node, w1, w2]);
      assert.ok(node.isIntersection(graph));
    });
  });


  describe('#isHighwayIntersection', () => {
    it('returns true for a node shared by more than one highway', () => {
      const node = Rapid.osmNode();
      const w1 = Rapid.osmWay({ nodes: [node.id], tags: { highway: 'residential' } });
      const w2 = Rapid.osmWay({ nodes: [node.id], tags: { highway: 'residential' } });
      const graph = new Rapid.Graph([node, w1, w2]);
      assert.ok(node.isHighwayIntersection(graph));
    });


    it('returns false for a node shared by more than one waterway', () => {
      const node = Rapid.osmNode();
      const w1 = Rapid.osmWay({ nodes: [node.id], tags: { waterway: 'river' } });
      const w2 = Rapid.osmWay({ nodes: [node.id], tags: { waterway: 'river' } });
      const graph = new Rapid.Graph([node, w1, w2]);
      assert.ok(!node.isHighwayIntersection(graph));
    });
  });


  describe('#isDegenerate', () => {
    it('returns true if node has invalid loc', () => {
      assert.ok(Rapid.osmNode().isDegenerate(), 'no loc');
      assert.ok(Rapid.osmNode({ loc: '' }).isDegenerate(), 'empty string loc');
      assert.ok(Rapid.osmNode({ loc: [] }).isDegenerate(), 'empty array loc');
      assert.ok(Rapid.osmNode({ loc: [0] }).isDegenerate(), '1-array loc');
      assert.ok(Rapid.osmNode({ loc: [0, 0, 0] }).isDegenerate(), '3-array loc');
      assert.ok(Rapid.osmNode({ loc: [-181, 0] }).isDegenerate(), '< min lon');
      assert.ok(Rapid.osmNode({ loc: [181, 0] }).isDegenerate(), '> max lon');
      assert.ok(Rapid.osmNode({ loc: [0, -91] }).isDegenerate(), '< min lat');
      assert.ok(Rapid.osmNode({ loc: [0, 91] }).isDegenerate(), '> max lat');
      assert.ok(Rapid.osmNode({ loc: [Infinity, 0] }).isDegenerate(), 'Infinity lon');
      assert.ok(Rapid.osmNode({ loc: [0, Infinity] }).isDegenerate(), 'Infinity lat');
      assert.ok(Rapid.osmNode({ loc: [NaN, 0] }).isDegenerate(), 'NaN lon');
      assert.ok(Rapid.osmNode({ loc: [0, NaN] }).isDegenerate(), 'NaN lat');
    });


    it('returns false if node has valid loc', () => {
      assert.strictEqual(Rapid.osmNode({ loc: [0, 0] }).isDegenerate(), false, '2-array loc');
      assert.strictEqual(Rapid.osmNode({ loc: [-180, 0] }).isDegenerate(), false, 'min lon');
      assert.strictEqual(Rapid.osmNode({ loc: [180, 0] }).isDegenerate(), false, 'max lon');
      assert.strictEqual(Rapid.osmNode({ loc: [0, -90] }).isDegenerate(), false, 'min lat');
      assert.strictEqual(Rapid.osmNode({ loc: [0, 90] }).isDegenerate(), false, 'max lat');
    });
  });


  describe('#directions', () => {
    const viewport = {
      project: val => val,
      unproject: val => val
    };

    it('returns empty array if no direction tag', () => {
      const node1 = Rapid.osmNode({ loc: [0, 0], tags: {} });
      const graph = new Rapid.Graph([node1]);
      assert.deepEqual(node1.directions(graph, viewport), [], 'no direction tag');
    });


    it('returns empty array if nonsense direction tag', () => {
      const node1 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'blah' } });
      const node2 = Rapid.osmNode({ loc: [0, 0], tags: { direction: '' } });
      const node3 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'NaN' } });
      const node4 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'eastwest' } });
      const graph = new Rapid.Graph([node1, node2, node3, node4]);

      assert.deepEqual(node1.directions(graph, viewport), [], 'nonsense direction tag');
      assert.deepEqual(node2.directions(graph, viewport), [], 'empty string direction tag');
      assert.deepEqual(node3.directions(graph, viewport), [], 'NaN direction tag');
      assert.deepEqual(node4.directions(graph, viewport), [], 'eastwest direction tag');
    });


    it('supports numeric direction tag', () => {
      const node1 = Rapid.osmNode({ loc: [0, 0], tags: { direction: '0' } });
      const node2 = Rapid.osmNode({ loc: [0, 0], tags: { direction: '45' } });
      const node3 = Rapid.osmNode({ loc: [0, 0], tags: { direction: '-45' } });
      const node4 = Rapid.osmNode({ loc: [0, 0], tags: { direction: '360' } });
      const node5 = Rapid.osmNode({ loc: [0, 0], tags: { direction: '1000' } });
      const graph = new Rapid.Graph([node1, node2, node3, node4, node5]);

      assert.deepEqual(node1.directions(graph, viewport), [0], 'numeric 0');
      assert.deepEqual(node2.directions(graph, viewport), [45], 'numeric 45');
      assert.deepEqual(node3.directions(graph, viewport), [-45], 'numeric -45');
      assert.deepEqual(node4.directions(graph, viewport), [360], 'numeric 360');
      assert.deepEqual(node5.directions(graph, viewport), [1000], 'numeric 1000');
    });


    it('supports cardinal direction tags (test abbreviated and mixed case)', () => {
      const nodeN1 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'n' } });
      const nodeN2 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'N' } });
      const nodeN3 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'north' } });
      const nodeN4 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'NOrth' } });

      const nodeNNE1 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'nne' } });
      const nodeNNE2 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'NnE' } });
      const nodeNNE3 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'northnortheast' } });
      const nodeNNE4 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'NOrthnorTHEast' } });

      const nodeNE1 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'ne' } });
      const nodeNE2 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'nE' } });
      const nodeNE3 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'northeast' } });
      const nodeNE4 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'norTHEast' } });

      const nodeENE1 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'ene' } });
      const nodeENE2 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'EnE' } });
      const nodeENE3 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'eastnortheast' } });
      const nodeENE4 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'EAstnorTHEast' } });

      const nodeE1 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'e' } });
      const nodeE2 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'E' } });
      const nodeE3 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'east' } });
      const nodeE4 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'EAst' } });

      const nodeESE1 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'ese' } });
      const nodeESE2 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'EsE' } });
      const nodeESE3 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'eastsoutheast' } });
      const nodeESE4 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'EAstsouTHEast' } });

      const nodeSE1 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'se' } });
      const nodeSE2 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'sE' } });
      const nodeSE3 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'southeast' } });
      const nodeSE4 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'souTHEast' } });

      const nodeSSE1 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'sse' } });
      const nodeSSE2 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'SsE' } });
      const nodeSSE3 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'southsoutheast' } });
      const nodeSSE4 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'SOuthsouTHEast' } });

      const nodeS1 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 's' } });
      const nodeS2 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'S' } });
      const nodeS3 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'south' } });
      const nodeS4 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'SOuth' } });

      const nodeSSW1 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'ssw' } });
      const nodeSSW2 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'SsW' } });
      const nodeSSW3 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'southsouthwest' } });
      const nodeSSW4 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'SOuthsouTHWest' } });

      const nodeSW1 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'sw' } });
      const nodeSW2 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'sW' } });
      const nodeSW3 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'southwest' } });
      const nodeSW4 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'souTHWest' } });

      const nodeWSW1 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'wsw' } });
      const nodeWSW2 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'WsW' } });
      const nodeWSW3 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'westsouthwest' } });
      const nodeWSW4 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'WEstsouTHWest' } });

      const nodeW1 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'w' } });
      const nodeW2 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'W' } });
      const nodeW3 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'west' } });
      const nodeW4 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'WEst' } });

      const nodeWNW1 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'wnw' } });
      const nodeWNW2 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'WnW' } });
      const nodeWNW3 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'westnorthwest' } });
      const nodeWNW4 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'WEstnorTHWest' } });

      const nodeNW1 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'nw' } });
      const nodeNW2 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'nW' } });
      const nodeNW3 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'northwest' } });
      const nodeNW4 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'norTHWest' } });

      const nodeNNW1 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'nnw' } });
      const nodeNNW2 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'NnW' } });
      const nodeNNW3 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'northnorthwest' } });
      const nodeNNW4 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'NOrthnorTHWest' } });

      const graph = new Rapid.Graph([
        nodeN1, nodeN2, nodeN3, nodeN4,
        nodeNNE1, nodeNNE2, nodeNNE3, nodeNNE4,
        nodeNE1, nodeNE2, nodeNE3, nodeNE4,
        nodeENE1, nodeENE2, nodeENE3, nodeENE4,
        nodeE1, nodeE2, nodeE3, nodeE4,
        nodeESE1, nodeESE2, nodeESE3, nodeESE4,
        nodeSE1, nodeSE2, nodeSE3, nodeSE4,
        nodeSSE1, nodeSSE2, nodeSSE3, nodeSSE4,
        nodeS1, nodeS2, nodeS3, nodeS4,
        nodeSSW1, nodeSSW2, nodeSSW3, nodeSSW4,
        nodeSW1, nodeSW2, nodeSW3, nodeSW4,
        nodeWSW1, nodeWSW2, nodeWSW3, nodeWSW4,
        nodeW1, nodeW2, nodeW3, nodeW4,
        nodeWNW1, nodeWNW2, nodeWNW3, nodeWNW4,
        nodeNW1, nodeNW2, nodeNW3, nodeNW4,
        nodeNNW1, nodeNNW2, nodeNNW3, nodeNNW4
      ]);

      assert.deepEqual(nodeN1.directions(graph, viewport), [0], 'cardinal n');
      assert.deepEqual(nodeN2.directions(graph, viewport), [0], 'cardinal N');
      assert.deepEqual(nodeN3.directions(graph, viewport), [0], 'cardinal north');
      assert.deepEqual(nodeN4.directions(graph, viewport), [0], 'cardinal NOrth');

      assert.deepEqual(nodeNNE1.directions(graph, viewport), [22], 'cardinal nne');
      assert.deepEqual(nodeNNE2.directions(graph, viewport), [22], 'cardinal NnE');
      assert.deepEqual(nodeNNE3.directions(graph, viewport), [22], 'cardinal northnortheast');
      assert.deepEqual(nodeNNE4.directions(graph, viewport), [22], 'cardinal NOrthnorTHEast');

      assert.deepEqual(nodeNE1.directions(graph, viewport), [45], 'cardinal ne');
      assert.deepEqual(nodeNE2.directions(graph, viewport), [45], 'cardinal nE');
      assert.deepEqual(nodeNE3.directions(graph, viewport), [45], 'cardinal northeast');
      assert.deepEqual(nodeNE4.directions(graph, viewport), [45], 'cardinal norTHEast');

      assert.deepEqual(nodeENE1.directions(graph, viewport), [67], 'cardinal ene');
      assert.deepEqual(nodeENE2.directions(graph, viewport), [67], 'cardinal EnE');
      assert.deepEqual(nodeENE3.directions(graph, viewport), [67], 'cardinal eastnortheast');
      assert.deepEqual(nodeENE4.directions(graph, viewport), [67], 'cardinal EAstnorTHEast');

      assert.deepEqual(nodeE1.directions(graph, viewport), [90], 'cardinal e');
      assert.deepEqual(nodeE2.directions(graph, viewport), [90], 'cardinal E');
      assert.deepEqual(nodeE3.directions(graph, viewport), [90], 'cardinal east');
      assert.deepEqual(nodeE4.directions(graph, viewport), [90], 'cardinal EAst');

      assert.deepEqual(nodeESE1.directions(graph, viewport), [112], 'cardinal ese');
      assert.deepEqual(nodeESE2.directions(graph, viewport), [112], 'cardinal EsE');
      assert.deepEqual(nodeESE3.directions(graph, viewport), [112], 'cardinal eastsoutheast');
      assert.deepEqual(nodeESE4.directions(graph, viewport), [112], 'cardinal EAstsouTHEast');

      assert.deepEqual(nodeSE1.directions(graph, viewport), [135], 'cardinal se');
      assert.deepEqual(nodeSE2.directions(graph, viewport), [135], 'cardinal sE');
      assert.deepEqual(nodeSE3.directions(graph, viewport), [135], 'cardinal southeast');
      assert.deepEqual(nodeSE4.directions(graph, viewport), [135], 'cardinal souTHEast');

      assert.deepEqual(nodeSSE1.directions(graph, viewport), [157], 'cardinal sse');
      assert.deepEqual(nodeSSE2.directions(graph, viewport), [157], 'cardinal SsE');
      assert.deepEqual(nodeSSE3.directions(graph, viewport), [157], 'cardinal southsoutheast');
      assert.deepEqual(nodeSSE4.directions(graph, viewport), [157], 'cardinal SouthsouTHEast');

      assert.deepEqual(nodeS2.directions(graph, viewport), [180], 'cardinal S');
      assert.deepEqual(nodeS3.directions(graph, viewport), [180], 'cardinal south');
      assert.deepEqual(nodeS4.directions(graph, viewport), [180], 'cardinal SOuth');

      assert.deepEqual(nodeSSW1.directions(graph, viewport), [202], 'cardinal ssw');
      assert.deepEqual(nodeSSW2.directions(graph, viewport), [202], 'cardinal SsW');
      assert.deepEqual(nodeSSW3.directions(graph, viewport), [202], 'cardinal southsouthwest');
      assert.deepEqual(nodeSSW4.directions(graph, viewport), [202], 'cardinal SouthsouTHWest');

      assert.deepEqual(nodeSW1.directions(graph, viewport), [225], 'cardinal sw');
      assert.deepEqual(nodeSW2.directions(graph, viewport), [225], 'cardinal sW');
      assert.deepEqual(nodeSW3.directions(graph, viewport), [225], 'cardinal southwest');
      assert.deepEqual(nodeSW4.directions(graph, viewport), [225], 'cardinal souTHWest');

      assert.deepEqual(nodeWSW1.directions(graph, viewport), [247], 'cardinal wsw');
      assert.deepEqual(nodeWSW2.directions(graph, viewport), [247], 'cardinal WsW');
      assert.deepEqual(nodeWSW3.directions(graph, viewport), [247], 'cardinal westsouthwest');
      assert.deepEqual(nodeWSW4.directions(graph, viewport), [247], 'cardinal WEstsouTHWest');

      assert.deepEqual(nodeW1.directions(graph, viewport), [270], 'cardinal w');
      assert.deepEqual(nodeW2.directions(graph, viewport), [270], 'cardinal W');
      assert.deepEqual(nodeW3.directions(graph, viewport), [270], 'cardinal west');
      assert.deepEqual(nodeW4.directions(graph, viewport), [270], 'cardinal WEst');

      assert.deepEqual(nodeWNW1.directions(graph, viewport), [292], 'cardinal wnw');
      assert.deepEqual(nodeWNW2.directions(graph, viewport), [292], 'cardinal WnW');
      assert.deepEqual(nodeWNW3.directions(graph, viewport), [292], 'cardinal westnorthwest');
      assert.deepEqual(nodeWNW4.directions(graph, viewport), [292], 'cardinal WEstnorTHWest');

      assert.deepEqual(nodeNW1.directions(graph, viewport), [315], 'cardinal nw');
      assert.deepEqual(nodeNW2.directions(graph, viewport), [315], 'cardinal nW');
      assert.deepEqual(nodeNW3.directions(graph, viewport), [315], 'cardinal northwest');
      assert.deepEqual(nodeNW4.directions(graph, viewport), [315], 'cardinal norTHWest');

      assert.deepEqual(nodeNNW1.directions(graph, viewport), [337], 'cardinal nnw');
      assert.deepEqual(nodeNNW2.directions(graph, viewport), [337], 'cardinal NnW');
      assert.deepEqual(nodeNNW3.directions(graph, viewport), [337], 'cardinal northnorthwest');
      assert.deepEqual(nodeNNW4.directions(graph, viewport), [337], 'cardinal NOrthnorTHWest');
    });


    it('supports direction=forward', () => {
      const node1 = Rapid.osmNode({ id: 'n1', loc: [-1, 0] });
      const node2 = Rapid.osmNode({ id: 'n2', loc: [0, 0], tags: { 'direction': 'forward' } });
      const node3 = Rapid.osmNode({ id: 'n3', loc: [1, 0] });
      const way = Rapid.osmWay({ nodes: ['n1', 'n2', 'n3'] });
      const graph = new Rapid.Graph([node1, node2, node3, way]);
      assert.deepEqual(node2.directions(graph, viewport), [270]);
    });


    it('supports direction=backward', () => {
      const node1 = Rapid.osmNode({ id: 'n1', loc: [-1, 0] });
      const node2 = Rapid.osmNode({ id: 'n2', loc: [0, 0], tags: { 'direction': 'backward' } });
      const node3 = Rapid.osmNode({ id: 'n3', loc: [1, 0] });
      const way = Rapid.osmWay({ nodes: ['n1', 'n2', 'n3'] });
      const graph = new Rapid.Graph([node1, node2, node3, way]);
      assert.deepEqual(node2.directions(graph, viewport), [90]);
    });


    it('supports direction=both', () => {
      const node1 = Rapid.osmNode({ id: 'n1', loc: [-1, 0] });
      const node2 = Rapid.osmNode({ id: 'n2', loc: [0, 0], tags: { 'direction': 'both' } });
      const node3 = Rapid.osmNode({ id: 'n3', loc: [1, 0] });
      const way = Rapid.osmWay({ nodes: ['n1', 'n2', 'n3'] });
      const graph = new Rapid.Graph([node1, node2, node3, way]);
      assert.ok(node2.directions(graph, viewport), 90);
      assert.ok(node2.directions(graph, viewport), 270);
    });


    it('supports direction=all', () => {
      const node1 = Rapid.osmNode({ id: 'n1', loc: [-1, 0] });
      const node2 = Rapid.osmNode({ id: 'n2', loc: [0, 0], tags: { 'direction': 'all' } });
      const node3 = Rapid.osmNode({ id: 'n3', loc: [1, 0] });
      const way = Rapid.osmWay({ nodes: ['n1', 'n2', 'n3'] });
      const graph = new Rapid.Graph([node1, node2, node3, way]);
      assert.ok(node2.directions(graph, viewport), 90);
      assert.ok(node2.directions(graph, viewport), 270);
    });


    it('supports traffic_signals:direction=forward', () => {
      const node1 = Rapid.osmNode({ id: 'n1', loc: [-1, 0] });
      const node2 = Rapid.osmNode({ id: 'n2', loc: [0, 0], tags: { 'traffic_signals:direction': 'forward' } });
      const node3 = Rapid.osmNode({ id: 'n3', loc: [1, 0] });
      const way = Rapid.osmWay({ nodes: ['n1', 'n2', 'n3'] });
      const graph = new Rapid.Graph([node1, node2, node3, way]);
      assert.deepEqual(node2.directions(graph, viewport), [270]);
    });


    it('supports traffic_signals:direction=backward', () => {
      const node1 = Rapid.osmNode({ id: 'n1', loc: [-1, 0] });
      const node2 = Rapid.osmNode({ id: 'n2', loc: [0, 0], tags: { 'traffic_signals:direction': 'backward' } });
      const node3 = Rapid.osmNode({ id: 'n3', loc: [1, 0] });
      const way = Rapid.osmWay({ nodes: ['n1', 'n2', 'n3'] });
      const graph = new Rapid.Graph([node1, node2, node3, way]);
      assert.deepEqual(node2.directions(graph, viewport), [90]);
    });


    it('supports traffic_signals:direction=both', () => {
      const node1 = Rapid.osmNode({ id: 'n1', loc: [-1, 0] });
      const node2 = Rapid.osmNode({ id: 'n2', loc: [0, 0], tags: { 'traffic_signals:direction': 'both' } });
      const node3 = Rapid.osmNode({ id: 'n3', loc: [1, 0] });
      const way = Rapid.osmWay({ nodes: ['n1', 'n2', 'n3'] });
      const graph = new Rapid.Graph([node1, node2, node3, way]);
      assert.ok(node2.directions(graph, viewport), 90);
      assert.ok(node2.directions(graph, viewport), 270);
    });


    it('supports traffic_signals:direction=all', () => {
      const node1 = Rapid.osmNode({ id: 'n1', loc: [-1, 0] });
      const node2 = Rapid.osmNode({ id: 'n2', loc: [0, 0], tags: { 'traffic_signals:direction': 'all' } });
      const node3 = Rapid.osmNode({ id: 'n3', loc: [1, 0] });
      const way = Rapid.osmWay({ nodes: ['n1', 'n2', 'n3'] });
      const graph = new Rapid.Graph([node1, node2, node3, way]);
      assert.ok(node2.directions(graph, viewport), 90);
      assert.ok(node2.directions(graph, viewport), 270);
    });


    it('supports railway:signal:direction=forward', () => {
      const node1 = Rapid.osmNode({ id: 'n1', loc: [-1, 0] });
      const node2 = Rapid.osmNode({ id: 'n2', loc: [0, 0], tags: { 'railway:signal:direction': 'forward' } });
      const node3 = Rapid.osmNode({ id: 'n3', loc: [1, 0] });
      const way = Rapid.osmWay({ nodes: ['n1', 'n2', 'n3'] });
      const graph = new Rapid.Graph([node1, node2, node3, way]);
      assert.deepEqual(node2.directions(graph, viewport), [270]);
    });


    it('supports railway:signal:direction=backward', () => {
      const node1 = Rapid.osmNode({ id: 'n1', loc: [-1, 0] });
      const node2 = Rapid.osmNode({ id: 'n2', loc: [0, 0], tags: { 'railway:signal:direction': 'backward' } });
      const node3 = Rapid.osmNode({ id: 'n3', loc: [1, 0] });
      const way = Rapid.osmWay({ nodes: ['n1', 'n2', 'n3'] });
      const graph = new Rapid.Graph([node1, node2, node3, way]);
      assert.deepEqual(node2.directions(graph, viewport), [90]);
    });


    it('supports railway:signal:direction=both', () => {
      const node1 = Rapid.osmNode({ id: 'n1', loc: [-1, 0] });
      const node2 = Rapid.osmNode({ id: 'n2', loc: [0, 0], tags: { 'railway:signal:direction': 'both' } });
      const node3 = Rapid.osmNode({ id: 'n3', loc: [1, 0] });
      const way = Rapid.osmWay({ nodes: ['n1', 'n2', 'n3'] });
      const graph = new Rapid.Graph([node1, node2, node3, way]);
      assert.ok(node2.directions(graph, viewport), 90);
      assert.ok(node2.directions(graph, viewport), 270);
    });


    it('supports railway:signal:direction=all', () => {
      const node1 = Rapid.osmNode({ id: 'n1', loc: [-1, 0] });
      const node2 = Rapid.osmNode({ id: 'n2', loc: [0, 0], tags: { 'railway:signal:direction': 'all' } });
      const node3 = Rapid.osmNode({ id: 'n3', loc: [1, 0] });
      const way = Rapid.osmWay({ nodes: ['n1', 'n2', 'n3'] });
      const graph = new Rapid.Graph([node1, node2, node3, way]);
      assert.ok(node2.directions(graph, viewport), 90);
      assert.ok(node2.directions(graph, viewport), 270);
    });


    it('supports camera:direction=forward', () => {
      const node1 = Rapid.osmNode({ id: 'n1', loc: [-1, 0] });
      const node2 = Rapid.osmNode({ id: 'n2', loc: [0, 0], tags: { 'camera:direction': 'forward' } });
      const node3 = Rapid.osmNode({ id: 'n3', loc: [1, 0] });
      const way = Rapid.osmWay({ nodes: ['n1', 'n2', 'n3'] });
      const graph = new Rapid.Graph([node1, node2, node3, way]);
      assert.deepEqual(node2.directions(graph, viewport), [270]);
    });


    it('supports camera:direction=backward', () => {
      const node1 = Rapid.osmNode({ id: 'n1', loc: [-1, 0] });
      const node2 = Rapid.osmNode({ id: 'n2', loc: [0, 0], tags: { 'camera:direction': 'backward' } });
      const node3 = Rapid.osmNode({ id: 'n3', loc: [1, 0] });
      const way = Rapid.osmWay({ nodes: ['n1', 'n2', 'n3'] });
      const graph = new Rapid.Graph([node1, node2, node3, way]);
      assert.deepEqual(node2.directions(graph, viewport), [90]);
    });


    it('supports camera:direction=both', () => {
      const node1 = Rapid.osmNode({ id: 'n1', loc: [-1, 0] });
      const node2 = Rapid.osmNode({ id: 'n2', loc: [0, 0], tags: { 'camera:direction': 'both' } });
      const node3 = Rapid.osmNode({ id: 'n3', loc: [1, 0] });
      const way = Rapid.osmWay({ nodes: ['n1', 'n2', 'n3'] });
      const graph = new Rapid.Graph([node1, node2, node3, way]);
      assert.ok(node2.directions(graph, viewport), 90);
      assert.ok(node2.directions(graph, viewport), 270);
    });


    it('supports camera:direction=all', () => {
      const node1 = Rapid.osmNode({ id: 'n1', loc: [-1, 0] });
      const node2 = Rapid.osmNode({ id: 'n2', loc: [0, 0], tags: { 'camera:direction': 'all' } });
      const node3 = Rapid.osmNode({ id: 'n3', loc: [1, 0] });
      const way = Rapid.osmWay({ nodes: ['n1', 'n2', 'n3'] });
      const graph = new Rapid.Graph([node1, node2, node3, way]);
      assert.ok(node2.directions(graph, viewport), 90);
      assert.ok(node2.directions(graph, viewport), 270);
    });


    it('returns directions for an all-way stop at a highway interstction', () => {
      const node1 = Rapid.osmNode({ id: 'n1', loc: [-1, 0] });
      const node2 = Rapid.osmNode({ id: 'n2', loc: [0, 0], tags: { 'highway': 'stop', 'stop': 'all' } });
      const node3 = Rapid.osmNode({ id: 'n3', loc: [1, 0] });
      const node4 = Rapid.osmNode({ id: 'n4', loc: [0, -1] });
      const node5 = Rapid.osmNode({ id: 'n5', loc: [0, 1] });
      const way1 = Rapid.osmWay({ id: 'w1', nodes: ['n1', 'n2', 'n3'], tags: { 'highway': 'residential' } });
      const way2 = Rapid.osmWay({ id: 'w2', nodes: ['n4', 'n2', 'n5'], tags: { 'highway': 'residential' } });
      const graph = new Rapid.Graph([node1, node2, node3, node4, node5, way1, way2]);
      assert.ok(node2.directions(graph, viewport), 0);
      assert.ok(node2.directions(graph, viewport), 90);
      assert.ok(node2.directions(graph, viewport), 180);
      assert.ok(node2.directions(graph, viewport), 270);
    });


    it('does not return directions for an all-way stop not at a highway interstction', () => {
      const node1 = Rapid.osmNode({ id: 'n1', loc: [-1, 0], tags: { 'highway': 'stop', 'stop': 'all' } });
      const node2 = Rapid.osmNode({ id: 'n2', loc: [0, 0] });
      const node3 = Rapid.osmNode({ id: 'n3', loc: [1, 0], tags: { 'highway': 'stop', 'stop': 'all' } });
      const node4 = Rapid.osmNode({ id: 'n4', loc: [0, -1], tags: { 'highway': 'stop', 'stop': 'all' } });
      const node5 = Rapid.osmNode({ id: 'n5', loc: [0, 1], tags: { 'highway': 'stop', 'stop': 'all' } });
      const way1 = Rapid.osmWay({ id: 'w1', nodes: ['n1', 'n2', 'n3'], tags: { 'highway': 'residential' } });
      const way2 = Rapid.osmWay({ id: 'w2', nodes: ['n4', 'n2', 'n5'], tags: { 'highway': 'residential' } });
      const graph = new Rapid.Graph([node1, node2, node3, node4, node5, way1, way2]);
      assert.deepEqual(node2.directions(graph, viewport), []);
    });


    it('supports multiple directions delimited by ;', () => {
      const node1 = Rapid.osmNode({ loc: [0, 0], tags: { direction: '0;45' } });
      const node2 = Rapid.osmNode({ loc: [0, 0], tags: { direction: '45;north' } });
      const node3 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'north;east' } });
      const node4 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 'n;s;e;w' } });
      const node5 = Rapid.osmNode({ loc: [0, 0], tags: { direction: 's;wat' } });
      const graph = new Rapid.Graph([node1, node2, node3, node4, node5]);

      assert.deepEqual(node1.directions(graph, viewport), [0, 45], 'numeric 0, numeric 45');
      assert.deepEqual(node2.directions(graph, viewport), [45, 0], 'numeric 45, cardinal north');
      assert.deepEqual(node3.directions(graph, viewport), [0, 90], 'cardinal north and east');
      assert.deepEqual(node4.directions(graph, viewport), [0, 180, 90, 270], 'cardinal n,s,e,w');
      assert.deepEqual(node5.directions(graph, viewport), [180], 'cardinal 180 and nonsense');
    });


    it('supports mixing textual, cardinal, numeric directions, delimited by ;', () => {
      const node1 = Rapid.osmNode({ id: 'n1', loc: [-1, 0] });
      const node2 = Rapid.osmNode({ id: 'n2', loc: [0, 0], tags: { 'camera:direction': 'both;ne;60' } });
      const node3 = Rapid.osmNode({ id: 'n3', loc: [1, 0] });
      const way = Rapid.osmWay({ nodes: ['n1', 'n2', 'n3'] });
      const graph = new Rapid.Graph([node1, node2, node3, way]);
      assert.ok(node2.directions(graph, viewport), 90);
      assert.ok(node2.directions(graph, viewport), 270);
      assert.ok(node2.directions(graph, viewport), 45);
      assert.ok(node2.directions(graph, viewport), 60);
    });
  });


  describe('#asJXON', () => {
    it('converts a node to jxon', () => {
      const node = Rapid.osmNode({ id: 'n-1', loc: [-77, 38], tags: { amenity: 'cafe' } });
      assert.deepEqual(node.asJXON(), {
        node: {
          '@id': '-1',
          '@lon': -77,
          '@lat': 38,
          '@version': 0,
          tag: [{ keyAttributes: { k: 'amenity', v: 'cafe' } }]
        }
      });
    });


    it('includes changeset if provided', () => {
      assert.equal(Rapid.osmNode({ loc: [0, 0] }).asJXON('1234').node['@changeset'], '1234');
    });
  });


  describe('#asGeoJSON', () => {
    it('converts to a GeoJSON Point geometry', () => {
      const node = Rapid.osmNode({ tags: { amenity: 'cafe' }, loc: [1, 2] });
      const json = node.asGeoJSON();

      assert.equal(json.type, 'Point');
      assert.deepEqual(json.coordinates, [1, 2]);
    });
  });
});
