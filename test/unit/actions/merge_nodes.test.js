import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';


describe('actionMergeNodes', () => {

  describe('#disabled', () => {
    it('enabled for both internal and endpoint nodes', () => {
      //
      // a --- b --- c
      //
      //       d
      //       |
      //       e
      //
      const graph = new Rapid.Graph([
        Rapid.osmNode({ id: 'a', loc: [-2,  2] }),
        Rapid.osmNode({ id: 'b', loc: [ 0,  2] }),
        Rapid.osmNode({ id: 'c', loc: [ 2,  2] }),
        Rapid.osmNode({ id: 'd', loc: [ 0,  0] }),
        Rapid.osmNode({ id: 'e', loc: [ 0, -2] }),
        Rapid.osmWay({ id: '-', nodes: ['a', 'b', 'c'] }),
        Rapid.osmWay({ id: '|', nodes: ['d', 'e'] })
      ]);

      const disabled = Rapid.actionMergeNodes(['b', 'e']).disabled(graph);
      assert.ok(!disabled);
    });
  });


  it('merges two isolated nodes, averaging loc', () => {
    const graph = new Rapid.Graph([
      Rapid.osmNode({ id: 'a', loc: [0, 0] }),
      Rapid.osmNode({ id: 'b', loc: [4, 4] })
    ]);

    const result = Rapid.actionMergeNodes(['a', 'b'])(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.ok(!result.hasEntity('a'));

    const survivor = result.hasEntity('b');
    assert.ok(survivor instanceof Rapid.osmNode);
    assert.deepEqual(survivor.loc, [2, 2], 'average loc of merged nodes');
  });


  it('merges two isolated nodes, merging tags, and keeping loc of the interesting node', () => {
    const graph = new Rapid.Graph([
      Rapid.osmNode({ id: 'a', loc: [0, 0], tags: { highway: 'traffic_signals' }}),
      Rapid.osmNode({ id: 'b', loc: [4, 4] })
    ]);

    const result = Rapid.actionMergeNodes(['a', 'b'])(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.ok(!result.hasEntity('a'));

    const survivor = result.hasEntity('b');
    assert.ok(survivor instanceof Rapid.osmNode);
    assert.deepEqual(survivor.tags, { highway: 'traffic_signals' });
    assert.deepEqual(survivor.loc, [0, 0], 'use loc of survivor');
  });


  it('merges two isolated nodes, merging tags, and averaging loc of both interesting nodes', () => {
    const graph = new Rapid.Graph([
      Rapid.osmNode({ id: 'a', loc: [0, -2], tags: { highway: 'traffic_signals' } }),
      Rapid.osmNode({ id: 'b', loc: [0,  2], tags: { crossing: 'marked' } })
    ]);

    const result = Rapid.actionMergeNodes(['a', 'b'])(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.ok(!result.hasEntity('a'));

    const survivor = result.hasEntity('b');
    assert.ok(survivor instanceof Rapid.osmNode);
    assert.deepEqual(survivor.tags, { highway: 'traffic_signals', crossing: 'marked' }, 'merge all tags');
    assert.deepEqual(survivor.loc, [0, 0], 'average loc of merged nodes');
  });


  it('merges two nodes along a single way', () => {
    //
    //  scenerio:         merge b,c:
    //
    //  a -- b -- c       a ---- c
    //
    const graph = new Rapid.Graph([
      Rapid.osmNode({ id: 'a', loc: [-2,  2] }),
      Rapid.osmNode({ id: 'b', loc: [ 0,  2] }),
      Rapid.osmNode({ id: 'c', loc: [ 2,  2] }),
      Rapid.osmWay({ id: '-', nodes: ['a', 'b', 'c'] })
    ]);

    const result = Rapid.actionMergeNodes(['b', 'c'])(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.ok(!result.hasEntity('b'));

    const survivor = result.hasEntity('c');
    assert.ok(survivor instanceof Rapid.osmNode);
    assert.deepEqual(survivor.loc, [1, 2], 'average loc of merged nodes');
    assert.equal(result.parentWays(survivor).length, 1);
  });


  it('merges two nodes from two ways', () => {
    //
    //  scenerio:        merge b,d:
    //
    //  a -- b -- c      a -_   _- c
    //                        d
    //       d                |
    //       |                |
    //       e                e
    //
    const graph = new Rapid.Graph([
      Rapid.osmNode({ id: 'a', loc: [-2,  2] }),
      Rapid.osmNode({ id: 'b', loc: [ 0,  2] }),
      Rapid.osmNode({ id: 'c', loc: [ 2,  2] }),
      Rapid.osmNode({ id: 'd', loc: [ 0,  0] }),
      Rapid.osmNode({ id: 'e', loc: [ 0, -2] }),
      Rapid.osmWay({ id: '-', nodes: ['a', 'b', 'c'] }),
      Rapid.osmWay({ id: '|', nodes: ['d', 'e'] })
    ]);

    const result = Rapid.actionMergeNodes(['b', 'd'])(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.ok(!result.hasEntity('b'));

    const survivor = result.hasEntity('d');
    assert.ok(survivor instanceof Rapid.osmNode);
    assert.deepEqual(survivor.loc, [0, 1], 'average loc of merged nodes');
    assert.equal(result.parentWays(survivor).length, 2);
  });


  it('merges three nodes from three ways', () => {
    //
    //  scenerio:        merge b,d:
    //
    //        c                c
    //        |                |
    //        d                |
    //                         |
    //  a --- b          a --- e
    //                         ‖
    //        e                ‖
    //        ‖                ‖
    //        f                f
    //
    const graph = new Rapid.Graph([
      Rapid.osmNode({ id: 'a', loc: [-2,  0] }),
      Rapid.osmNode({ id: 'b', loc: [ 0,  0] }),
      Rapid.osmNode({ id: 'c', loc: [ 0,  4] }),
      Rapid.osmNode({ id: 'd', loc: [ 0,  2] }),
      Rapid.osmNode({ id: 'e', loc: [ 0, -2] }),
      Rapid.osmNode({ id: 'f', loc: [ 0, -4] }),
      Rapid.osmWay({ id: '-', nodes: ['a', 'b'] }),
      Rapid.osmWay({ id: '|', nodes: ['c', 'd'] }),
      Rapid.osmWay({ id: '‖', nodes: ['e', 'f'] })
    ]);

    const result = Rapid.actionMergeNodes(['b', 'd', 'e'])(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.ok(!result.hasEntity('b'));
    assert.ok(!result.hasEntity('d'));

    const survivor = result.hasEntity('e');
    assert.ok(survivor instanceof Rapid.osmNode);
    assert.deepEqual(survivor.loc, [0, 0], 'average loc of merged nodes');
    assert.equal(result.parentWays(survivor).length, 3);
  });

});
