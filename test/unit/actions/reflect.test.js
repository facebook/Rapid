import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';


describe('actionReflect', () => {
  const viewport = new Rapid.sdk.Viewport();

  it('does not create or remove nodes', () => {
    const graph = new Rapid.Graph([
      Rapid.osmNode({ id: 'a', loc: [0, 0] }),
      Rapid.osmNode({ id: 'b', loc: [4, 0] }),
      Rapid.osmNode({ id: 'c', loc: [4, 2] }),
      Rapid.osmNode({ id: 'd', loc: [1, 2] }),
      Rapid.osmWay({ id: '-', nodes: ['a', 'b', 'c', 'd', 'a'] })
    ]);
    const result = Rapid.actionReflect(['-'], viewport)(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity('-').nodes.length, 5);
  });


  it('reflects across long axis', () => {
    //    d -- c      a ---- b
    //   /     |  ->   \     |
    //  a ---- b        d -- c
    const graph = new Rapid.Graph([
      Rapid.osmNode({ id: 'a', loc: [0, 0] }),
      Rapid.osmNode({ id: 'b', loc: [4, 0] }),
      Rapid.osmNode({ id: 'c', loc: [4, 2] }),
      Rapid.osmNode({ id: 'd', loc: [1, 2] }),
      Rapid.osmWay({ id: '-', nodes: ['a', 'b', 'c', 'd', 'a'] })
    ]);
    const result = Rapid.actionReflect(['-'], viewport)(graph);
    assert.ok(result instanceof Rapid.Graph);
    const epsilon = 1e-9;
    assert.ok(Math.abs(result.entity('a').loc[0] - 0) < epsilon);
    assert.ok(Math.abs(result.entity('a').loc[1] - 2) < epsilon);
    assert.ok(Math.abs(result.entity('b').loc[0] - 4) < epsilon);
    assert.ok(Math.abs(result.entity('b').loc[1] - 2) < epsilon);
    assert.ok(Math.abs(result.entity('c').loc[0] - 4) < epsilon);
    assert.ok(Math.abs(result.entity('c').loc[1]) < epsilon);
    assert.ok(Math.abs(result.entity('d').loc[0] - 1) < epsilon);
    assert.ok(Math.abs(result.entity('d').loc[1]) < epsilon);
  });


  it('reflects across long axis', () => {
    //    d -- c      a ---- b
    //   /     |  ->   \     |
    //  a ---- b        d -- c
    const graph = new Rapid.Graph([
      Rapid.osmNode({ id: 'a', loc: [0, 0] }),
      Rapid.osmNode({ id: 'b', loc: [4, 0] }),
      Rapid.osmNode({ id: 'c', loc: [4, 2] }),
      Rapid.osmNode({ id: 'd', loc: [1, 2] }),
      Rapid.osmWay({ id: '-', nodes: ['a', 'b', 'c', 'd', 'a'] })
    ]);
    const result = Rapid.actionReflect(['-'], viewport)(graph);
    assert.ok(result instanceof Rapid.Graph);
    const epsilon = 1e-6;
    assert.ok(Math.abs(result.entity('a').loc[0] - 0) < epsilon);
    assert.ok(Math.abs(result.entity('a').loc[1] - 2) < epsilon);
    assert.ok(Math.abs(result.entity('b').loc[0] - 4) < epsilon);
    assert.ok(Math.abs(result.entity('b').loc[1] - 2) < epsilon);
    assert.ok(Math.abs(result.entity('c').loc[0] - 4) < epsilon);
    assert.ok(Math.abs(result.entity('c').loc[1]) < epsilon);
    assert.ok(Math.abs(result.entity('d').loc[0] - 1) < epsilon);
    assert.ok(Math.abs(result.entity('d').loc[1]) < epsilon);
  });


  it('reflects across short axis', () => {
    //    d -- c      c -- d
    //   /     |  ->  |     \
    //  a ---- b      b ---- a
    const graph = new Rapid.Graph([
      Rapid.osmNode({ id: 'a', loc: [0, 0] }),
      Rapid.osmNode({ id: 'b', loc: [4, 0] }),
      Rapid.osmNode({ id: 'c', loc: [4, 2] }),
      Rapid.osmNode({ id: 'd', loc: [1, 2] }),
      Rapid.osmWay({ id: '-', nodes: ['a', 'b', 'c', 'd', 'a'] })
    ]);
    const result = Rapid.actionReflect(['-'], viewport).useLongAxis(false)(graph);
    assert.ok(result instanceof Rapid.Graph);

    const epsilon = 1e-6;
    assert.ok(Math.abs(result.entity('a').loc[0] - 4) < epsilon);
    assert.ok(Math.abs(result.entity('a').loc[1]) < epsilon);
    assert.ok(Math.abs(result.entity('b').loc[0]) < epsilon);
    assert.ok(Math.abs(result.entity('b').loc[1]) < epsilon);
    assert.ok(Math.abs(result.entity('c').loc[0]) < epsilon);
    assert.ok(Math.abs(result.entity('c').loc[1] - 2) < epsilon);
    assert.ok(Math.abs(result.entity('d').loc[0] - 3) < epsilon);
    assert.ok(Math.abs(result.entity('d').loc[1] - 2) < epsilon);
  });


  describe('transitions', () => {
    it('is transitionable', () => {
      assert.equal(Rapid.actionReflect().transitionable, true);
    });


    it('reflect long at t = 0', () => {
      const graph = new Rapid.Graph([
        Rapid.osmNode({ id: 'a', loc: [0, 0] }),
        Rapid.osmNode({ id: 'b', loc: [4, 0] }),
        Rapid.osmNode({ id: 'c', loc: [4, 2] }),
        Rapid.osmNode({ id: 'd', loc: [1, 2] }),
        Rapid.osmWay({ id: '-', nodes: ['a', 'b', 'c', 'd', 'a'] })
      ]);
      const result = Rapid.actionReflect(['-'], viewport)(graph, 0);
      assert.ok(result instanceof Rapid.Graph);

      const epsilon = 1e-6;
      assert.ok(Math.abs(result.entity('a').loc[0]) < epsilon);
      assert.ok(Math.abs(result.entity('a').loc[1]) < epsilon);
      assert.ok(Math.abs(result.entity('b').loc[0] - 4) < epsilon);
      assert.ok(Math.abs(result.entity('b').loc[1]) < epsilon);
      assert.ok(Math.abs(result.entity('c').loc[0] - 4) < epsilon);
      assert.ok(Math.abs(result.entity('c').loc[1] - 2) < epsilon);
      assert.ok(Math.abs(result.entity('d').loc[0] - 1) < epsilon);
      assert.ok(Math.abs(result.entity('d').loc[1] - 2) < epsilon);
    });


    it('reflect long at t = 0.5', () => {
      const graph = new Rapid.Graph([
        Rapid.osmNode({ id: 'a', loc: [0, 0] }),
        Rapid.osmNode({ id: 'b', loc: [4, 0] }),
        Rapid.osmNode({ id: 'c', loc: [4, 2] }),
        Rapid.osmNode({ id: 'd', loc: [1, 2] }),
        Rapid.osmWay({ id: '-', nodes: ['a', 'b', 'c', 'd', 'a'] })
      ]);
      const result = Rapid.actionReflect(['-'], viewport)(graph, 0.5);
      assert.ok(result instanceof Rapid.Graph);

      const epsilon = 1e-6;
      assert.ok(Math.abs(result.entity('a').loc[0]) < epsilon);
      assert.ok(Math.abs(result.entity('a').loc[1] - 1) < epsilon);
      assert.ok(Math.abs(result.entity('b').loc[0] - 4) < epsilon);
      assert.ok(Math.abs(result.entity('b').loc[1] - 1) < epsilon);
      assert.ok(Math.abs(result.entity('c').loc[0] - 4) < epsilon);
      assert.ok(Math.abs(result.entity('c').loc[1] - 1) < epsilon);
      assert.ok(Math.abs(result.entity('d').loc[0] - 1) < epsilon);
      assert.ok(Math.abs(result.entity('d').loc[1] - 1) < epsilon);
    });


    it('reflect short at t = 1', () => {
      const graph = new Rapid.Graph([
        Rapid.osmNode({ id: 'a', loc: [0, 0] }),
        Rapid.osmNode({ id: 'b', loc: [4, 0] }),
        Rapid.osmNode({ id: 'c', loc: [4, 2] }),
        Rapid.osmNode({ id: 'd', loc: [1, 2] }),
        Rapid.osmWay({ id: '-', nodes: ['a', 'b', 'c', 'd', 'a'] })
      ]);
      const result = Rapid.actionReflect(['-'], viewport).useLongAxis(false)(graph, 1);
      assert.ok(result instanceof Rapid.Graph);

      const epsilon = 1e-6;
      assert.ok(Math.abs(result.entity('a').loc[0] - 4) < epsilon);
      assert.ok(Math.abs(result.entity('a').loc[1]) < epsilon);
      assert.ok(Math.abs(result.entity('b').loc[0]) < epsilon);
      assert.ok(Math.abs(result.entity('b').loc[1]) < epsilon);
      assert.ok(Math.abs(result.entity('c').loc[0]) < epsilon);
      assert.ok(Math.abs(result.entity('c').loc[1] - 2) < epsilon);
      assert.ok(Math.abs(result.entity('d').loc[0] - 3) < epsilon);
      assert.ok(Math.abs(result.entity('d').loc[1] - 2) < epsilon);
    });
  });
});
