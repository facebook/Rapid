import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';


describe('geoChooseEdge', () => {
  const viewport = {
    project:   val => val,
    unproject: val => val
  };

  it('returns null for a degenerate way (no nodes)', () => {
    const choice = Rapid.geoChooseEdge([], [0, 0], viewport);
    assert.equal(choice, null);
  });

  it('returns null for a degenerate way (single node)', () => {
    const node = Rapid.osmNode({loc: [0, 0]});
    const choice = Rapid.geoChooseEdge([node], [0, 0], viewport);
    assert.equal(choice, null);
  });

  it('calculates the orthogonal projection of a point onto a segment', () => {
    // a --*--- b
    //     |
    //     c
    //
    // * = [2, 0]
    const a = [0, 0];
    const b = [5, 0];
    const c = [2, 1];
    const nodes = [ Rapid.osmNode({loc: a}), Rapid.osmNode({loc: b}) ];
    const choice = Rapid.geoChooseEdge(nodes, c, viewport);
    assert.equal(choice.index, 1);
    assert.equal(choice.distance, 1);
    assert.deepEqual(choice.loc, [2, 0]);
  });

  it('returns the starting vertex when the orthogonal projection is < 0', () => {
    const a = [0, 0];
    const b = [5, 0];
    const c = [-3, 4];
    const nodes = [ Rapid.osmNode({loc: a}), Rapid.osmNode({loc: b}) ];
    const choice = Rapid.geoChooseEdge(nodes, c, viewport);
    assert.equal(choice.index, 1);
    assert.equal(choice.distance, 5);
    assert.deepEqual(choice.loc, [0, 0]);
  });

  it('returns the ending vertex when the orthogonal projection is > 1', () => {
    const a = [0, 0];
    const b = [5, 0];
    const c = [8, 4];
    const nodes = [ Rapid.osmNode({loc: a}), Rapid.osmNode({loc: b}) ];
    const choice = Rapid.geoChooseEdge(nodes, c, viewport);
    assert.equal(choice.index, 1);
    assert.equal(choice.distance, 5);
    assert.deepEqual(choice.loc, [5, 0]);
  });

  it('skips the given nodeID at end of way', () => {
    //
    // a --*-- b
    //     e   |
    //     |   |
    //     d - c
    //
    // * = [2, 0]
    const a = [0, 0];
    const b = [5, 0];
    const c = [5, 5];
    const d = [2, 5];
    const e = [2, 0.1];  // e.g. user is dragging e onto ab
    const nodes = [
      Rapid.osmNode({id: 'a', loc: a}),
      Rapid.osmNode({id: 'b', loc: b}),
      Rapid.osmNode({id: 'c', loc: c}),
      Rapid.osmNode({id: 'd', loc: d}),
      Rapid.osmNode({id: 'e', loc: e})
    ];
    const choice = Rapid.geoChooseEdge(nodes, e, viewport, 'e');
    assert.equal(choice.index, 1);
    assert.equal(choice.distance, 0.1);
    assert.deepEqual(choice.loc, [2, 0]);
  });

  it('skips the given nodeID in middle of way', () => {
    //
    // a --*-- b
    //     d   |
    //   /   \ |
    // e       c
    //
    // * = [2, 0]
    const a = [0, 0];
    const b = [5, 0];
    const c = [5, 5];
    const d = [2, 0.1];  // e.g. user is dragging d onto ab
    const e = [0, 5];
    const nodes = [
      Rapid.osmNode({id: 'a', loc: a}),
      Rapid.osmNode({id: 'b', loc: b}),
      Rapid.osmNode({id: 'c', loc: c}),
      Rapid.osmNode({id: 'd', loc: d}),
      Rapid.osmNode({id: 'e', loc: e})
    ];
    const choice = Rapid.geoChooseEdge(nodes, d, viewport, 'd');
    assert.equal(choice.index, 1);
    assert.equal(choice.distance, 0.1);
    assert.deepEqual(choice.loc, [2, 0]);
  });

  it('returns null if all nodes are skipped', () => {
    const nodes = [
      Rapid.osmNode({id: 'a', loc: [0, 0]}),
      Rapid.osmNode({id: 'b', loc: [5, 0]})
    ];
    const choice = Rapid.geoChooseEdge(nodes, [2, 2], viewport, 'a');
    assert.equal(choice, null);
  });
});


describe('geoHasLineIntersections', () => {
  it('returns false for a degenerate way (no nodes)', () => {
    assert.equal(Rapid.geoHasLineIntersections([], ''), false);
  });

  it('returns false if no activeID', () => {
    const a = Rapid.osmNode({id: 'a', loc: [2, 2]});
    const b = Rapid.osmNode({id: 'b', loc: [4, 2]});
    const c = Rapid.osmNode({id: 'c', loc: [4, 4]});
    const d = Rapid.osmNode({id: 'd', loc: [2, 4]});
    const nodes = [a, b, c, d, a];
    assert.equal(Rapid.geoHasLineIntersections(nodes, ''), false);
  });

  it('returns false if there are no intersections', () => {
      //  e --------- f
      //  |           |
      //  |  a --- b  |
      //  |  |     |  |
      //  |  |     |  |
      //  |  d --- c  |
      //  |           |
      //  h --------- g
      const a = Rapid.osmNode({id: 'a', loc: [2, 2]});
      const b = Rapid.osmNode({id: 'b', loc: [4, 2]});
      const c = Rapid.osmNode({id: 'c', loc: [4, 4]});
      const d = Rapid.osmNode({id: 'd', loc: [2, 4]});
      const e = Rapid.osmNode({id: 'e', loc: [0, 0]});
      const f = Rapid.osmNode({id: 'f', loc: [8, 0]});
      const g = Rapid.osmNode({id: 'g', loc: [8, 8]});
      const h = Rapid.osmNode({id: 'h', loc: [0, 8]});
      const inner = [a, b, c, d, a];
      const outer = [e, f, g, h, e];
      assert.equal(Rapid.geoHasLineIntersections(inner, outer, 'a'), false);
      assert.equal(Rapid.geoHasLineIntersections(inner, outer, 'b'), false);
      assert.equal(Rapid.geoHasLineIntersections(inner, outer, 'c'), false);
      assert.equal(Rapid.geoHasLineIntersections(inner, outer, 'd'), false);
      assert.equal(Rapid.geoHasLineIntersections(outer, inner, 'e'), false);
      assert.equal(Rapid.geoHasLineIntersections(outer, inner, 'f'), false);
      assert.equal(Rapid.geoHasLineIntersections(outer, inner, 'g'), false);
      assert.equal(Rapid.geoHasLineIntersections(outer, inner, 'h'), false);
  });

  it('returns true if the activeID is causing intersections', () => {
      //  e --------- f
      //  |           |
      //  |  a --------- b
      //  |  |        |/
      //  |  |       /|
      //  |  d --- c  |
      //  |           |
      //  h --------- g
      const a = Rapid.osmNode({id: 'a', loc: [2, 2]});
      const b = Rapid.osmNode({id: 'b', loc: [10, 2]});
      const c = Rapid.osmNode({id: 'c', loc: [4, 4]});
      const d = Rapid.osmNode({id: 'd', loc: [2, 4]});
      const e = Rapid.osmNode({id: 'e', loc: [0, 0]});
      const f = Rapid.osmNode({id: 'f', loc: [8, 0]});
      const g = Rapid.osmNode({id: 'g', loc: [8, 8]});
      const h = Rapid.osmNode({id: 'h', loc: [0, 8]});
      const inner = [a, b, c, d, a];
      const outer = [e, f, g, h, e];
      assert.equal(Rapid.geoHasLineIntersections(inner, outer, 'a'), true);
      assert.equal(Rapid.geoHasLineIntersections(inner, outer, 'b'), true);
      assert.equal(Rapid.geoHasLineIntersections(inner, outer, 'c'), true);
      assert.equal(Rapid.geoHasLineIntersections(inner, outer, 'd'), false);
      assert.equal(Rapid.geoHasLineIntersections(outer, inner, 'e'), false);
      assert.equal(Rapid.geoHasLineIntersections(outer, inner, 'f'), true);
      assert.equal(Rapid.geoHasLineIntersections(outer, inner, 'g'), true);
      assert.equal(Rapid.geoHasLineIntersections(outer, inner, 'h'), false);
  });
});


describe('geoHasSelfIntersections', () => {
  it('returns false for a degenerate way (no nodes)', () => {
    assert.equal(Rapid.geoHasSelfIntersections([], ''), false);
  });

  it('returns false if no activeID', () => {
    const a = Rapid.osmNode({id: 'a', loc: [0, 0]});
    const b = Rapid.osmNode({id: 'b', loc: [2, 0]});
    const c = Rapid.osmNode({id: 'c', loc: [2, 2]});
    const d = Rapid.osmNode({id: 'd', loc: [0, 2]});
    const nodes = [a, b, c, d, a];
    assert.equal(Rapid.geoHasSelfIntersections(nodes, ''), false);
  });

  it('returns false if there are no self intersections (closed way)', () => {
    //  a --- b
    //  |     |
    //  |     |
    //  d --- c
    const a = Rapid.osmNode({id: 'a', loc: [0, 0]});
    const b = Rapid.osmNode({id: 'b', loc: [2, 0]});
    const c = Rapid.osmNode({id: 'c', loc: [2, 2]});
    const d = Rapid.osmNode({id: 'd', loc: [0, 2]});
    const nodes = [a, b, c, d, a];
    assert.equal(Rapid.geoHasSelfIntersections(nodes, 'a'), false);
    assert.equal(Rapid.geoHasSelfIntersections(nodes, 'b'), false);
    assert.equal(Rapid.geoHasSelfIntersections(nodes, 'c'), false);
    assert.equal(Rapid.geoHasSelfIntersections(nodes, 'd'), false);
  });

  it('returns true if there are self intersections without a junction (closed way)', () => {
    //  a     c
    //  | \ / |
    //  |  /  |
    //  | / \ |
    //  d     b
    const a = Rapid.osmNode({id: 'a', loc: [0, 0]});
    const b = Rapid.osmNode({id: 'b', loc: [2, 2]});
    const c = Rapid.osmNode({id: 'c', loc: [2, 0]});
    const d = Rapid.osmNode({id: 'd', loc: [0, 2]});
    const nodes = [a, b, c, d, a];
    assert.equal(Rapid.geoHasSelfIntersections(nodes, 'a'), true);
    assert.equal(Rapid.geoHasSelfIntersections(nodes, 'b'), true);
    assert.equal(Rapid.geoHasSelfIntersections(nodes, 'c'), true);
    assert.equal(Rapid.geoHasSelfIntersections(nodes, 'd'), true);
  });

  it('returns false if there are self intersections with a junction (closed way)', () => {
    //  a     c
    //  | \ / |
    //  |  x  |
    //  | / \ |
    //  d     b
    const a = Rapid.osmNode({id: 'a', loc: [0, 0]});
    const b = Rapid.osmNode({id: 'b', loc: [2, 2]});
    const c = Rapid.osmNode({id: 'c', loc: [2, 0]});
    const d = Rapid.osmNode({id: 'd', loc: [0, 2]});
    const x = Rapid.osmNode({id: 'x', loc: [1, 1]});
    const nodes = [a, x, b, c, x, d, a];
    assert.equal(Rapid.geoHasSelfIntersections(nodes, 'a'), false);
    assert.equal(Rapid.geoHasSelfIntersections(nodes, 'b'), false);
    assert.equal(Rapid.geoHasSelfIntersections(nodes, 'c'), false);
    assert.equal(Rapid.geoHasSelfIntersections(nodes, 'd'), false);
    assert.equal(Rapid.geoHasSelfIntersections(nodes, 'x'), false);
  });

  it('returns false if there are no self intersections (open way)', () => {
    //  a --- b
    //        |
    //        |
    //  d --- c
    const a = Rapid.osmNode({id: 'a', loc: [0, 0]});
    const b = Rapid.osmNode({id: 'b', loc: [2, 0]});
    const c = Rapid.osmNode({id: 'c', loc: [2, 2]});
    const d = Rapid.osmNode({id: 'd', loc: [0, 2]});
    const nodes = [a, b, c, d];
    assert.equal(Rapid.geoHasSelfIntersections(nodes, 'a'), false);
    assert.equal(Rapid.geoHasSelfIntersections(nodes, 'b'), false);
    assert.equal(Rapid.geoHasSelfIntersections(nodes, 'c'), false);
    assert.equal(Rapid.geoHasSelfIntersections(nodes, 'd'), false);
  });

  it('returns true if there are self intersections without a junction (open way)', () => {
    //  a     c
    //    \ / |
    //     /  |
    //    / \ |
    //  d     b
    const a = Rapid.osmNode({id: 'a', loc: [0, 0]});
    const b = Rapid.osmNode({id: 'b', loc: [2, 2]});
    const c = Rapid.osmNode({id: 'c', loc: [2, 0]});
    const d = Rapid.osmNode({id: 'd', loc: [0, 2]});
    const nodes = [a, b, c, d];
    assert.equal(Rapid.geoHasSelfIntersections(nodes, 'a'), true);
    assert.equal(Rapid.geoHasSelfIntersections(nodes, 'b'), true);
    assert.equal(Rapid.geoHasSelfIntersections(nodes, 'c'), true);
    assert.equal(Rapid.geoHasSelfIntersections(nodes, 'd'), true);
  });

  it('returns false if there are self intersections with a junction (open way)', () => {
    //  a     c
    //    \ / |
    //     x  |
    //    / \ |
    //  d     b
    const a = Rapid.osmNode({id: 'a', loc: [0, 0]});
    const b = Rapid.osmNode({id: 'b', loc: [2, 2]});
    const c = Rapid.osmNode({id: 'c', loc: [2, 0]});
    const d = Rapid.osmNode({id: 'd', loc: [0, 2]});
    const x = Rapid.osmNode({id: 'x', loc: [1, 1]});
    const nodes = [a, x, b, c, x, d];
    assert.equal(Rapid.geoHasSelfIntersections(nodes, 'a'), false);
    assert.equal(Rapid.geoHasSelfIntersections(nodes, 'b'), false);
    assert.equal(Rapid.geoHasSelfIntersections(nodes, 'c'), false);
    assert.equal(Rapid.geoHasSelfIntersections(nodes, 'd'), false);
    assert.equal(Rapid.geoHasSelfIntersections(nodes, 'x'), false);
  });
});
