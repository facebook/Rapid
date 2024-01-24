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
});
