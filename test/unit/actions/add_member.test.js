import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';

test('actionAddMember', async t => {
  await t.test('adds an member to a relation at the specified index', t => {
    const r = Rapid.osmRelation({members: [{id: '1'}, {id: '3'}]});
    const graph = new Rapid.Graph([r]);
    const result = Rapid.actionAddMember(r.id, {id: '2'}, 1)(graph);
    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity(r.id).members, [{id: '1'}, {id: '2'}, {id: '3'}]);
  });

  await t.test('inserts way members at a sensible index', async t => {
    function members(graph) {
      return graph.entity('r').members.map(m => m.id);
    }

    await t.test('handles incomplete relations', t => {
      const graph = new Rapid.Graph([
        Rapid.osmNode({id: 'a', loc: [0, 0]}),
        Rapid.osmNode({id: 'b', loc: [0, 0]}),
        Rapid.osmNode({id: 'c', loc: [0, 0]}),
        Rapid.osmNode({id: 'd', loc: [0, 0]}),
        Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c']}),
        Rapid.osmWay({id: '=', nodes: ['c','d']}),
        Rapid.osmRelation({id: 'r', members: [
          {id: '~', type: 'way'},
          {id: '-', type: 'way'}
        ]})
      ]);

      const result = Rapid.actionAddMember('r', {id: '=', type: 'way'})(graph);
      assert.ok(result instanceof Rapid.Graph);
      assert.deepEqual(members(result), ['~', '-', '=']);
    });

    await t.test('adds the member to a relation with no members', t => {
      const graph = new Rapid.Graph([
        Rapid.osmNode({id: 'a', loc: [0, 0]}),
        Rapid.osmNode({id: 'b', loc: [0, 0]}),
        Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
        Rapid.osmRelation({id: 'r'})
      ]);

      const result = Rapid.actionAddMember('r', {id: '-', type: 'way'})(graph);
      assert.ok(result instanceof Rapid.Graph);
      assert.deepEqual(members(result), ['-']);
    });

    await t.test('appends the member if the ways are not connecting', t => {
      // Before:  a ---> b
      // After:   a ---> b .. c ===> d
      const graph = new Rapid.Graph([
        Rapid.osmNode({id: 'a', loc: [0, 0]}),
        Rapid.osmNode({id: 'b', loc: [0, 0]}),
        Rapid.osmNode({id: 'c', loc: [0, 0]}),
        Rapid.osmNode({id: 'd', loc: [0, 0]}),
        Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
        Rapid.osmWay({id: '=', nodes: ['c', 'd']}),
        Rapid.osmRelation({id: 'r', members: [
          {id: '-', type: 'way'}
        ]})
      ]);

      const result = Rapid.actionAddMember('r', {id: '=', type: 'way'})(graph);
      assert.ok(result instanceof Rapid.Graph);
      assert.deepEqual(members(result), ['-', '=']);
    });

    await t.test('appends the member if the way connects at end', t => {
      // Before:   a ---> b
      // After:    a ---> b ===> c
      const graph = new Rapid.Graph([
        Rapid.osmNode({id: 'a', loc: [0, 0]}),
        Rapid.osmNode({id: 'b', loc: [0, 0]}),
        Rapid.osmNode({id: 'c', loc: [0, 0]}),
        Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
        Rapid.osmWay({id: '=', nodes: ['b', 'c']}),
        Rapid.osmRelation({id: 'r', members: [
          {id: '-', type: 'way'}
        ]})
      ]);

      const result = Rapid.actionAddMember('r', {id: '=', type: 'way'})(graph);
      assert.ok(result instanceof Rapid.Graph);
      assert.deepEqual(members(result), ['-', '=']);
    });

    await t.test('inserts the member if the way connects at beginning', t => {
      // Before:          b ---> c ~~~> d
      // After:    a ===> b ---> c ~~~> d
      const graph = new Rapid.Graph([
        Rapid.osmNode({id: 'a', loc: [0, 0]}),
        Rapid.osmNode({id: 'b', loc: [0, 0]}),
        Rapid.osmNode({id: 'c', loc: [0, 0]}),
        Rapid.osmNode({id: 'd', loc: [0, 0]}),
        Rapid.osmWay({id: '=', nodes: ['a', 'b']}),
        Rapid.osmWay({id: '-', nodes: ['b', 'c']}),
        Rapid.osmWay({id: '~', nodes: ['c', 'd']}),
        Rapid.osmRelation({id: 'r', members: [
          {id: '-', type: 'way'},
          {id: '~', type: 'way'}
        ]})
      ]);

      const result = Rapid.actionAddMember('r', {id: '=', type: 'way'})(graph);
      assert.ok(result instanceof Rapid.Graph);
      assert.deepEqual(members(result), ['=', '-', '~']);
    });

    await t.test('inserts the member if the way connects in middle', t => {
      // Before:  a ---> b  ..  c ~~~> d
      // After:   a ---> b ===> c ~~~> d
      const graph = new Rapid.Graph([
        Rapid.osmNode({id: 'a', loc: [0, 0]}),
        Rapid.osmNode({id: 'b', loc: [0, 0]}),
        Rapid.osmNode({id: 'c', loc: [0, 0]}),
        Rapid.osmNode({id: 'd', loc: [0, 0]}),
        Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
        Rapid.osmWay({id: '=', nodes: ['b', 'c']}),
        Rapid.osmWay({id: '~', nodes: ['c', 'd']}),
        Rapid.osmRelation({id: 'r', members: [
          {id: '-', type: 'way'},
          {id: '~', type: 'way'}
        ]})
      ]);

      const result = Rapid.actionAddMember('r', {id: '=', type: 'way'})(graph);
      assert.ok(result instanceof Rapid.Graph);
      assert.deepEqual(members(result), ['-', '=', '~']);
    });

    await t.test('inserts the member multiple times if insertPair provided (middle)', t => {
      // Before:  a ---> b  ..  c ~~~> d <~~~ c  ..  b <--- a
      // After:   a ---> b ===> c ~~~> d <~~~ c <=== b <--- a
      const graph = new Rapid.Graph([
        Rapid.osmNode({id: 'a', loc: [0, 0]}),
        Rapid.osmNode({id: 'b', loc: [0, 0]}),
        Rapid.osmNode({id: 'c', loc: [0, 0]}),
        Rapid.osmNode({id: 'd', loc: [0, 0]}),
        Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
        Rapid.osmWay({id: '=', nodes: ['b', 'c']}),
        Rapid.osmWay({id: '~', nodes: ['c', 'd']}),
        Rapid.osmRelation({id: 'r', members: [
          {id: '-', type: 'way'},
          {id: '~', type: 'way'},
          {id: '~', type: 'way'},
          {id: '-', type: 'way'}
        ]})
      ]);

      const member = { id: '=', type: 'way' };
      const insertPair = {
        originalID: '-',
        insertedID: '=',
        nodes: ['a','b','c']
      };
      const result = Rapid.actionAddMember('r', member, undefined, insertPair)(graph);
      assert.ok(result instanceof Rapid.Graph);
      assert.deepEqual(members(result), ['-', '=', '~', '~', '=', '-']);
    });

    await t.test('inserts the member multiple times if insertPair provided (beginning/end)', t => {
      // Before:         b <=== c ~~~> d <~~~ c ===> b
      // After:   a <--- b <=== c ~~~> d <~~~ c ===> b ---> a
      const graph = new Rapid.Graph([
        Rapid.osmNode({id: 'a', loc: [0, 0]}),
        Rapid.osmNode({id: 'b', loc: [0, 0]}),
        Rapid.osmNode({id: 'c', loc: [0, 0]}),
        Rapid.osmNode({id: 'd', loc: [0, 0]}),
        Rapid.osmWay({id: '-', nodes: ['b', 'a']}),
        Rapid.osmWay({id: '=', nodes: ['c', 'b']}),
        Rapid.osmWay({id: '~', nodes: ['c', 'd']}),
        Rapid.osmRelation({id: 'r', members: [
          {id: '=', type: 'way'},
          {id: '~', type: 'way'},
          {id: '~', type: 'way'},
          {id: '=', type: 'way'}
        ]})
      ]);

      const member = { id: '-', type: 'way' };
      const insertPair = {
        originalID: '=',
        insertedID: '-',
        nodes: ['c','b','a']
      };
      const result = Rapid.actionAddMember('r', member, undefined, insertPair)(graph);
      assert.ok(result instanceof Rapid.Graph);
      assert.deepEqual(members(result), ['-', '=', '~', '~', '=', '-']);
    });

    await t.test('keeps stops and platforms ordered before node, way, relation (for PTv2 routes)', t => {
      const graph = new Rapid.Graph([
        Rapid.osmNode({id: 'a', loc: [0, 0]}),
        Rapid.osmNode({id: 'b', loc: [0, 0]}),
        Rapid.osmNode({id: 'c', loc: [0, 0]}),
        Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
        Rapid.osmWay({id: '=', nodes: ['b', 'c']}),
        Rapid.osmRelation({id: 'r', members: [
          { id: 'n1', type: 'node', role: 'stop' },
          { id: 'w1', type: 'way', role: 'platform' },
          { id: 'n2', type: 'node', role: 'stop_entry_only' },
          { id: 'w2', type: 'way', role: 'platform_entry_only' },
          { id: 'n3', type: 'node', role: 'stop_exit_only' },
          { id: 'w3', type: 'way', role: 'platform_exit_only' },
          { id: 'n10', type: 'node', role: 'forward' },
          { id: 'n11', type: 'node', role: 'forward' },
          { id: '-', type: 'way', role: 'forward' },
          { id: 'r1', type: 'relation', role: 'forward' },
          { id: 'n12', type: 'node', role: 'forward' }
        ]})
      ]);

      const result = Rapid.actionAddMember('r', { id: '=', type: 'way', role: 'forward' })(graph);
      assert.ok(result instanceof Rapid.Graph);
      assert.deepEqual(members(result), ['n1', 'w1', 'n2', 'w2', 'n3', 'w3', 'n10', 'n11', 'n12', '-', '=', 'r1']);
    });

  });
});
