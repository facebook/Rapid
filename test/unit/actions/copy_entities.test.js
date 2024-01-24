import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';


describe('actionCopyEntities', () => {
  it('copies a node', () => {
    const a = Rapid.osmNode({id: 'a'});
    const base = new Rapid.Graph([a]);

    const head = Rapid.actionCopyEntities(['a'], base)(base);
    assert.ok(head instanceof Rapid.Graph);
    assert.ok(head.hasEntity('a'));

    const diff = new Rapid.Difference(base, head);
    const created = diff.created();
    assert.equal(created.length, 1);
  });


  it('copies a way', () => {
    const a = Rapid.osmNode({id: 'a'});
    const b = Rapid.osmNode({id: 'b'});
    const w = Rapid.osmWay({id: 'w', nodes: ['a', 'b']});
    const base = new Rapid.Graph([a, b, w]);

    const head = Rapid.actionCopyEntities(['w'], base)(base);
    assert.ok(head instanceof Rapid.Graph);
    assert.ok(head.hasEntity('w'));

    const diff = new Rapid.Difference(base, head);
    const created = diff.created();
    assert.equal(created.length, 3);
  });


  it('copies multiple nodes', () => {
    const base = new Rapid.Graph([
      Rapid.osmNode({id: 'a'}),
      Rapid.osmNode({id: 'b'})
    ]);
    const head = Rapid.actionCopyEntities(['a', 'b'], base)(base);
    assert.ok(head instanceof Rapid.Graph);
    assert.ok(head.hasEntity('a'));
    assert.ok(head.hasEntity('b'));

    const diff = new Rapid.Difference(base, head);
    const created = diff.created();
    assert.equal(created.length, 2);
  });


  it('copies multiple ways, keeping the same connections', () => {
    const base = new Rapid.Graph([
      Rapid.osmNode({id: 'a'}),
      Rapid.osmNode({id: 'b'}),
      Rapid.osmNode({id: 'c'}),
      Rapid.osmWay({id: 'w1', nodes: ['a', 'b']}),
      Rapid.osmWay({id: 'w2', nodes: ['b', 'c']})
    ]);
    const action = Rapid.actionCopyEntities(['w1', 'w2'], base);
    const head = action(base);
    assert.ok(head instanceof Rapid.Graph);

    const diff = new Rapid.Difference(base, head);
    const created = diff.created();
    assert.equal(created.length, 5);

    // "copies" is a map of oldID -> newEntity
    // The new entities will not have the same ids, but the copy of 'b'
    // should appear in the same spot in the nodelists of the new ways.
    const copies = action.copies();
    assert.ok(copies instanceof Object);
    assert.deepEqual(copies.w1.nodes[1], copies.w2.nodes[0]);
  });


  it('obtains source entities from an alternate graph', () => {
    const a = Rapid.osmNode({id: 'a'});
    const old = new Rapid.Graph([a]);
    const base = new Rapid.Graph();
    const action = Rapid.actionCopyEntities(['a'], old);
    const head = action(base);

    assert.ok(head instanceof Rapid.Graph);
    assert.ok(!head.hasEntity('a'));

    const copies = action.copies();
    assert.ok(copies instanceof Object);
    assert.equal(Object.keys(copies).length, 1);
  });
});
