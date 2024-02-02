import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';


describe('multipolygons', () => {

  describe('osmIsOldMultipolygonOuterMember', () => {
    it('returns the parent relation of a simple multipolygon outer', () => {
      const outer = Rapid.osmWay({ tags: { 'natural': 'wood' } });
      const relation = Rapid.osmRelation({ tags: { type: 'multipolygon' }, members: [{ id: outer.id, role: 'outer' }] });
      const graph = new Rapid.Graph([outer, relation]);
      assert.equal(Rapid.osmIsOldMultipolygonOuterMember(outer, graph), relation);
    });

    it('returns the parent relation of a simple multipolygon outer, assuming role outer if unspecified', () => {
      const outer = Rapid.osmWay({ tags: { 'natural': 'wood' } });
      const relation = Rapid.osmRelation({ tags: { type: 'multipolygon' }, members: [{ id: outer.id }] });
      const graph = new Rapid.Graph([outer, relation]);
      assert.equal(Rapid.osmIsOldMultipolygonOuterMember(outer, graph), relation);
    });

    it('returns false if entity is not a way', () => {
      const outer = Rapid.osmNode({ tags: { 'natural': 'wood' } });
      const relation = Rapid.osmRelation({ tags: { type: 'multipolygon' }, members: [{ id: outer.id, role: 'outer' }] });
      const graph = new Rapid.Graph([outer, relation]);
      assert.equal(Rapid.osmIsOldMultipolygonOuterMember(outer, graph), false);
    });

    it('returns false if entity does not have interesting tags', () => {
      const outer = Rapid.osmWay({ tags: { 'tiger:reviewed': 'no' } });
      const relation = Rapid.osmRelation({ tags: { type: 'multipolygon' }, members: [{ id: outer.id, role: 'outer' }] });
      const graph = new Rapid.Graph([outer, relation]);
      assert.equal(Rapid.osmIsOldMultipolygonOuterMember(outer, graph), false);
    });

    it('returns false if entity does not have a parent relation', () => {
      const outer = Rapid.osmWay({ tags: { 'natural': 'wood' } });
      const graph = new Rapid.Graph([outer]);
      assert.equal(Rapid.osmIsOldMultipolygonOuterMember(outer, graph), false);
    });

    it('returns false if the parent is not a multipolygon', () => {
      const outer = Rapid.osmWay({ tags: { 'natural': 'wood' } });
      const relation = Rapid.osmRelation({ tags: { type: 'route' }, members: [{ id: outer.id, role: 'outer' }] });
      const graph = new Rapid.Graph([outer, relation]);
      assert.equal(Rapid.osmIsOldMultipolygonOuterMember(outer, graph), false);
    });

    it('returns false if the parent has interesting tags', () => {
      const outer = Rapid.osmWay({ tags: { 'natural': 'wood' } });
      const relation = Rapid.osmRelation({ tags: { natural: 'wood', type: 'multipolygon' }, members: [{ id: outer.id, role: 'outer' }] });
      const graph = new Rapid.Graph([outer, relation]);
      assert.equal(Rapid.osmIsOldMultipolygonOuterMember(outer, graph), false);
    });

    it('returns the parent relation of a simple multipolygon outer, ignoring uninteresting parent tags', () => {
      const outer = Rapid.osmWay({ tags: { 'natural': 'wood' } });
      const relation = Rapid.osmRelation({ tags: { 'tiger:reviewed': 'no', type: 'multipolygon' }, members: [{ id: outer.id, role: 'outer' }] });
      const graph = new Rapid.Graph([outer, relation]);
      assert.equal(Rapid.osmIsOldMultipolygonOuterMember(outer, graph), relation);
    });

    it('returns false if the parent has multiple outer ways', () => {
      const outer1 = Rapid.osmWay({ tags: { 'natural': 'wood' } });
      const outer2 = Rapid.osmWay({ tags: { 'natural': 'wood' } });
      const relation = Rapid.osmRelation({ tags: { type: 'multipolygon' }, members: [{ id: outer1.id, role: 'outer' }, { id: outer2.id, role: 'outer' }] });
      const graph = new Rapid.Graph([outer1, outer2, relation]);
      assert.equal(Rapid.osmIsOldMultipolygonOuterMember(outer1, graph), false);
      assert.equal(Rapid.osmIsOldMultipolygonOuterMember(outer2, graph), false);
    });

    it('returns false if the parent has multiple outer ways, assuming role outer if unspecified', () => {
      const outer1 = Rapid.osmWay({ tags: { 'natural': 'wood' } });
      const outer2 = Rapid.osmWay({ tags: { 'natural': 'wood' } });
      const relation = Rapid.osmRelation({ tags: { type: 'multipolygon' }, members: [{ id: outer1.id }, { id: outer2.id }] });
      const graph = new Rapid.Graph([outer1, outer2, relation]);
      assert.equal(Rapid.osmIsOldMultipolygonOuterMember(outer1, graph), false);
      assert.equal(Rapid.osmIsOldMultipolygonOuterMember(outer2, graph), false);
    });

    it('returns false if the entity is not an outer', () => {
      const inner = Rapid.osmWay({ tags: { 'natural': 'wood' } });
      const relation = Rapid.osmRelation({ tags: { type: 'multipolygon' }, members: [{ id: inner.id, role: 'inner' }] });
      const graph = new Rapid.Graph([inner, relation]);
      assert.equal(Rapid.osmIsOldMultipolygonOuterMember(inner, graph), false);
    });
  });


  describe('osmOldMultipolygonOuterMember', () => {
    it('returns the outer member of a simple multipolygon', () => {
      const inner = Rapid.osmWay();
      const outer = Rapid.osmWay({ tags: { 'natural': 'wood' } });
      const relation = Rapid.osmRelation({
        tags: { type: 'multipolygon' },
        members: [
          { id: outer.id, role: 'outer' },
          { id: inner.id, role: 'inner' }
        ]
      });
      const graph = new Rapid.Graph([inner, outer, relation]);

      assert.equal(Rapid.osmOldMultipolygonOuterMember(inner, graph), outer);
      assert.equal(Rapid.osmOldMultipolygonOuterMember(outer, graph), outer);
    });

    it('returns falsy for a complex multipolygon', () => {
      const inner = Rapid.osmWay();
      const outer1 = Rapid.osmWay({ tags: { 'natural': 'wood' } });
      const outer2 = Rapid.osmWay({ tags: { 'natural': 'wood' } });
      const relation = Rapid.osmRelation({
        tags: { type: 'multipolygon' },
        members: [
          { id: outer1.id, role: 'outer' },
          { id: outer2.id, role: 'outer' },
          { id: inner.id, role: 'inner' }
        ]
      });
      const graph = new Rapid.Graph([inner, outer1, outer2, relation]);

      assert.ok(!Rapid.osmOldMultipolygonOuterMember(inner, graph));
      assert.ok(!Rapid.osmOldMultipolygonOuterMember(outer1, graph));
      assert.ok(!Rapid.osmOldMultipolygonOuterMember(outer2, graph));
    });

    it('handles incomplete relations', () => {
      const way = Rapid.osmWay({ id: 'w' });
      const relation = Rapid.osmRelation({
        id: 'r',
        tags: { type: 'multipolygon' },
        members: [
          { id: 'o', role: 'outer' },
          { id: 'w', role: 'inner' }
        ]
      });
      const graph = new Rapid.Graph([way, relation]);
      assert.ok(!Rapid.osmOldMultipolygonOuterMember(way, graph));
    });
  });


  describe('osmJoinWays', () => {
    function getIDs(objects) {
      return objects.map(node => node.id);
    }

    it('returns an array of members with nodes properties', () => {
      const node = Rapid.osmNode({ id: 'a', loc: [0, 0] });
      const way = Rapid.osmWay({ id: '-', nodes: ['a'] });
      const member = { id: '-', type: 'way' };
      const graph = new Rapid.Graph([node, way]);
      const result = Rapid.osmJoinWays([member], graph);

      assert.ok(result instanceof Array);
      assert.equal(result.length, 1);
      assert.deepEqual(result.actions, []);

      assert.ok(result[0] instanceof Array);
      assert.equal(result[0].length, 1);
      assert.deepEqual(getIDs(result[0].nodes), ['a']);
      assert.deepEqual(result[0][0], member);
    });

    it('joins ways (ordered - w1, w2)', () => {
      //
      //  a ---> b ===> c
      //
      const a = Rapid.osmNode({ id: 'a', loc: [0, 0] });
      const b = Rapid.osmNode({ id: 'b', loc: [1, 0] });
      const c = Rapid.osmNode({ id: 'c', loc: [2, 0] });
      const w1 = Rapid.osmWay({ id: '-', nodes: ['a', 'b'] });
      const w2 = Rapid.osmWay({ id: '=', nodes: ['b', 'c'] });
      const graph = new Rapid.Graph([a, b, c, w1, w2]);
      const result = Rapid.osmJoinWays([w1, w2], graph);

      assert.ok(result instanceof Array);
      assert.equal(result.length, 1);
      assert.deepEqual(result.actions, []);

      assert.ok(result[0] instanceof Array);
      assert.equal(result[0].length, 2);
      assert.deepEqual(getIDs(result[0].nodes), ['a', 'b', 'c']);
      assert.deepEqual(result[0][0], w1);
      assert.deepEqual(result[0][1], w2);
    });

    it('joins ways (unordered - w2, w1)', () => {
      //
      //  a ---> b ===> c
      //
      const a = Rapid.osmNode({ id: 'a', loc: [0, 0] });
      const b = Rapid.osmNode({ id: 'b', loc: [1, 0] });
      const c = Rapid.osmNode({ id: 'c', loc: [2, 0] });
      const w1 = Rapid.osmWay({ id: '-', nodes: ['a', 'b'] });
      const w2 = Rapid.osmWay({ id: '=', nodes: ['b', 'c'] });
      const graph = new Rapid.Graph([a, b, c, w1, w2]);
      const result = Rapid.osmJoinWays([w2, w1], graph);

      assert.ok(result instanceof Array);
      assert.equal(result.length, 1);
      assert.deepEqual(result.actions, []);

      assert.ok(result[0] instanceof Array);
      assert.equal(result[0].length, 2);
      assert.deepEqual(getIDs(result[0].nodes), ['a', 'b', 'c']);
      assert.deepEqual(result[0][0], w1);
      assert.deepEqual(result[0][1], w2);
    });

    it('joins relation members (ordered -, =)', () => {
      //
      //  a ---> b ===> c
      //  r: ['-', '=']
      //
      const a = Rapid.osmNode({ id: 'a', loc: [0, 0] });
      const b = Rapid.osmNode({ id: 'b', loc: [1, 0] });
      const c = Rapid.osmNode({ id: 'c', loc: [2, 0] });
      const w1 = Rapid.osmWay({ id: '-', nodes: ['a', 'b'] });
      const w2 = Rapid.osmWay({ id: '=', nodes: ['b', 'c'] });
      const r = Rapid.osmRelation({
        id: 'r',
        members: [
          { id: '-', type: 'way' },
          { id: '=', type: 'way' }
        ]
      });
      const graph = new Rapid.Graph([a, b, c, w1, w2, r]);
      const result = Rapid.osmJoinWays(r.members, graph);

      assert.ok(result instanceof Array);
      assert.equal(result.length, 1);
      assert.deepEqual(result.actions, []);

      assert.ok(result[0] instanceof Array);
      assert.equal(result[0].length, 2);
      assert.deepEqual(getIDs(result[0].nodes), ['a', 'b', 'c']);
      assert.deepEqual(result[0][0], { id: '-', type: 'way' });
      assert.deepEqual(result[0][1], { id: '=', type: 'way' });
    });

    it('joins relation members (ordered =, -)', () => {
      //
      //  a ---> b ===> c
      //  r: ['=', '-']
      //
      const a = Rapid.osmNode({ id: 'a', loc: [0, 0] });
      const b = Rapid.osmNode({ id: 'b', loc: [1, 0] });
      const c = Rapid.osmNode({ id: 'c', loc: [2, 0] });
      const w1 = Rapid.osmWay({ id: '-', nodes: ['a', 'b'] });
      const w2 = Rapid.osmWay({ id: '=', nodes: ['b', 'c'] });
      const r = Rapid.osmRelation({
        id: 'r',
        members: [
          { id: '=', type: 'way' },
          { id: '-', type: 'way' }
        ]
      });
      const graph = new Rapid.Graph([a, b, c, w1, w2, r]);
      const result = Rapid.osmJoinWays(r.members, graph);

      assert.ok(result instanceof Array);
      assert.equal(result.length, 1);

      assert.ok(result.actions instanceof Array);
      assert.equal(result.actions.length, 2);

      assert.ok(result[0] instanceof Array);
      assert.equal(result[0].length, 2);
      assert.deepEqual(getIDs(result[0].nodes), ['c', 'b', 'a']);
      assert.deepEqual(result[0][0], { id: '=', type: 'way' });
      assert.deepEqual(result[0][1], { id: '-', type: 'way' });
    });

    it('returns joined members in the correct order', () => {
      //
      //  a <=== b ---> c ~~~> d
      //  r: ['-', '~', '=']
      //
      const a = Rapid.osmNode({ id: 'a', loc: [0, 0] });
      const b = Rapid.osmNode({ id: 'b', loc: [1, 0] });
      const c = Rapid.osmNode({ id: 'c', loc: [2, 0] });
      const d = Rapid.osmNode({ id: 'd', loc: [3, 0] });
      const w1 = Rapid.osmWay({ id: '-', nodes: ['b', 'c'] });
      const w2 = Rapid.osmWay({ id: '=', nodes: ['b', 'a'] });
      const w3 = Rapid.osmWay({ id: '~', nodes: ['c', 'd'] });
      const r = Rapid.osmRelation({
        id: 'r',
        members: [
          { id: '-', type: 'way' },
          { id: '~', type: 'way' },
          { id: '=', type: 'way' }
        ]
      });
      const graph = new Rapid.Graph([a, b, c, d, w1, w2, w3, r]);
      const result = Rapid.osmJoinWays(r.members, graph);

      assert.ok(result instanceof Array);
      assert.equal(result.length, 1);

      assert.ok(result.actions instanceof Array);
      assert.equal(result.actions.length, 1);

      assert.ok(result[0] instanceof Array);
      assert.equal(result[0].length, 3);
      assert.deepEqual(getIDs(result[0].nodes), ['a', 'b', 'c', 'd']);
      assert.deepEqual(result[0][0], { id: '=', type: 'way' });
      assert.deepEqual(result[0][1], { id: '-', type: 'way' });
      assert.deepEqual(result[0][2], { id: '~', type: 'way' });
    });

    it('reverses member tags of reversed segements', () => {
      //
      // Source:
      //   a ---> b <=== c
      // Result:
      //   a ---> b ===> c    (and tags on === reversed)
      //
      const a = Rapid.osmNode({ id: 'a', loc: [0, 0] });
      const b = Rapid.osmNode({ id: 'b', loc: [1, 0] });
      const c = Rapid.osmNode({ id: 'c', loc: [2, 0] });
      const w1 = Rapid.osmWay({ id: '-', nodes: ['a', 'b'] });
      const w2 = Rapid.osmWay({ id: '=', nodes: ['c', 'b'], tags: { 'oneway': 'yes', 'lanes:forward': 2 } });
      const graph = new Rapid.Graph([a, b, c, w1, w2]);
      const result = Rapid.osmJoinWays([w1, w2], graph);

      assert.ok(result instanceof Array);
      assert.equal(result.length, 1);

      assert.ok(result.actions instanceof Array);
      assert.equal(result.actions.length, 1);

      assert.ok(result[0] instanceof Array);
      assert.equal(result[0].length, 2);
      assert.deepEqual(getIDs(result[0].nodes), ['a', 'b', 'c']);

      assert.ok(result[0][0] instanceof Rapid.osmWay);
      assert.deepEqual(result[0][0].nodes, ['a', 'b']);

      assert.ok(result[0][1] instanceof Rapid.osmWay);
      assert.deepEqual(result[0][1].nodes, ['b', 'c']);
      assert.deepEqual(result[0][1].tags, { 'oneway': '-1', 'lanes:backward': 2 });
    });

    it('reverses the initial segment to preserve member order when joining relation members', () => {
      //
      // Source:
      //   a <--- b ===> c
      // Result:
      //   a ---> b ===> c   (and --- reversed)
      //
      const a = Rapid.osmNode({ id: 'a', loc: [0, 0] });
      const b = Rapid.osmNode({ id: 'b', loc: [1, 0] });
      const c = Rapid.osmNode({ id: 'c', loc: [2, 0] });
      const w1 = Rapid.osmWay({ id: '-', nodes: ['b', 'a'], tags: { 'oneway': 'yes', 'lanes:forward': 2 } });
      const w2 = Rapid.osmWay({ id: '=', nodes: ['b', 'c'] });
      const r = Rapid.osmRelation({
        id: 'r',
        members: [
          { id: '-', type: 'way' },
          { id: '=', type: 'way' }
        ]
      });
      const graph = new Rapid.Graph([a, b, c, w1, w2, r]);
      const result = Rapid.osmJoinWays(r.members, graph);

      assert.ok(result instanceof Array);
      assert.equal(result.length, 1);

      assert.ok(result.actions instanceof Array);
      assert.equal(result.actions.length, 1);

      assert.ok(result[0] instanceof Array);
      assert.equal(result[0].length, 2);
      assert.deepEqual(getIDs(result[0].nodes), ['a', 'b', 'c']);
      assert.deepEqual(result[0][0], { id: '-', type: 'way' });
      assert.deepEqual(result[0][1], { id: '=', type: 'way' });
    });

    it('ignores non-way members', () => {
      const node = Rapid.osmNode({ loc: [0, 0] });
      const member = { id: 'n', type: 'node' };
      const graph = new Rapid.Graph([node]);
      const result = Rapid.osmJoinWays([member], graph);
      assert.ok(result instanceof Array);
      assert.equal(result.length, 0);
    });

    it('ignores incomplete members', () => {
      const member = { id: 'w', type: 'way' };
      const graph = new Rapid.Graph();
      const result = Rapid.osmJoinWays([member], graph);
      assert.ok(result instanceof Array);
      assert.equal(result.length, 0);
    });

    it('returns multiple arrays for disjoint ways', () => {
      //
      //     b
      //    / \
      //   a   c     d ---> e ===> f
      //
      const a = Rapid.osmNode({ id: 'a', loc: [0, 0] });
      const b = Rapid.osmNode({ id: 'b', loc: [1, 1] });
      const c = Rapid.osmNode({ id: 'c', loc: [2, 0] });
      const d = Rapid.osmNode({ id: 'd', loc: [5, 0] });
      const e = Rapid.osmNode({ id: 'e', loc: [6, 0] });
      const f = Rapid.osmNode({ id: 'f', loc: [7, 0] });
      const w1 = Rapid.osmWay({ id: '/', nodes: ['a', 'b'] });
      const w2 = Rapid.osmWay({ id: '\\', nodes: ['b', 'c'] });
      const w3 = Rapid.osmWay({ id: '-', nodes: ['d', 'e'] });
      const w4 = Rapid.osmWay({ id: '=', nodes: ['e', 'f'] });
      const graph = new Rapid.Graph([a, b, c, d, e, f, w1, w2, w3, w4]);
      const result = Rapid.osmJoinWays([w1, w2, w3, w4], graph);

      assert.ok(result instanceof Array);
      assert.equal(result.length, 2);
      assert.deepEqual(result.actions, []);

      assert.ok(result[0] instanceof Array);
      assert.equal(result[0].length, 2);
      assert.deepEqual(getIDs(result[0].nodes), ['a', 'b', 'c']);
      assert.deepEqual(result[0][0], w1);
      assert.deepEqual(result[0][1], w2);

      assert.ok(result[1] instanceof Array);
      assert.equal(result[1].length, 2);
      assert.deepEqual(getIDs(result[1].nodes), ['d', 'e', 'f']);
      assert.deepEqual(result[1][0], w3);
      assert.deepEqual(result[1][1], w4);
    });

    it('returns multiple arrays for disjoint relations', () => {
      //
      //     b
      //    / \
      //   a   c     d ---> e ===> f
      //
      //   r: ['/', '\', '-', '=']
      //
      const a = Rapid.osmNode({ id: 'a', loc: [0, 0] });
      const b = Rapid.osmNode({ id: 'b', loc: [1, 1] });
      const c = Rapid.osmNode({ id: 'c', loc: [2, 0] });
      const d = Rapid.osmNode({ id: 'd', loc: [5, 0] });
      const e = Rapid.osmNode({ id: 'e', loc: [6, 0] });
      const f = Rapid.osmNode({ id: 'f', loc: [7, 0] });
      const w1 = Rapid.osmWay({ id: '/', nodes: ['a', 'b'] });
      const w2 = Rapid.osmWay({ id: '\\', nodes: ['b', 'c'] });
      const w3 = Rapid.osmWay({ id: '-', nodes: ['d', 'e'] });
      const w4 = Rapid.osmWay({ id: '=', nodes: ['e', 'f'] });
      const r = Rapid.osmRelation({
        id: 'r',
        members: [
          { id: '/', type: 'way' },
          { id: '\\', type: 'way' },
          { id: '-', type: 'way' },
          { id: '=', type: 'way' }
        ]
      });
      const graph = new Rapid.Graph([a, b, c, d, e, f, w1, w2, w3, w4, r]);
      const result = Rapid.osmJoinWays(r.members, graph);

      assert.ok(result instanceof Array);
      assert.equal(result.length, 2);
      assert.deepEqual(result.actions, []);

      assert.ok(result[0] instanceof Array);
      assert.equal(result[0].length, 2);
      assert.deepEqual(getIDs(result[0].nodes), ['a', 'b', 'c']);
      assert.deepEqual(result[0][0], { id: '/', type: 'way' });
      assert.deepEqual(result[0][1], { id: '\\', type: 'way' });

      assert.ok(result[1] instanceof Array);
      assert.equal(result[1].length, 2);
      assert.deepEqual(getIDs(result[1].nodes), ['d', 'e', 'f']);
      assert.deepEqual(result[1][0], { id: '-', type: 'way' });
      assert.deepEqual(result[1][1], { id: '=', type: 'way' });
    });

    it('understands doubled-back relation members', () => {
      //
      //                    e
      //                  /   \
      //   a <=== b ---> c ~~~> d
      //
      //   r: ['=', '-', '~', '\', '/', '-', '=']
      //
      const a = Rapid.osmNode({ id: 'a', loc: [0, 0] });
      const b = Rapid.osmNode({ id: 'b', loc: [1, 0] });
      const c = Rapid.osmNode({ id: 'c', loc: [2, 0] });
      const d = Rapid.osmNode({ id: 'd', loc: [4, 0] });
      const e = Rapid.osmNode({ id: 'e', loc: [3, 1] });
      const w1 = Rapid.osmWay({ id: '=', nodes: ['b', 'a'] });
      const w2 = Rapid.osmWay({ id: '-', nodes: ['b', 'c'] });
      const w3 = Rapid.osmWay({ id: '~', nodes: ['c', 'd'] });
      const w4 = Rapid.osmWay({ id: '\\', nodes: ['d', 'e'] });
      const w5 = Rapid.osmWay({ id: '/', nodes: ['c', 'e'] });
      const r = Rapid.osmRelation({
        id: 'r',
        members: [
          { id: '=', type: 'way' },
          { id: '-', type: 'way' },
          { id: '~', type: 'way' },
          { id: '\\', type: 'way' },
          { id: '/', type: 'way' },
          { id: '-', type: 'way' },
          { id: '=', type: 'way' }
        ]
      });
      const graph = new Rapid.Graph([a, b, c, d, e, w1, w2, w3, w4, w5, r]);
      const result = Rapid.osmJoinWays(r.members, graph);

      assert.ok(result instanceof Array);
      assert.equal(result.length, 1);

      assert.ok(result.actions instanceof Array);
      assert.equal(result.actions.length, 3);

      assert.ok(result[0] instanceof Array);
      assert.equal(result[0].length, 7);
      assert.deepEqual(getIDs(result[0].nodes), ['a', 'b', 'c', 'd', 'e', 'c', 'b', 'a']);
      assert.deepEqual(result[0][0], { id: '=', type: 'way' });
      assert.deepEqual(result[0][1], { id: '-', type: 'way' });
      assert.deepEqual(result[0][2], { id: '~', type: 'way' });
      assert.deepEqual(result[0][3], { id: '\\', type: 'way' });
      assert.deepEqual(result[0][4], { id: '/', type: 'way' });
      assert.deepEqual(result[0][5], { id: '-', type: 'way' });
      assert.deepEqual(result[0][6], { id: '=', type: 'way' });
    });
  });
});
