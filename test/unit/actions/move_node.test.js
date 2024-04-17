import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';

describe('actionMoveNode', () => {
  it('changes a node\'s location', () => {
    const node = Rapid.osmNode({ id: 'a', loc: [0, 0] });
    const toLoc = [2, 3];
    const graph = new Rapid.Graph([node]);

    const result = Rapid.actionMoveNode('a', toLoc)(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity('a').loc, toLoc);
  });


  describe('transitions', () => {
    it('is transitionable', () => {
      assert.equal(Rapid.actionMoveNode().transitionable, true);
    });


    it('move node at t = 0', () => {
      const node = Rapid.osmNode({ id: 'a', loc: [0, 0] });
      const toLoc = [2, 3];
      const graph = new Rapid.Graph([node]);

      const result = Rapid.actionMoveNode('a', toLoc)(graph, 0);
      assert.ok(result instanceof Rapid.Graph);
      assert.equal(result.entity('a').loc[0], 0);
      assert.equal(result.entity('a').loc[1], 0);
    });


    it('move node at t = 0.5', () => {
      const node = Rapid.osmNode({ id: 'a', loc: [0, 0] });
      const toLoc = [2, 3];
      const graph = new Rapid.Graph([node]);

      const result = Rapid.actionMoveNode('a', toLoc)(graph, 0.5);
      assert.ok(result instanceof Rapid.Graph);
      assert.equal(result.entity('a').loc[0], 1);
      assert.equal(result.entity('a').loc[1], 1.5);
    });


    it('move node at t = 1', () => {
      const node = Rapid.osmNode({ id: 'a', loc: [0, 0] });
      const toLoc = [2, 3];
      const graph = new Rapid.Graph([node]);

      const result = Rapid.actionMoveNode('a', toLoc)(graph, 1);
      assert.ok(result instanceof Rapid.Graph);
      assert.equal(result.entity('a').loc[0], 2);
      assert.equal(result.entity('a').loc[1], 3);
    });
  });
});
