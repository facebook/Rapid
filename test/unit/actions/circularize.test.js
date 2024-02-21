import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';


describe('actionCircularize', () => {
  // This makes our viewport operate like the d3 default of [480,250].
  // https://github.com/d3/d3-geo#projection_translate
  const viewport = new Rapid.sdk.Viewport({ x: 480, y: 250, k: 150 });

  function isCircular(id, graph) {
    const points = graph.childNodes(graph.entity(id)).map(node => viewport.project(node.loc));
    const centroid = Rapid.d3.polygonCentroid(points);
    const radius = Rapid.sdk.vecLength(centroid, points[0]);
    const estArea = Math.PI * radius * radius;
    const trueArea = Math.abs(Rapid.d3.polygonArea(points));
    const pctDiff = (estArea - trueArea) / estArea;

    return (pctDiff < 0.025);   // within 2.5% of circular area..
  }

  function intersection(a, b) {
    const seen = a.reduce(function (h, k) {
      h[k] = true;
      return h;
    }, {});

    return b.filter(function (k) {
      const exists = seen[k];
      delete seen[k];
      return exists;
    });
  }

  function angle(point1, point2, center) {
    let vector1 = [point1[0] - center[0], point1[1] - center[1]];
    let vector2 = [point2[0] - center[0], point2[1] - center[1]];
    let distance;

    distance = Rapid.sdk.vecLength(vector1, [0, 0]);
    vector1 = [vector1[0] / distance, vector1[1] / distance];

    distance = Rapid.sdk.vecLength(vector2, [0, 0]);
    vector2 = [vector2[0] / distance, vector2[1] / distance];

    return 180 / Math.PI * Math.acos(vector1[0] * vector2[0] + vector1[1] * vector2[1]);
  }

  function area(id, graph) {
    const coords = graph.childNodes(graph.entity(id)).map(node => node.loc);
    return Rapid.d3.polygonArea(coords);
  }

  function closeTo(a, b, epsilon = 1e-2) {
    return Math.abs(a - b) < epsilon;
  }


  it('creates nodes if necessary', () => {
    //    d ---- c
    //    |      |
    //    a ---- b
    const graph = new Rapid.Graph([
      Rapid.osmNode({id: 'a', loc: [0, 0]}),
      Rapid.osmNode({id: 'b', loc: [2, 0]}),
      Rapid.osmNode({id: 'c', loc: [2, 2]}),
      Rapid.osmNode({id: 'd', loc: [0, 2]}),
      Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd', 'a']})
    ]);

    const result = Rapid.actionCircularize('-', viewport)(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.ok(isCircular('-', result));
    assert.equal(result.entity('-').nodes.length, 20);
  });


  it('reuses existing nodes', () => {
    //    d,e -- c
    //    |      |
    //    a ---- b
    const graph = new Rapid.Graph([
      Rapid.osmNode({id: 'a', loc: [0, 0]}),
      Rapid.osmNode({id: 'b', loc: [2, 0]}),
      Rapid.osmNode({id: 'c', loc: [2, 2]}),
      Rapid.osmNode({id: 'd', loc: [0, 2]}),
      Rapid.osmNode({id: 'e', loc: [0, 2]}),
      Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd', 'e', 'a']})
    ]);

    const result = Rapid.actionCircularize('-', viewport)(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.ok(isCircular('-', result));

    const nodes = result.entity('-').nodes;
    assert.ok(nodes.includes('a'));
    assert.ok(nodes.includes('b'));
    assert.ok(nodes.includes('c'));
    assert.ok(nodes.includes('d'));
    assert.ok(nodes.includes('e'));
  });


  it('limits movement of nodes that are members of other ways', () => {
    //    b ---- a
    //    |      |
    //    c ---- d
    const graph = new Rapid.Graph([
      Rapid.osmNode({id: 'a', loc: [2, 2]}),
      Rapid.osmNode({id: 'b', loc: [-2, 2]}),
      Rapid.osmNode({id: 'c', loc: [-2, -2]}),
      Rapid.osmNode({id: 'd', loc: [2, -2]}),
      Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd', 'a']}),
      Rapid.osmWay({id: '=', nodes: ['d']})
    ]);

    const result = Rapid.actionCircularize('-', viewport)(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.ok(isCircular('-', result));
    const dist = Rapid.sdk.vecLength(result.entity('d').loc, [2, -2]);
    assert.ok(dist < 0.5);
  });


  it('creates circle respecting min-angle limit', () => {
    //    d ---- c
    //    |      |
    //    a ---- b
    const graph = new Rapid.Graph([
      Rapid.osmNode({id: 'a', loc: [0, 0]}),
      Rapid.osmNode({id: 'b', loc: [2, 0]}),
      Rapid.osmNode({id: 'c', loc: [2, 2]}),
      Rapid.osmNode({id: 'd', loc: [0, 2]}),
      Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd', 'a']})
    ]);

    const result = Rapid.actionCircularize('-', viewport, 20)(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.ok(isCircular('-', result));

    const points = result.childNodes(result.entity('-')).map(node => viewport.project(node.loc));
    const centroid = Rapid.d3.polygonCentroid(points);

    for (let i = 0; i < points.length - 1; i++) {
      assert.ok(angle(points.at(i), points.at(i+1), centroid) <= 20);
    }
    assert.ok(angle(points.at(-2), points.at(0), centroid) <= 20);
  });


  it('leaves clockwise ways clockwise', () => {
    //    d ---- c
    //    |      |
    //    a ---- b
    const graph = new Rapid.Graph([
      Rapid.osmNode({id: 'a', loc: [0, 0]}),
      Rapid.osmNode({id: 'b', loc: [2, 0]}),
      Rapid.osmNode({id: 'c', loc: [2, 2]}),
      Rapid.osmNode({id: 'd', loc: [0, 2]}),
      Rapid.osmWay({id: '+', nodes: ['a', 'd', 'c', 'b', 'a']})
    ]);

    assert.ok(area('+', graph) > 0);

    const result = Rapid.actionCircularize('+', viewport)(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.ok(isCircular('+', result));
    assert.ok(area('+', result) > 0);
  });


  it('leaves counter-clockwise ways counter-clockwise', () => {
    //    d ---- c
    //    |      |
    //    a ---- b
    const graph = new Rapid.Graph([
      Rapid.osmNode({id: 'a', loc: [0, 0]}),
      Rapid.osmNode({id: 'b', loc: [2, 0]}),
      Rapid.osmNode({id: 'c', loc: [2, 2]}),
      Rapid.osmNode({id: 'd', loc: [0, 2]}),
      Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd', 'a']})
    ]);

    assert.ok(area('-', graph) < 0);

    const result = Rapid.actionCircularize('-', viewport)(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.ok(isCircular('-', result));
    assert.ok(area('-', result) < 0);
  });


  it('adds new nodes on shared way wound in opposite direction', () => {
    //    c ---- b ---- f
    //    |     /       |
    //    |    a        |
    //    |     \       |
    //    d ---- e ---- g
    //
    //  a-b-c-d-e-a is counterclockwise
    //  a-b-f-g-e-a is clockwise
    //
    const graph = new Rapid.Graph([
      Rapid.osmNode({id: 'a', loc: [ 0,  0]}),
      Rapid.osmNode({id: 'b', loc: [ 1,  2]}),
      Rapid.osmNode({id: 'c', loc: [-2,  2]}),
      Rapid.osmNode({id: 'd', loc: [-2, -2]}),
      Rapid.osmNode({id: 'e', loc: [ 1, -2]}),
      Rapid.osmNode({id: 'f', loc: [ 3,  2]}),
      Rapid.osmNode({id: 'g', loc: [ 3, -2]}),
      Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd', 'e', 'a']}),
      Rapid.osmWay({id: '=', nodes: ['a', 'b', 'f', 'g', 'e', 'a']})
    ]);

    const intersect1 = intersection(graph.entity('-').nodes, graph.entity('=').nodes);
    assert.equal(intersect1.length, 3);
    assert.equal(graph.entity('-').isConvex(graph), false);
    assert.equal(graph.entity('=').isConvex(graph), true);

    const result = Rapid.actionCircularize('-', viewport)(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.ok(isCircular('-', result));

    const intersect2 = intersection(result.entity('-').nodes, result.entity('=').nodes);
    assert.ok(intersect2.length > 3);
    assert.equal(result.entity('-').isConvex(result), true);
    assert.equal(result.entity('=').isConvex(result), false);
  });


  it('adds new nodes on shared way wound in similar direction', () => {
    //    c ---- b ---- f
    //    |     /       |
    //    |    a        |
    //    |     \       |
    //    d ---- e ---- g
    //
    //  a-b-c-d-e-a is counterclockwise
    //  a-e-g-f-b-a is counterclockwise
    //
    const graph = new Rapid.Graph([
      Rapid.osmNode({id: 'a', loc: [ 0,  0]}),
      Rapid.osmNode({id: 'b', loc: [ 1,  2]}),
      Rapid.osmNode({id: 'c', loc: [-2,  2]}),
      Rapid.osmNode({id: 'd', loc: [-2, -2]}),
      Rapid.osmNode({id: 'e', loc: [ 1, -2]}),
      Rapid.osmNode({id: 'f', loc: [ 3,  2]}),
      Rapid.osmNode({id: 'g', loc: [ 3, -2]}),
      Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd', 'e', 'a']}),
      Rapid.osmWay({id: '=', nodes: ['a', 'e', 'g', 'f', 'b', 'a']})
    ]);

    const intersect1 = intersection(graph.entity('-').nodes, graph.entity('=').nodes);
    assert.equal(intersect1.length, 3);
    assert.equal(graph.entity('-').isConvex(graph), false);
    assert.equal(graph.entity('=').isConvex(graph), true);

    const result = Rapid.actionCircularize('-', viewport)(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.ok(isCircular('-', result));

    const intersect2 = intersection(result.entity('-').nodes, result.entity('=').nodes);
    assert.ok(intersect2.length > 3);
    assert.equal(result.entity('-').isConvex(result), true);
    assert.equal(result.entity('=').isConvex(result), false);
  });


  it('circularizes extremely concave ways with a key node on the wrong side of the centroid', () => {
    //    c ------------ b -- f
    //    |       ___---      |
    //    |  a ===            |
    //    |       ---___      |
    //    d ------------ e -- g
    //
    //  a-b-c-d-e-a is extremely concave and 'a' is to the left of centoid..
    //
    const graph = new Rapid.Graph([
      Rapid.osmNode({id: 'a', loc: [ 0,  0]}),
      Rapid.osmNode({id: 'b', loc: [10,  2]}),
      Rapid.osmNode({id: 'c', loc: [-2,  2]}),
      Rapid.osmNode({id: 'd', loc: [-2, -2]}),
      Rapid.osmNode({id: 'e', loc: [10, -2]}),
      Rapid.osmNode({id: 'f', loc: [15,  2]}),
      Rapid.osmNode({id: 'g', loc: [15, -2]}),
      Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd', 'e', 'a']}),
      Rapid.osmWay({id: '=', nodes: ['a', 'b', 'f', 'g', 'e', 'a']})
    ]);

    assert.equal(graph.entity('-').isConvex(graph), false);

    const result = Rapid.actionCircularize('-', viewport)(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.ok(isCircular('-', result));
    assert.equal(result.entity('-').isConvex(result), true);
    assert.equal(result.entity('-').nodes.length, 20);
  });


  describe('#disabled', () => {
    it('not disable circularize when its not circular', () => {
      const graph = new Rapid.Graph([
        Rapid.osmNode({id: 'a', loc: [0, 0]}),
        Rapid.osmNode({id: 'b', loc: [2, 0]}),
        Rapid.osmNode({id: 'c', loc: [2, 2]}),
        Rapid.osmNode({id: 'd', loc: [0, 2]}),
        Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd', 'a']})
      ]);

      const disabled = Rapid.actionCircularize('-', viewport).disabled(graph);
      assert.equal(disabled, false);
    });


    it('disable circularize twice', () => {
      const graph = new Rapid.Graph([
        Rapid.osmNode({id: 'a', loc: [0, 0]}),
        Rapid.osmNode({id: 'b', loc: [2, 0]}),
        Rapid.osmNode({id: 'c', loc: [2, 2]}),
        Rapid.osmNode({id: 'd', loc: [0, 2]}),
        Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd', 'a']})
      ]);

      const result = Rapid.actionCircularize('-', viewport)(graph);
      const disabled = Rapid.actionCircularize('-', viewport).disabled(result);
      assert.equal(disabled, 'already_circular');
    });
  });


  describe('transitions', () => {
    it('is transitionable', () => {
      assert.ok(Rapid.actionCircularize().transitionable);
    });

    it('circularize at t = 0', () => {
      const graph = new Rapid.Graph([
        Rapid.osmNode({id: 'a', loc: [0, 0]}),
        Rapid.osmNode({id: 'b', loc: [2, 0]}),
        Rapid.osmNode({id: 'c', loc: [2, 2]}),
        Rapid.osmNode({id: 'd', loc: [0, 2]}),
        Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd', 'a']})
      ]);
      const result = Rapid.actionCircularize('-', viewport)(graph, 0);
      assert.equal(isCircular('-', result), false);
      assert.equal(result.entity('-').nodes.length, 20);
      assert.ok(closeTo(area('-', result), -4));
    });

    it('circularize at t = 0.5', () => {
      const graph = new Rapid.Graph([
        Rapid.osmNode({id: 'a', loc: [0, 0]}),
        Rapid.osmNode({id: 'b', loc: [2, 0]}),
        Rapid.osmNode({id: 'c', loc: [2, 2]}),
        Rapid.osmNode({id: 'd', loc: [0, 2]}),
        Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd', 'a']})
      ]);
      const result = Rapid.actionCircularize('-', viewport)(graph, 0.5);
      assert.equal(isCircular('-', result), false);
      assert.equal(result.entity('-').nodes.length, 20);
      assert.ok(closeTo(area('-', result), -4.812));
    });

    it('circularize at t = 1', () => {
      const graph = new Rapid.Graph([
        Rapid.osmNode({id: 'a', loc: [0, 0]}),
        Rapid.osmNode({id: 'b', loc: [2, 0]}),
        Rapid.osmNode({id: 'c', loc: [2, 2]}),
        Rapid.osmNode({id: 'd', loc: [0, 2]}),
        Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd', 'a']})
      ]);
      const result = Rapid.actionCircularize('-', viewport)(graph, 1);
      assert.ok(isCircular('-', result));
      assert.equal(result.entity('-').nodes.length, 20);
      assert.ok(closeTo(area('-', result), -6.168));
    });
  });

});
