import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';


describe('actionMerge', () => {
  it('merges multiple points to a line', () => {
    const graph = new Rapid.Graph([
      Rapid.osmNode({id: 'a', tags: {a: 'a'}}),
      Rapid.osmNode({id: 'b', tags: {b: 'b'}}),
      Rapid.osmWay({id: 'w'}),
      Rapid.osmRelation({id: 'r', members: [{id: 'a', role: 'r', type: 'node'}]})
    ]);

    const action = Rapid.actionMerge(['a', 'b', 'w']);
    assert.ok(!action.disabled(graph));

    const result = action(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.ok(!result.hasEntity('a'));
    assert.ok(!result.hasEntity('b'));
    assert.deepEqual(result.entity('w').tags, {a: 'a', b: 'b'});
    assert.deepEqual(result.entity('r').members, [{id: 'w', role: 'r', type: 'way'}]);
  });


  it('merges multiple points to an area', () => {
    const graph = new Rapid.Graph([
      Rapid.osmNode({id: 'a', tags: {a: 'a'}}),
      Rapid.osmNode({id: 'b', tags: {b: 'b'}}),
      Rapid.osmWay({id: 'w', tags: {area: 'yes'}}),
      Rapid.osmRelation({id: 'r', members: [{id: 'a', role: 'r', type: 'node'}]})
    ]);

    const action = Rapid.actionMerge(['a', 'b', 'w']);
    assert.ok(!action.disabled(graph));

    const result = action(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.ok(!result.hasEntity('a'));
    assert.ok(!result.hasEntity('b'));
    assert.deepEqual(result.entity('w').tags, {a: 'a', b: 'b', area: 'yes'});
    assert.deepEqual(result.entity('r').members, [{id: 'w', role: 'r', type: 'way'}]);
  });


  it('preserves original point if possible', () => {
    const graph = new Rapid.Graph([
      Rapid.osmNode({id: 'a', loc: [1, 0], tags: {a: 'a'}}),
      Rapid.osmNode({id: 'p', loc: [0, 0], tags: {p: 'p'}}),
      Rapid.osmNode({id: 'q', loc: [0, 1]}),
      Rapid.osmWay({id: 'w', nodes: ['p', 'q'], tags: {w: 'w'}})
    ]);

    const action = Rapid.actionMerge(['a', 'w']);
    assert.ok(!action.disabled(graph));

    const result = action(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.ok(result.hasEntity('a'));
    assert.ok(result.hasEntity('p'));
    assert.ok(!result.hasEntity('q'));
    assert.deepEqual(result.entity('w').tags, {a: 'a', w: 'w'});
    assert.deepEqual(result.entity('w').nodes, ['p', 'a']);
    assert.deepEqual(result.entity('a').loc, [0, 1]);
  });


  it('merges tags from points to a line', () => {
    const graph = new Rapid.Graph([
      Rapid.osmNode({ id: 'a', tags: { a: 'a' } }),
      Rapid.osmNode({ id: 'b', tags: { b: 'b' } }),
      Rapid.osmWay({ id: 'w' })
    ]);

    const action = Rapid.actionMerge(['a', 'b', 'w']);
    assert.ok(!action.disabled(graph));

    const result = action(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.ok(!result.hasEntity('a'));
    assert.ok(!result.hasEntity('b'));
    assert.deepEqual(result.entity('w').tags, { a: 'a', b: 'b' });
  });


  it('merges tags from points to an area', () => {
    const graph = new Rapid.Graph([
      Rapid.osmNode({ id: 'a', tags: { a: 'a' } }),
      Rapid.osmNode({ id: 'b', tags: { b: 'b' } }),
      Rapid.osmWay({ id: 'w', tags: { area: 'yes' } })
    ]);

    const action = Rapid.actionMerge(['a', 'b', 'w']);
    assert.ok(!action.disabled(graph));

    const result = action(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.ok(!result.hasEntity('a'));
    assert.ok(!result.hasEntity('b'));
    assert.deepEqual(result.entity('w').tags, { a: 'a', b: 'b', area: 'yes' });
  });


  it('preserves original point if possible', () => {
    const graph = new Rapid.Graph([
      Rapid.osmNode({ id: 'a', loc: [1, 0], tags: { a: 'a' } }),
      Rapid.osmNode({ id: 'p', loc: [0, 0], tags: { p: 'p' } }),
      Rapid.osmNode({ id: 'q', loc: [0, 1] }),
      Rapid.osmWay({ id: 'w', nodes: ['p', 'q'], tags: { w: 'w' } })
    ]);

    const action = Rapid.actionMerge(['a', 'w']);
    assert.ok(!action.disabled(graph));

    const result = action(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.ok(result.hasEntity('a'));
    assert.ok(result.hasEntity('p'));
    assert.ok(!result.hasEntity('q'));
    assert.deepEqual(result.entity('w').tags, { a: 'a', w: 'w' });
    assert.deepEqual(result.entity('w').nodes, ['p', 'a']);
    assert.deepEqual(result.entity('a').loc, [0, 1]);
  });


  it('disables action when there are no points', () => {
    const graph = new Rapid.Graph([
      Rapid.osmWay({ id: 'w1', nodes: ['n1', 'n2'] }),
      Rapid.osmWay({ id: 'w2', nodes: ['n3', 'n4'] })
    ]);

    const action = Rapid.actionMerge(['w1', 'w2']);
    assert.strictEqual(action.disabled(graph), 'not_eligible');
  });


  it('disables action when there is more than one area or line', () => {
    const graph = new Rapid.Graph([
      Rapid.osmNode({ id: 'a', tags: { a: 'a' } }),
      Rapid.osmWay({ id: 'w1', nodes: ['n1', 'n2'] }),
      Rapid.osmWay({ id: 'w2', nodes: ['n3', 'n4'] })
    ]);

    const action = Rapid.actionMerge(['a', 'w1', 'w2']);
    assert.strictEqual(action.disabled(graph), 'not_eligible');
  });


  it('disables action when there are relations', () => {
    const graph = new Rapid.Graph([
      Rapid.osmNode({ id: 'a', tags: { a: 'a' } }),
      Rapid.osmWay({ id: 'w', nodes: ['n1', 'n2'] }),
      Rapid.osmRelation({ id: 'r', members: [{ type: 'node', id: 'n1' }] })
    ]);

    const action = Rapid.actionMerge(['a', 'w', 'r']);
    assert.strictEqual(action.disabled(graph), 'not_eligible');
  });
});
