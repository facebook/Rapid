import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';


describe('osmIntersection', () => {
  const maxDist = Infinity;

  describe('highways', () => {
    // u ==== * ---> w
    it('excludes non-highways', () => {
      const graph = new Rapid.Graph([
        Rapid.osmNode({ id: 'u', loc: [0, 0] }),
        Rapid.osmNode({ id: '*', loc: [1, 0] }),
        Rapid.osmNode({ id: 'w', loc: [2, 0] }),
        Rapid.osmWay({ id: '=', nodes: ['u', '*'] }),
        Rapid.osmWay({ id: '-', nodes: ['*', 'w'] })
      ]);
      const result = Rapid.osmIntersection(graph, '*', maxDist);
      assert.deepEqual(result.ways, []);
    });

    it('excludes degenerate highways', () => {
      const graph = new Rapid.Graph([
        Rapid.osmNode({ id: 'u', loc: [0, 0] }),
        Rapid.osmNode({ id: '*', loc: [1, 0] }),
        Rapid.osmWay({ id: '=', nodes: ['u', '*'], tags: { highway: 'residential' } }),
        Rapid.osmWay({ id: '-', nodes: ['*'], tags: { highway: 'residential' } })
      ]);
      const result = Rapid.osmIntersection(graph, '*', maxDist);
      assert.equal(result.ways.length, 1);
      assert.equal(result.ways[0].id, '=');
    });

    it('excludes untagged lines', () => {
      const graph = new Rapid.Graph([
        Rapid.osmNode({ id: 'u', loc: [0, 0] }),
        Rapid.osmNode({ id: '*', loc: [1, 0] }),
        Rapid.osmNode({ id: 'w', loc: [2, 0] }),
        Rapid.osmWay({ id: '=', nodes: ['u', '*'], tags: { highway: 'residential' } }),
        Rapid.osmWay({ id: '-', nodes: ['*', 'w'] })
      ]);
      const result = Rapid.osmIntersection(graph, '*', maxDist);
      assert.equal(result.ways.length, 1);
      assert.equal(result.ways[0].id, '=');
    });

    it('excludes area highways', () => {
      const graph = new Rapid.Graph([
        Rapid.osmNode({ id: 'u', loc: [0, 0] }),
        Rapid.osmNode({ id: '*', loc: [1, 0] }),
        Rapid.osmNode({ id: 'w', loc: [2, 0] }),
        Rapid.osmWay({ id: '=', nodes: ['u', '*', 'w'], tags: { highway: 'pedestrian', area: 'yes' } })
      ]);
      const result = Rapid.osmIntersection(graph, '*', maxDist);
      assert.deepEqual(result.ways, []);
    });

    it('auto-splits highways at the intersection', () => {
      const graph = new Rapid.Graph([
        Rapid.osmNode({ id: 'u', loc: [0, 0] }),
        Rapid.osmNode({ id: '*', loc: [1, 0] }),
        Rapid.osmNode({ id: 'w', loc: [2, 0] }),
        Rapid.osmWay({ id: '=', nodes: ['u', '*', 'w'], tags: { highway: 'residential' } })
      ]);
      const result = Rapid.osmIntersection(graph, '*', maxDist);
      assert.equal(result.ways.length, 2);
    });
  });


  describe('#turns', () => {
    it('permits turns onto a way forward', () => {
      // u ==== * ---> w
      const graph = new Rapid.Graph([
        Rapid.osmNode({ id: 'u', loc: [0, 0] }),
        Rapid.osmNode({ id: '*', loc: [1, 0] }),
        Rapid.osmNode({ id: 'w', loc: [2, 0] }),
        Rapid.osmWay({ id: '=', nodes: ['u', '*'], tags: { highway: 'residential' } }),
        Rapid.osmWay({ id: '-', nodes: ['*', 'w'], tags: { highway: 'residential' } })
      ]);

      const turns = Rapid.osmIntersection(graph, '*', maxDist).turns('=');
      assert.ok(turns instanceof Array);
      assert.equal(turns.length, 2);

      assert.ok(turns[0] instanceof Rapid.osmTurn);
      assert.equal(turns[0].key, '=_*_=');
      assert.equal(turns[0].u, true);

      assert.ok(turns[1] instanceof Rapid.osmTurn);
      assert.equal(turns[1].key, '=_*_-');
      assert.equal(turns[1].u, false);
    });


    it('permits turns onto a way backward', () => {
      // u ==== * <--- w
      const graph = new Rapid.Graph([
        Rapid.osmNode({ id: 'u', loc: [0, 0] }),
        Rapid.osmNode({ id: '*', loc: [1, 0] }),
        Rapid.osmNode({ id: 'w', loc: [2, 0] }),
        Rapid.osmWay({ id: '=', nodes: ['u', '*'], tags: { highway: 'residential' } }),
        Rapid.osmWay({ id: '-', nodes: ['w', '*'], tags: { highway: 'residential' } })
      ]);

      const turns = Rapid.osmIntersection(graph, '*', maxDist).turns('=');
      assert.ok(turns instanceof Array);
      assert.equal(turns.length, 2);

      assert.ok(turns[0] instanceof Rapid.osmTurn);
      assert.equal(turns[0].key, '=_*_=');
      assert.equal(turns[0].u, true);

      assert.ok(turns[1] instanceof Rapid.osmTurn);
      assert.equal(turns[1].key, '=_*_-');
      assert.equal(turns[1].u, false);
    });


    it('permits turns from a way that must be split', () => {
      //       w
      //       |
      // u === *
      //       |
      //       x
      const graph = new Rapid.Graph([
        Rapid.osmNode({ id: 'u', loc: [0, 0] }),
        Rapid.osmNode({ id: '*', loc: [1, 0] }),
        Rapid.osmNode({ id: 'w', loc: [1, 1] }),
        Rapid.osmNode({ id: 'x', loc: [1, -1] }),
        Rapid.osmWay({ id: '=', nodes: ['u', '*'], tags: { highway: 'residential' } }),
        Rapid.osmWay({ id: '-', nodes: ['w', '*', 'x'], tags: { highway: 'residential' } })
      ]);

      const turns = Rapid.osmIntersection(graph, '*', maxDist).turns('-');
      assert.ok(turns instanceof Array);
      assert.equal(turns.length, 3);

      assert.ok(turns[0] instanceof Rapid.osmTurn);
      assert.equal(turns[0].key, '-_*_=');
      assert.equal(turns[0].u, false);

      assert.ok(turns[1] instanceof Rapid.osmTurn);
      assert.equal(turns[1].key, '-_*_-');
      assert.equal(turns[1].u, true);

      assert.ok(turns[2] instanceof Rapid.osmTurn);
      assert.match(turns[2].key, /^-\_\*\_w-\d+$/);  // a new way, e.g. '-_*_w-1'
      assert.equal(turns[2].u, false);
    });


    it('permits turns to a way that must be split', () => {
      //       w
      //       |
      // u === *
      //       |
      //       x
      const graph = new Rapid.Graph([
        Rapid.osmNode({ id: 'u', loc: [0, 0] }),
        Rapid.osmNode({ id: '*', loc: [1, 0] }),
        Rapid.osmNode({ id: 'w', loc: [1, 1] }),
        Rapid.osmNode({ id: 'x', loc: [1, -1] }),
        Rapid.osmWay({ id: '=', nodes: ['u', '*'], tags: { highway: 'residential' } }),
        Rapid.osmWay({ id: '-', nodes: ['w', '*', 'x'], tags: { highway: 'residential' } })
      ]);

      const turns = Rapid.osmIntersection(graph, '*', maxDist).turns('=');
      assert.ok(turns instanceof Array);
      assert.equal(turns.length, 3);

      assert.ok(turns[0] instanceof Rapid.osmTurn);
      assert.equal(turns[0].key, '=_*_=');
      assert.equal(turns[0].u, true);

      assert.ok(turns[1] instanceof Rapid.osmTurn);
      assert.equal(turns[1].key, '=_*_-');
      assert.equal(turns[1].u, false);

      assert.ok(turns[2] instanceof Rapid.osmTurn);
      assert.match(turns[2].key, /^=\_\*\_w-\d+$/);  // a new way, e.g. '=_*_w-1'
      assert.equal(turns[2].u, false);
    });


    it('permits turns from a oneway forward', () => {
      // u ===> * ----w
      const graph = new Rapid.Graph([
        Rapid.osmNode({ id: 'u', loc: [0, 0] }),
        Rapid.osmNode({ id: '*', loc: [1, 0] }),
        Rapid.osmNode({ id: 'w', loc: [2, 0] }),
        Rapid.osmWay({ id: '=', nodes: ['u', '*'], tags: { highway: 'residential', oneway: 'yes' } }),
        Rapid.osmWay({ id: '-', nodes: ['*', 'w'], tags: { highway: 'residential' } })
      ]);

      const turns = Rapid.osmIntersection(graph, '*', maxDist).turns('=');
      assert.ok(turns instanceof Array);
      assert.equal(turns.length, 1);

      assert.ok(turns[0] instanceof Rapid.osmTurn);
      assert.equal(turns[0].key, '=_*_-');
      assert.equal(turns[0].u, false);
    });


    it('permits turns from a reverse oneway backward', () => {
      // u <=== * ---- w
      const graph = new Rapid.Graph([
        Rapid.osmNode({ id: 'u', loc: [0, 0] }),
        Rapid.osmNode({ id: '*', loc: [1, 0] }),
        Rapid.osmNode({ id: 'w', loc: [2, 0] }),
        Rapid.osmWay({ id: '=', nodes: ['*', 'u'], tags: { highway: 'residential', oneway: '-1' } }),
        Rapid.osmWay({ id: '-', nodes: ['*', 'w'], tags: { highway: 'residential' } })
      ]);

      const turns = Rapid.osmIntersection(graph, '*', maxDist).turns('=');
      assert.ok(turns instanceof Array);
      assert.equal(turns.length, 1);

      assert.ok(turns[0] instanceof Rapid.osmTurn);
      assert.equal(turns[0].key, '=_*_-');
      assert.equal(turns[0].u, false);
    });


    it('omits turns from a oneway backward', () => {
      // u <=== * ---- w
      const graph = new Rapid.Graph([
        Rapid.osmNode({ id: 'u', loc: [0, 0] }),
        Rapid.osmNode({ id: '*', loc: [1, 0] }),
        Rapid.osmNode({ id: 'w', loc: [2, 0] }),
        Rapid.osmWay({ id: '=', nodes: ['*', 'u'], tags: { highway: 'residential', oneway: 'yes' } }),
        Rapid.osmWay({ id: '-', nodes: ['*', 'w'], tags: { highway: 'residential' } })
      ]);
      const turns = Rapid.osmIntersection(graph, '*', maxDist).turns('u');
      assert.deepEqual(turns, []);
    });


    it('omits turns from a reverse oneway forward', () => {
      // u ===> * ---- w
      const graph = new Rapid.Graph([
        Rapid.osmNode({ id: 'u', loc: [0, 0] }),
        Rapid.osmNode({ id: '*', loc: [1, 0] }),
        Rapid.osmNode({ id: 'w', loc: [2, 0] }),
        Rapid.osmWay({ id: '=', nodes: ['u', '*'], tags: { highway: 'residential', oneway: '-1' } }),
        Rapid.osmWay({ id: '-', nodes: ['*', 'w'], tags: { highway: 'residential' } })
      ]);
      const turns = Rapid.osmIntersection(graph, '*', maxDist).turns('u');
      assert.deepEqual(turns, []);
    });


    it('permits turns onto a oneway forward', () => {
      // u ==== * ---> w
      const graph = new Rapid.Graph([
        Rapid.osmNode({ id: 'u', loc: [0, 0] }),
        Rapid.osmNode({ id: '*', loc: [1, 0] }),
        Rapid.osmNode({ id: 'w', loc: [2, 0] }),
        Rapid.osmWay({ id: '=', nodes: ['u', '*'], tags: { highway: 'residential' } }),
        Rapid.osmWay({ id: '-', nodes: ['*', 'w'], tags: { highway: 'residential', oneway: 'yes' } })
      ]);

      const turns = Rapid.osmIntersection(graph, '*', maxDist).turns('=');
      assert.ok(turns instanceof Array);
      assert.equal(turns.length, 2);

      assert.ok(turns[0] instanceof Rapid.osmTurn);
      assert.equal(turns[0].key, '=_*_=');
      assert.equal(turns[0].u, true);

      assert.ok(turns[1] instanceof Rapid.osmTurn);
      assert.equal(turns[1].key, '=_*_-');
      assert.equal(turns[1].u, false);
    });


    it('permits turns onto a reverse oneway backward', () => {
      // u ==== * <--- w
      const graph = new Rapid.Graph([
        Rapid.osmNode({ id: 'u', loc: [0, 0] }),
        Rapid.osmNode({ id: '*', loc: [1, 0] }),
        Rapid.osmNode({ id: 'w', loc: [2, 0] }),
        Rapid.osmWay({ id: '=', nodes: ['u', '*'], tags: { highway: 'residential' } }),
        Rapid.osmWay({ id: '-', nodes: ['w', '*'], tags: { highway: 'residential', oneway: '-1' } })
      ]);

      const turns = Rapid.osmIntersection(graph, '*', maxDist).turns('=');
      assert.ok(turns instanceof Array);
      assert.equal(turns.length, 2);

      assert.ok(turns[0] instanceof Rapid.osmTurn);
      assert.equal(turns[0].key, '=_*_=');
      assert.equal(turns[0].u, true);

      assert.ok(turns[1] instanceof Rapid.osmTurn);
      assert.equal(turns[1].key, '=_*_-');
      assert.equal(turns[1].u, false);
    });


    it('omits turns onto a oneway backward', () => {
      // u ==== * <--- w
      const graph = new Rapid.Graph([
        Rapid.osmNode({ id: 'u', loc: [0, 0] }),
        Rapid.osmNode({ id: '*', loc: [1, 0] }),
        Rapid.osmNode({ id: 'w', loc: [2, 0] }),
        Rapid.osmWay({ id: '=', nodes: ['u', '*'], tags: { highway: 'residential' } }),
        Rapid.osmWay({ id: '-', nodes: ['w', '*'], tags: { highway: 'residential', oneway: 'yes' } })
      ]);

      const turns = Rapid.osmIntersection(graph, '*', maxDist).turns('=');
      assert.ok(turns instanceof Array);
      assert.equal(turns.length, 1);

      assert.ok(turns[0] instanceof Rapid.osmTurn);
      assert.equal(turns[0].key, '=_*_=');
      assert.equal(turns[0].u, true);
    });


    it('omits turns onto a reverse oneway forward', () => {
      // u ==== * ---> w
      const graph = new Rapid.Graph([
        Rapid.osmNode({ id: 'u', loc: [0, 0] }),
        Rapid.osmNode({ id: '*', loc: [1, 0] }),
        Rapid.osmNode({ id: 'w', loc: [2, 0] }),
        Rapid.osmWay({ id: '=', nodes: ['u', '*'], tags: { highway: 'residential' } }),
        Rapid.osmWay({ id: '-', nodes: ['*', 'w'], tags: { highway: 'residential', oneway: '-1' } })
      ]);

      const turns = Rapid.osmIntersection(graph, '*', maxDist).turns('=');
      assert.ok(turns instanceof Array);
      assert.equal(turns.length, 1);

      assert.ok(turns[0] instanceof Rapid.osmTurn);
      assert.equal(turns[0].key, '=_*_=');
      assert.equal(turns[0].u, true);
    });


    it('restricts turns with a restriction relation', () => {
      // u ==== * ---> w
      const graph = new Rapid.Graph([
        Rapid.osmNode({ id: 'u', loc: [0, 0] }),
        Rapid.osmNode({ id: '*', loc: [1, 0] }),
        Rapid.osmNode({ id: 'w', loc: [2, 0] }),
        Rapid.osmWay({ id: '=', nodes: ['u', '*'], tags: { highway: 'residential' } }),
        Rapid.osmWay({ id: '-', nodes: ['*', 'w'], tags: { highway: 'residential' } }),
        Rapid.osmRelation({
          id: 'r',
          tags: { type: 'restriction' },
          members: [
            { id: '=', role: 'from', type: 'way' },
            { id: '-', role: 'to', type: 'way' },
            { id: '*', role: 'via', type: 'node' }
          ]
        })
      ]);
      const turns = Rapid.osmIntersection(graph, '*', maxDist).turns('=');
      assert.ok(turns instanceof Array);
      assert.equal(turns.length, 2);

      assert.ok(turns[0] instanceof Rapid.osmTurn);
      assert.equal(turns[0].key, '=_*_=');
      assert.equal(turns[0].u, true);

      assert.ok(turns[1] instanceof Rapid.osmTurn);
      assert.equal(turns[1].key, '=_*_-');
      assert.equal(turns[1].u, false);
      assert.equal(turns[1].restrictionID, 'r');
      assert.equal(turns[1].direct, true);
      assert.equal(turns[1].only, false);
    });


    it('restricts turns affected by an only_* restriction relation', () => {
      // u====*~~~~v
      //      |
      //      w
      const graph = new Rapid.Graph([
        Rapid.osmNode({ id: 'u', loc: [0, 0] }),
        Rapid.osmNode({ id: '*', loc: [1, 0] }),
        Rapid.osmNode({ id: 'v', loc: [2, 0] }),
        Rapid.osmNode({ id: 'w', loc: [1, -1] }),
        Rapid.osmWay({ id: '=', nodes: ['u', '*'], tags: { highway: 'residential' } }),
        Rapid.osmWay({ id: '~', nodes: ['v', '*'], tags: { highway: 'residential' } }),
        Rapid.osmWay({ id: '-', nodes: ['w', '*'], tags: { highway: 'residential' } }),
        Rapid.osmRelation({
          id: 'r',
          tags: { type: 'restriction', restriction: 'only_right_turn' },
          members: [
            { id: '=', role: 'from', type: 'way' },
            { id: '-', role: 'to', type: 'way' },
            { id: '*', role: 'via', type: 'node' }
          ]
        })
      ]);

      const turns = Rapid.osmIntersection(graph, '*', maxDist).turns('=');
      assert.ok(turns instanceof Array);
      assert.equal(turns.length, 3);

      assert.ok(turns[0] instanceof Rapid.osmTurn);
      assert.equal(turns[0].key, '=_*_=');
      assert.equal(turns[0].u, true);

      assert.ok(turns[1] instanceof Rapid.osmTurn);
      assert.equal(turns[1].key, '=_*_~');
      assert.equal(turns[1].u, false);
      assert.equal(turns[1].restrictionID, 'r');
      assert.equal(turns[1].direct, false);
      assert.equal(turns[1].only, false);

      assert.ok(turns[2] instanceof Rapid.osmTurn);
      assert.equal(turns[2].key, '=_*_-');
      assert.equal(turns[2].u, false);
      assert.equal(turns[2].restrictionID, 'r');
      assert.equal(turns[2].direct, true);
      assert.equal(turns[2].only, true);
    });


    it('permits turns to a circular way', () => {
      //
      //  b -- c
      //  |    |
      //  a -- * === u
      //
      const graph = new Rapid.Graph([
        Rapid.osmNode({ id: 'a', loc: [0, 0] }),
        Rapid.osmNode({ id: 'b', loc: [0, 1] }),
        Rapid.osmNode({ id: 'c', loc: [1, 1] }),
        Rapid.osmNode({ id: '*', loc: [1, 0] }),
        Rapid.osmNode({ id: 'u', loc: [2, 0] }),
        Rapid.osmWay({ id: '-', nodes: ['*', 'a', 'b', 'c', '*'], tags: { highway: 'residential' } }),
        Rapid.osmWay({ id: '=', nodes: ['*', 'u'], tags: { highway: 'residential' } })
      ]);

      const turns = Rapid.osmIntersection(graph, '*', maxDist).turns('=');
      assert.ok(turns instanceof Array);
      assert.equal(turns.length, 3);

      assert.ok(turns[0] instanceof Rapid.osmTurn);
      assert.equal(turns[0].key, '=_*_-');
      assert.equal(turns[0].u, false);

      assert.ok(turns[1] instanceof Rapid.osmTurn);
      assert.equal(turns[1].key, '=_*_=');
      assert.equal(turns[1].u, true);

      assert.ok(turns[2] instanceof Rapid.osmTurn);
      assert.match(turns[2].key, /^=\_\*\_w-\d+$/);  // a new way, e.g. '=_*_w-1'
      assert.equal(turns[2].u, false);
    });


    it('permits turns from a circular way', () => {
      //
      //  b -- c
      //  |    |
      //  a -- * === u
      //
      const graph = new Rapid.Graph([
        Rapid.osmNode({ id: 'a', loc: [0, 0] }),
        Rapid.osmNode({ id: 'b', loc: [0, 1] }),
        Rapid.osmNode({ id: 'c', loc: [1, 1] }),
        Rapid.osmNode({ id: '*', loc: [1, 0] }),
        Rapid.osmNode({ id: 'u', loc: [2, 0] }),
        Rapid.osmWay({ id: '-', nodes: ['*', 'a', 'b', 'c', '*'], tags: { highway: 'residential' } }),
        Rapid.osmWay({ id: '=', nodes: ['*', 'u'], tags: { highway: 'residential' } })
      ]);

      const turns = Rapid.osmIntersection(graph, '*', maxDist).turns('-');
      assert.ok(turns instanceof Array);
      assert.equal(turns.length, 3);

      assert.ok(turns[0] instanceof Rapid.osmTurn);
      assert.equal(turns[0].key, '-_*_-');
      assert.equal(turns[0].u, true);

      assert.ok(turns[1] instanceof Rapid.osmTurn);
      assert.equal(turns[1].key, '-_*_=');
      assert.equal(turns[1].u, false);

      assert.ok(turns[2] instanceof Rapid.osmTurn);
      assert.match(turns[2].key, /^-\_\*\_w-\d+$/);  // a new way, e.g. '=_*_w-1'
      assert.equal(turns[2].u, false);
    });


    it('permits turns to a oneway circular way', () => {
      //
      //  b -- c
      //  |    |
      //  a -- * === u
      //
      const graph = new Rapid.Graph([
        Rapid.osmNode({ id: 'a', loc: [0, 0] }),
        Rapid.osmNode({ id: 'b', loc: [0, 1] }),
        Rapid.osmNode({ id: 'c', loc: [1, 1] }),
        Rapid.osmNode({ id: '*', loc: [1, 0] }),
        Rapid.osmNode({ id: 'u', loc: [2, 0] }),
        Rapid.osmWay({ id: '-', nodes: ['*', 'a', 'b', 'c', '*'], tags: { highway: 'residential', oneway: 'yes' } }),
        Rapid.osmWay({ id: '=', nodes: ['*', 'u'], tags: { highway: 'residential' } })
      ]);

      const turns = Rapid.osmIntersection(graph, '*', maxDist).turns('=');
      assert.ok(turns instanceof Array);
      assert.equal(turns.length, 2);

      assert.ok(turns[0] instanceof Rapid.osmTurn);
      assert.equal(turns[0].key, '=_*_-');
      assert.equal(turns[0].u, false);

      assert.ok(turns[1] instanceof Rapid.osmTurn);
      assert.equal(turns[1].key, '=_*_=');
      assert.equal(turns[1].u, true);
    });


    it('permits turns to a reverse oneway circular way', () => {
      //
      //  b -- c
      //  |    |
      //  a -- * === u
      //
      const graph = new Rapid.Graph([
        Rapid.osmNode({ id: 'a', loc: [0, 0] }),
        Rapid.osmNode({ id: 'b', loc: [0, 1] }),
        Rapid.osmNode({ id: 'c', loc: [1, 1] }),
        Rapid.osmNode({ id: '*', loc: [1, 0] }),
        Rapid.osmNode({ id: 'u', loc: [2, 0] }),
        Rapid.osmWay({ id: '-', nodes: ['*', 'a', 'b', 'c', '*'], tags: { highway: 'residential', oneway: '-1' } }),
        Rapid.osmWay({ id: '=', nodes: ['*', 'u'], tags: { highway: 'residential' } })
      ]);

      const turns = Rapid.osmIntersection(graph, '*', maxDist).turns('=');
      assert.ok(turns instanceof Array);
      assert.equal(turns.length, 2);

      assert.ok(turns[0] instanceof Rapid.osmTurn);
      assert.equal(turns[0].key, '=_*_-');
      assert.equal(turns[0].u, false);

      assert.ok(turns[1] instanceof Rapid.osmTurn);
      assert.equal(turns[1].key, '=_*_=');
      assert.equal(turns[1].u, true);
    });


    it('permits turns from a oneway circular way', () => {
      //
      //  b -- c
      //  |    |
      //  a -- * === u
      //
      const graph = new Rapid.Graph([
        Rapid.osmNode({ id: 'a', loc: [0, 0] }),
        Rapid.osmNode({ id: 'b', loc: [0, 1] }),
        Rapid.osmNode({ id: 'c', loc: [1, 1] }),
        Rapid.osmNode({ id: '*', loc: [1, 0] }),
        Rapid.osmNode({ id: 'u', loc: [2, 0] }),
        Rapid.osmWay({ id: '-', nodes: ['*', 'a', 'b', 'c', '*'], tags: { highway: 'residential', oneway: 'yes' } }),
        Rapid.osmWay({ id: '=', nodes: ['*', 'u'], tags: { highway: 'residential' } })
      ]);

      const intersection = Rapid.osmIntersection(graph, '*', maxDist);
      // The circular way will get split somewhere, so that both a-* and c-* end up on separate ways.
      const newWay = intersection.ways.find(way => /^w-\d+$/.test(way.id));

      const turns = Rapid.osmIntersection(graph, '*', maxDist).turns(newWay.id);
      assert.ok(turns instanceof Array);
      assert.equal(turns.length, 2);

      assert.ok(turns[0] instanceof Rapid.osmTurn);
      assert.equal(turns[0].key, newWay.id + '_*_-');
      assert.equal(turns[0].u, false);

      assert.ok(turns[1] instanceof Rapid.osmTurn);
      assert.equal(turns[1].key, newWay.id  + '_*_=');
      assert.equal(turns[1].u, false);
    });


    it('permits turns from a reverse oneway circular way', () => {
      //
      //  b -- c
      //  |    |
      //  a -- * === u
      //
      const graph = new Rapid.Graph([
        Rapid.osmNode({ id: 'a', loc: [0, 0] }),
        Rapid.osmNode({ id: 'b', loc: [0, 1] }),
        Rapid.osmNode({ id: 'c', loc: [1, 1] }),
        Rapid.osmNode({ id: '*', loc: [1, 0] }),
        Rapid.osmNode({ id: 'u', loc: [2, 0] }),
        Rapid.osmWay({ id: '-', nodes: ['*', 'a', 'b', 'c', '*'], tags: { highway: 'residential', oneway: '-1' } }),
        Rapid.osmWay({ id: '=', nodes: ['*', 'u'], tags: { highway: 'residential' } })
      ]);

      const intersection = Rapid.osmIntersection(graph, '*', maxDist);
      // The circular way will get split somewhere, so that both a-* and c-* end up on separate ways.
      const newWay = intersection.ways.find(way => /^w-\d+$/.test(way.id));

      const turns = Rapid.osmIntersection(graph, '*', maxDist).turns(newWay.id);
      assert.ok(turns instanceof Array);
      assert.equal(turns.length, 2);

      assert.ok(turns[0] instanceof Rapid.osmTurn);
      assert.equal(turns[0].key, newWay.id + '_*_-');
      assert.equal(turns[0].u, false);

      assert.ok(turns[1] instanceof Rapid.osmTurn);
      assert.equal(turns[1].key, newWay.id  + '_*_=');
      assert.equal(turns[1].u, false);
    });


    describe('complex intersection - without restrictions', () => {
      // This is a dual carraigeway (oneways c-b-a and d-e-f)
      // intersecting with a bidirectional road (along h-e-b-g)
      //
      //           g
      //          /
      //  a <--- b <=== c
      //         |
      //  d ~~~> e ≈≈≈> f
      //          \
      //           h
      //
      const graph = new Rapid.Graph([
        Rapid.osmNode({ id: 'a', loc: [0, 1] }),
        Rapid.osmNode({ id: 'b', loc: [1, 1] }),
        Rapid.osmNode({ id: 'c', loc: [2, 1] }),
        Rapid.osmNode({ id: 'd', loc: [0, -1] }),
        Rapid.osmNode({ id: 'e', loc: [1, -1] }),
        Rapid.osmNode({ id: 'f', loc: [2, -1] }),
        Rapid.osmNode({ id: 'g', loc: [2, 2] }),
        Rapid.osmNode({ id: 'h', loc: [2, -2] }),
        Rapid.osmWay({ id: '-', nodes: ['b', 'a'], tags: { highway: 'residential', oneway: 'yes' } }),
        Rapid.osmWay({ id: '=', nodes: ['c', 'b'], tags: { highway: 'residential', oneway: 'yes' } }),
        Rapid.osmWay({ id: '~', nodes: ['d', 'e'], tags: { highway: 'residential', oneway: 'yes' } }),
        Rapid.osmWay({ id: '≈', nodes: ['e', 'f'], tags: { highway: 'residential', oneway: 'yes' } }),
        Rapid.osmWay({ id: '|', nodes: ['b', 'e'], tags: { highway: 'residential' } }),
        Rapid.osmWay({ id: '/', nodes: ['b', 'g'], tags: { highway: 'residential' } }),
        Rapid.osmWay({ id: '\\', nodes: ['e', 'h'], tags: { highway: 'residential' } })
      ]);


      it('no turns from a destination way', () => {
        const turns1 = Rapid.osmIntersection(graph, 'b', maxDist).turns('-', 1);
        assert.deepEqual(turns1, []);
        const turns2 = Rapid.osmIntersection(graph, 'b', maxDist).turns('≈', 1);
        assert.deepEqual(turns2, []);
      });


      it('allows via node and via way turns from a oneway', () => {
        const turns = Rapid.osmIntersection(graph, 'b', maxDist).turns('=', 1);
        assert.ok(turns instanceof Array);
        assert.equal(turns.length, 5);

        assert.ok(turns[0] instanceof Rapid.osmTurn);
        assert.equal(turns[0].key, '=_b_-'); // straight to -
        assert.equal(turns[0].u, false);

        assert.ok(turns[1] instanceof Rapid.osmTurn);
        assert.equal(turns[1].key, '=_b_|'); // left to |
        assert.equal(turns[1].u, false);

        assert.ok(turns[2] instanceof Rapid.osmTurn);
        assert.equal(turns[2].key, '=_b_|_e_≈'); // u-turn via | to ≈
        assert.equal(turns[2].u, false);

        assert.ok(turns[3] instanceof Rapid.osmTurn);
        assert.equal(turns[3].key, '=_b_|_e_\\'); // left via | to \
        assert.equal(turns[3].u, false);

        assert.ok(turns[4] instanceof Rapid.osmTurn);
        assert.equal(turns[4].key, '=_b_/'); // right to /
        assert.equal(turns[4].u, false);
      });


      it('allows via node and via way turns from a bidirectional', () => {
        const turns = Rapid.osmIntersection(graph, 'b', maxDist).turns('/', 1);
        assert.ok(turns instanceof Array);
        assert.equal(turns.length, 5);

        assert.ok(turns[0] instanceof Rapid.osmTurn);
        assert.equal(turns[0].key, '/_b_-'); // right to -
        assert.equal(turns[0].u, false);

        assert.ok(turns[1] instanceof Rapid.osmTurn);
        assert.equal(turns[1].key, '/_b_|'); // straight to |
        assert.equal(turns[1].u, false);

        assert.ok(turns[2] instanceof Rapid.osmTurn);
        assert.equal(turns[2].key, '/_b_|_e_≈'); // left via | to ≈
        assert.equal(turns[2].u, false);

        assert.ok(turns[3] instanceof Rapid.osmTurn);
        assert.equal(turns[3].key, '/_b_|_e_\\'); // straight via | to \
        assert.equal(turns[3].u, false);

        assert.ok(turns[4] instanceof Rapid.osmTurn);
        assert.equal(turns[4].key, '/_b_/'); // u-turn
        assert.equal(turns[4].u, true);
      });
    });


    describe('complex intersection - restricted turn via node', () => {
      //
      //           g
      //          /
      //  a <--- b <=== c
      //         |           'r': `no_right_turn` FROM '|' VIA NODE 'e' TO '≈'
      //  d ~~~> e ≈≈≈> f
      //          \
      //           h
      //
      const graph = new Rapid.Graph([
        Rapid.osmNode({ id: 'a', loc: [0, 1] }),
        Rapid.osmNode({ id: 'b', loc: [1, 1] }),
        Rapid.osmNode({ id: 'c', loc: [2, 1] }),
        Rapid.osmNode({ id: 'd', loc: [0, -1] }),
        Rapid.osmNode({ id: 'e', loc: [1, -1] }),
        Rapid.osmNode({ id: 'f', loc: [2, -1] }),
        Rapid.osmNode({ id: 'g', loc: [2, 2] }),
        Rapid.osmNode({ id: 'h', loc: [2, -2] }),
        Rapid.osmWay({ id: '-', nodes: ['b', 'a'], tags: { highway: 'residential', oneway: 'yes' } }),
        Rapid.osmWay({ id: '=', nodes: ['c', 'b'], tags: { highway: 'residential', oneway: 'yes' } }),
        Rapid.osmWay({ id: '~', nodes: ['d', 'e'], tags: { highway: 'residential', oneway: 'yes' } }),
        Rapid.osmWay({ id: '≈', nodes: ['e', 'f'], tags: { highway: 'residential', oneway: 'yes' } }),
        Rapid.osmWay({ id: '|', nodes: ['b', 'e'], tags: { highway: 'residential' } }),
        Rapid.osmWay({ id: '/', nodes: ['b', 'g'], tags: { highway: 'residential' } }),
        Rapid.osmWay({ id: '\\', nodes: ['e', 'h'], tags: { highway: 'residential' } }),
        Rapid.osmRelation({
          id: 'r',
          tags: { type: 'restriction', restriction: 'no_right_turn' },
          members: [
            { role: 'from', id: '|', type: 'way' },
            { role: 'via', id: 'e', type: 'node' },
            { role: 'to', id: '≈', type: 'way' }
          ]
        })
      ]);

      it('allows via node and via way turns from a oneway', () => {
        const turns = Rapid.osmIntersection(graph, 'b', maxDist).turns('=', 1);
        assert.ok(turns instanceof Array);
        assert.equal(turns.length, 5);

        assert.ok(turns[0] instanceof Rapid.osmTurn);
        assert.equal(turns[0].key, '=_b_-'); // straight to -
        assert.equal(turns[0].u, false);

        assert.ok(turns[1] instanceof Rapid.osmTurn);
        assert.equal(turns[1].key, '=_b_|'); // left to |
        assert.equal(turns[1].u, false);

        assert.ok(turns[2] instanceof Rapid.osmTurn);
        assert.equal(turns[2].key, '|_e_≈'); // right turn from | to ≈
        assert.equal(turns[2].u, false);
        assert.equal(turns[2].restrictionID, 'r');
        assert.equal(turns[2].direct, false);  // indirect
        assert.equal(turns[2].no, true);  // restricted!
        assert.equal(turns[2].only, false);

        assert.ok(turns[3] instanceof Rapid.osmTurn);
        assert.equal(turns[3].key, '=_b_|_e_\\'); // left via | to \
        assert.equal(turns[3].u, false);

        assert.ok(turns[4] instanceof Rapid.osmTurn);
        assert.equal(turns[4].key, '=_b_/'); // right to /
        assert.equal(turns[4].u, false);
      });


      it('allows via node and via way turns from a bidirectional', () => {
        const turns = Rapid.osmIntersection(graph, 'b', maxDist).turns('/', 1);
        assert.ok(turns instanceof Array);
        assert.equal(turns.length, 5);

        assert.ok(turns[0] instanceof Rapid.osmTurn);
        assert.equal(turns[0].key, '/_b_-'); // right to -
        assert.equal(turns[0].u, false);

        assert.ok(turns[1] instanceof Rapid.osmTurn);
        assert.equal(turns[1].key, '/_b_|'); // straight to |
        assert.equal(turns[1].u, false);

        assert.ok(turns[2] instanceof Rapid.osmTurn);
        assert.equal(turns[2].key, '|_e_≈'); // right turn from | to ≈
        assert.equal(turns[2].u, false);
        assert.equal(turns[2].restrictionID, 'r');
        assert.equal(turns[2].direct, false);  // indirect
        assert.equal(turns[2].no, true);  // restricted!
        assert.equal(turns[2].only, false);

        assert.ok(turns[3] instanceof Rapid.osmTurn);
        assert.equal(turns[3].key, '/_b_|_e_\\'); // straight via | to \
        assert.equal(turns[3].u, false);

        assert.ok(turns[4] instanceof Rapid.osmTurn);
        assert.equal(turns[4].key, '/_b_/'); // u-turn
        assert.equal(turns[4].u, true);
      });
    });


    describe('complex intersection - restricted turn via way', () => {
      //
      //           g     'r2': `no_right_turn` FROM '/' VIA WAY '|' TO '≈'
      //          /
      //  a <--- b <=== c    'r1': `no_u_turn` FROM '=' VIA WAY '|' TO '≈'
      //         |
      //  d ~~~> e ≈≈≈> f
      //          \
      //           h
      //
      const graph = new Rapid.Graph([
        Rapid.osmNode({ id: 'a', loc: [0, 1] }),
        Rapid.osmNode({ id: 'b', loc: [1, 1] }),
        Rapid.osmNode({ id: 'c', loc: [2, 1] }),
        Rapid.osmNode({ id: 'd', loc: [0, -1] }),
        Rapid.osmNode({ id: 'e', loc: [1, -1] }),
        Rapid.osmNode({ id: 'f', loc: [2, -1] }),
        Rapid.osmNode({ id: 'g', loc: [2, 2] }),
        Rapid.osmNode({ id: 'h', loc: [2, -2] }),
        Rapid.osmWay({ id: '-', nodes: ['b', 'a'], tags: { highway: 'residential', oneway: 'yes' } }),
        Rapid.osmWay({ id: '=', nodes: ['c', 'b'], tags: { highway: 'residential', oneway: 'yes' } }),
        Rapid.osmWay({ id: '~', nodes: ['d', 'e'], tags: { highway: 'residential', oneway: 'yes' } }),
        Rapid.osmWay({ id: '≈', nodes: ['e', 'f'], tags: { highway: 'residential', oneway: 'yes' } }),
        Rapid.osmWay({ id: '|', nodes: ['b', 'e'], tags: { highway: 'residential' } }),
        Rapid.osmWay({ id: '/', nodes: ['b', 'g'], tags: { highway: 'residential' } }),
        Rapid.osmWay({ id: '\\', nodes: ['e', 'h'], tags: { highway: 'residential' } }),
        Rapid.osmRelation({
          id: 'r1',
          tags: { type: 'restriction', restriction: 'no_u_turn' },
          members: [
            { role: 'from', id: '=', type: 'way' },
            { role: 'via', id: '|', type: 'way' },
            { role: 'to', id: '≈', type: 'way' },
          ]
        }),
        Rapid.osmRelation({
          id: 'r2',
          tags: { type: 'restriction', restriction: 'no_right_turn' },
          members: [
            { role: 'from', id: '/', type: 'way' },
            { role: 'via', id: '|', type: 'way' },
            { role: 'to', id: '≈', type: 'way' }
          ]
        })
      ]);

      it('allows via node and via way turns from a oneway', () => {
        const turns = Rapid.osmIntersection(graph, 'b', maxDist).turns('=', 1);
        assert.ok(turns instanceof Array);
        assert.equal(turns.length, 5);

        assert.ok(turns[0] instanceof Rapid.osmTurn);
        assert.equal(turns[0].key, '=_b_-'); // straight to -
        assert.equal(turns[0].u, false);

        assert.ok(turns[1] instanceof Rapid.osmTurn);
        assert.equal(turns[1].key, '=_b_|'); // left to |
        assert.equal(turns[1].u, false);

        assert.ok(turns[2] instanceof Rapid.osmTurn);
        assert.equal(turns[2].key, '=_b_|_e_≈'); // u turn via | to ≈
        assert.equal(turns[2].u, false);
        assert.equal(turns[2].restrictionID, 'r1');
        assert.equal(turns[2].direct, true);  // direct
        assert.equal(turns[2].no, true);  // restricted!
        assert.equal(turns[2].only, false);

        assert.ok(turns[3] instanceof Rapid.osmTurn);
        assert.equal(turns[3].key, '=_b_|_e_\\'); // left via | to \
        assert.equal(turns[3].u, false);

        assert.ok(turns[4] instanceof Rapid.osmTurn);
        assert.equal(turns[4].key, '=_b_/'); // right to /
        assert.equal(turns[4].u, false);
      });


      it('allows via node and via way turns from a bidirectional', () => {
        const turns = Rapid.osmIntersection(graph, 'b', maxDist).turns('/', 1);
        assert.ok(turns instanceof Array);
        assert.equal(turns.length, 5);

        assert.ok(turns[0] instanceof Rapid.osmTurn);
        assert.equal(turns[0].key, '/_b_-'); // right to -
        assert.equal(turns[0].u, false);

        assert.ok(turns[1] instanceof Rapid.osmTurn);
        assert.equal(turns[1].key, '/_b_|'); // straight to |
        assert.equal(turns[1].u, false);

        assert.ok(turns[2] instanceof Rapid.osmTurn);
        assert.equal(turns[2].key, '/_b_|_e_≈'); // right turn from | to ≈
        assert.equal(turns[2].u, false);
        assert.equal(turns[2].restrictionID, 'r2');
        assert.equal(turns[2].direct, true);  // direct
        assert.equal(turns[2].no, true);  // restricted!
        assert.equal(turns[2].only, false);

        assert.ok(turns[3] instanceof Rapid.osmTurn);
        assert.equal(turns[3].key, '/_b_|_e_\\'); // straight via | to \
        assert.equal(turns[3].u, false);

        assert.ok(turns[4] instanceof Rapid.osmTurn);
        assert.equal(turns[4].key, '/_b_/'); // u-turn
        assert.equal(turns[4].u, true);
      });
    });


    describe('complex intersection - only turn via node', () => {
      //
      //           g
      //          /
      //  a <--- b <=== c
      //         |           'r': `only_right_turn` FROM '|' VIA NODE 'e' TO '≈'
      //  d ~~~> e ≈≈≈> f
      //          \
      //           h
      //
      const graph = new Rapid.Graph([
        Rapid.osmNode({ id: 'a', loc: [0, 1] }),
        Rapid.osmNode({ id: 'b', loc: [1, 1] }),
        Rapid.osmNode({ id: 'c', loc: [2, 1] }),
        Rapid.osmNode({ id: 'd', loc: [0, -1] }),
        Rapid.osmNode({ id: 'e', loc: [1, -1] }),
        Rapid.osmNode({ id: 'f', loc: [2, -1] }),
        Rapid.osmNode({ id: 'g', loc: [2, 2] }),
        Rapid.osmNode({ id: 'h', loc: [2, -2] }),
        Rapid.osmWay({ id: '-', nodes: ['b', 'a'], tags: { highway: 'residential', oneway: 'yes' } }),
        Rapid.osmWay({ id: '=', nodes: ['c', 'b'], tags: { highway: 'residential', oneway: 'yes' } }),
        Rapid.osmWay({ id: '~', nodes: ['d', 'e'], tags: { highway: 'residential', oneway: 'yes' } }),
        Rapid.osmWay({ id: '≈', nodes: ['e', 'f'], tags: { highway: 'residential', oneway: 'yes' } }),
        Rapid.osmWay({ id: '|', nodes: ['b', 'e'], tags: { highway: 'residential' } }),
        Rapid.osmWay({ id: '/', nodes: ['b', 'g'], tags: { highway: 'residential' } }),
        Rapid.osmWay({ id: '\\', nodes: ['e', 'h'], tags: { highway: 'residential' } }),
        Rapid.osmRelation({
          id: 'r',
          tags: { type: 'restriction', restriction: 'only_right_turn' },
          members: [
            { role: 'from', id: '|', type: 'way' },
            { role: 'via', id: 'e', type: 'node' },
            { role: 'to', id: '≈', type: 'way' }
          ]
        })
      ]);

      it('allows via node and via way turns from a oneway', () => {
        const turns = Rapid.osmIntersection(graph, 'b', maxDist).turns('=', 1);
        assert.ok(turns instanceof Array);
        assert.equal(turns.length, 5);

        assert.ok(turns[0] instanceof Rapid.osmTurn);
        assert.equal(turns[0].key, '=_b_-'); // straight to -
        assert.equal(turns[0].u, false);

        assert.ok(turns[1] instanceof Rapid.osmTurn);
        assert.equal(turns[1].key, '=_b_|'); // left to |
        assert.equal(turns[1].u, false);

        assert.ok(turns[2] instanceof Rapid.osmTurn);
        assert.equal(turns[2].key, '|_e_≈'); // right turn from | to ≈
        assert.equal(turns[2].u, false);
        assert.equal(turns[2].restrictionID, 'r');
        assert.equal(turns[2].direct, false);  // indirect
        assert.equal(turns[2].no, false);
        assert.equal(turns[2].only, true);  // only!

        assert.ok(turns[3] instanceof Rapid.osmTurn);
        assert.equal(turns[3].key, '|_e_\\'); // straight from | to \
        assert.equal(turns[3].u, false);
        assert.equal(turns[3].restrictionID, 'r');
        assert.equal(turns[3].direct, false);  // indirect
        assert.equal(turns[3].no, true);  // restricted!
        assert.equal(turns[3].only, false);

        assert.ok(turns[4] instanceof Rapid.osmTurn);
        assert.equal(turns[4].key, '=_b_/'); // right to /
        assert.equal(turns[4].u, false);
      });


      it('allows via node and via way turns from a bidirectional', () => {
        const turns = Rapid.osmIntersection(graph, 'b', maxDist).turns('/', 1);
        assert.ok(turns instanceof Array);
        assert.equal(turns.length, 5);

        assert.ok(turns[0] instanceof Rapid.osmTurn);
        assert.equal(turns[0].key, '/_b_-'); // right to -
        assert.equal(turns[0].u, false);

        assert.ok(turns[1] instanceof Rapid.osmTurn);
        assert.equal(turns[1].key, '/_b_|'); // straight to |
        assert.equal(turns[1].u, false);

        assert.ok(turns[2] instanceof Rapid.osmTurn);
        assert.equal(turns[2].key, '|_e_≈'); // right turn from | to ≈
        assert.equal(turns[2].u, false);
        assert.equal(turns[2].restrictionID, 'r');
        assert.equal(turns[2].direct, false);  // indirect
        assert.equal(turns[2].no, false);
        assert.equal(turns[2].only, true);  // only!

        assert.ok(turns[3] instanceof Rapid.osmTurn);
        assert.equal(turns[3].key, '|_e_\\'); // straight from | to \
        assert.equal(turns[3].u, false);
        assert.equal(turns[3].restrictionID, 'r');
        assert.equal(turns[3].direct, false);  // indirect
        assert.equal(turns[3].no, true);  // restricted!
        assert.equal(turns[3].only, false);

        assert.ok(turns[4] instanceof Rapid.osmTurn);
        assert.equal(turns[4].key, '/_b_/'); // u-turn
        assert.equal(turns[4].u, true);
      });


      it('`only_` restriction is only effective towards the via', () => {
        const turns = Rapid.osmIntersection(graph, 'b', maxDist).turns('|', 1);
        assert.ok(turns instanceof Array);
        assert.equal(turns.length, 6);

        assert.ok(turns[0] instanceof Rapid.osmTurn);
        assert.equal(turns[0].key, '|_b_-'); // left from | to - (away from only-via)
        assert.equal(turns[0].u, false);

        assert.ok(turns[1] instanceof Rapid.osmTurn);
        assert.equal(turns[1].key, '|_b_|'); // u-turn from | to | (away from only-via)
        assert.equal(turns[1].u, true);

        assert.ok(turns[2] instanceof Rapid.osmTurn);
        assert.equal(turns[2].key, '|_b_/'); // straight from | to / (away from only-via)
        assert.equal(turns[2].u, false);

        assert.ok(turns[3] instanceof Rapid.osmTurn);
        assert.equal(turns[3].key, '|_e_|'); // u-turn from | to | via e
        assert.equal(turns[3].u, true);
        assert.equal(turns[3].restrictionID, 'r');
        assert.equal(turns[3].direct, false);  // indirect
        assert.equal(turns[3].no, true);  // restricted!
        assert.equal(turns[3].only, false);

        assert.ok(turns[4] instanceof Rapid.osmTurn);
        assert.equal(turns[4].key, '|_e_≈'); // right turn from | to ≈
        assert.equal(turns[4].u, false);
        assert.equal(turns[4].restrictionID, 'r');
        assert.equal(turns[4].direct, true);  // direct
        assert.equal(turns[4].no, false);
        assert.equal(turns[4].only, true); // only!

        assert.ok(turns[5] instanceof Rapid.osmTurn);
        assert.equal(turns[5].key, '|_e_\\'); // straight from | to \
        assert.equal(turns[5].u, false);
        assert.equal(turns[5].restrictionID, 'r');
        assert.equal(turns[5].direct, false);  // indirect
        assert.equal(turns[5].no, true);  // restricted!
        assert.equal(turns[5].only, false);
      });
    });


    describe('complex intersection - only turn via way', () => {
      //
      //           j
      //           ‖
      //     i ≃≃≃ g     'r2': `only_right_turn` FROM '/' VIA WAY '|' TO '≈'
      //          /
      //  a <--- b <=== c    'r1': `only_u_turn` FROM '=' VIA WAY '|' TO '≈'
      //         |
      //  d ~~~> e ≈≈≈> f
      //          \
      //           h
      //
      const graph = new Rapid.Graph([
        Rapid.osmNode({ id: 'a', loc: [0, 1] }),
        Rapid.osmNode({ id: 'b', loc: [1, 1] }),
        Rapid.osmNode({ id: 'c', loc: [2, 1] }),
        Rapid.osmNode({ id: 'd', loc: [0, -1] }),
        Rapid.osmNode({ id: 'e', loc: [1, -1] }),
        Rapid.osmNode({ id: 'f', loc: [2, -1] }),
        Rapid.osmNode({ id: 'g', loc: [2, 2] }),
        Rapid.osmNode({ id: 'h', loc: [2, -2] }),
        Rapid.osmNode({ id: 'i', loc: [0, 2] }),
        Rapid.osmNode({ id: 'j', loc: [2, 3] }),
        Rapid.osmWay({ id: '-', nodes: ['b', 'a'], tags: { highway: 'residential', oneway: 'yes' } }),
        Rapid.osmWay({ id: '=', nodes: ['c', 'b'], tags: { highway: 'residential', oneway: 'yes' } }),
        Rapid.osmWay({ id: '~', nodes: ['d', 'e'], tags: { highway: 'residential', oneway: 'yes' } }),
        Rapid.osmWay({ id: '≈', nodes: ['e', 'f'], tags: { highway: 'residential', oneway: 'yes' } }),
        Rapid.osmWay({ id: '|', nodes: ['b', 'e'], tags: { highway: 'residential' } }),
        Rapid.osmWay({ id: '/', nodes: ['b', 'g'], tags: { highway: 'residential' } }),
        Rapid.osmWay({ id: '\\', nodes: ['e', 'h'], tags: { highway: 'residential' } }),
        Rapid.osmWay({ id: '≃', nodes: ['g', 'i'], tags: { highway: 'residential' } }),
        Rapid.osmWay({ id: '‖', nodes: ['j', 'g'], tags: { highway: 'residential' } }),
        Rapid.osmRelation({
          id: 'r1',
          tags: { type: 'restriction', restriction: 'only_u_turn' },
          members: [
            { role: 'from', id: '=', type: 'way' },
            { role: 'via', id: '|', type: 'way' },
            { role: 'to', id: '≈', type: 'way' }
          ]
        }),
        Rapid.osmRelation({
          id: 'r2',
          tags: { type: 'restriction', restriction: 'only_right_turn' },
          members: [
            { role: 'from', id: '/', type: 'way' },
            { role: 'via', id: '|', type: 'way' },
            { role: 'to', id: '≈', type: 'way' }
          ]
        })
      ]);

      it('allows via node and via way turns from a oneway', () => {
        const turns = Rapid.osmIntersection(graph, 'b', maxDist).turns('=', 1);
        assert.ok(turns instanceof Array);
        assert.equal(turns.length, 5);

        assert.ok(turns[0] instanceof Rapid.osmTurn);
        assert.equal(turns[0].key, '=_b_-'); // straight to -
        assert.equal(turns[0].u, false);
        assert.equal(turns[0].restrictionID, 'r1');
        assert.equal(turns[0].direct, false);  // indirect
        assert.equal(turns[0].no, true);  // restricted!
        assert.equal(turns[0].only, false);

        assert.ok(turns[1] instanceof Rapid.osmTurn);
        assert.equal(turns[1].key, '=_b_|'); // left to |
        assert.equal(turns[1].u, false);
        assert.equal(turns[1].restrictionID, 'r1');
        assert.equal(turns[1].direct, false);  // indirect
        assert.equal(turns[1].no, false);
        assert.equal(turns[1].only, true);  // only (along via way)

        assert.ok(turns[2] instanceof Rapid.osmTurn);
        assert.equal(turns[2].key, '=_b_|_e_≈'); // u-turn to ≈ via |
        assert.equal(turns[2].u, false);
        assert.equal(turns[2].restrictionID, 'r1');
        assert.equal(turns[2].direct, true);  // direct
        assert.equal(turns[2].no, false);
        assert.equal(turns[2].only, true);  // only!

        assert.ok(turns[3] instanceof Rapid.osmTurn);
        assert.equal(turns[3].key, '=_b_|_e_\\'); // left to \ via |
        assert.equal(turns[3].u, false);
        assert.equal(turns[3].restrictionID, 'r1');
        assert.equal(turns[3].direct, false);  // indirect
        assert.equal(turns[3].no, true);  // restricted!
        assert.equal(turns[3].only, false);

        assert.ok(turns[4] instanceof Rapid.osmTurn);
        assert.equal(turns[4].key, '=_b_/'); // right to /
        assert.equal(turns[4].u, false);
        assert.equal(turns[4].restrictionID, 'r1');
        assert.equal(turns[4].direct, false);  // indirect
        assert.equal(turns[4].no, true);  // restricted!
        assert.equal(turns[4].only, false);
      });


      it('allows via node and via way turns from a bidirectional', () => {
        const turns = Rapid.osmIntersection(graph, 'b', maxDist).turns('/', 1);
        assert.ok(turns instanceof Array);
        assert.equal(turns.length, 8);

        assert.ok(turns[0] instanceof Rapid.osmTurn);
        assert.equal(turns[0].key, '/_b_-'); // right to -
        assert.equal(turns[0].u, false);
        assert.equal(turns[0].restrictionID, 'r2');
        assert.equal(turns[0].direct, false);  // indirect
        assert.equal(turns[0].no, true);  // restricted!
        assert.equal(turns[0].only, false);

        assert.ok(turns[1] instanceof Rapid.osmTurn);
        assert.equal(turns[1].key, '/_b_|'); // straight to |
        assert.equal(turns[1].u, false);
        assert.equal(turns[1].restrictionID, 'r2');
        assert.equal(turns[1].direct, false);  // indirect
        assert.equal(turns[1].no, false);
        assert.equal(turns[1].only, true); // only (along via way)

        assert.ok(turns[2] instanceof Rapid.osmTurn);
        assert.equal(turns[2].key, '/_b_|_e_≈'); // right turn from | to ≈
        assert.equal(turns[2].u, false);
        assert.equal(turns[2].restrictionID, 'r2');
        assert.equal(turns[2].direct, true);  // direct
        assert.equal(turns[2].no, false);
        assert.equal(turns[2].only, true); // only!

        assert.ok(turns[3] instanceof Rapid.osmTurn);
        assert.equal(turns[3].key, '/_b_|_e_\\'); // straight from | to \
        assert.equal(turns[3].u, false);
        assert.equal(turns[3].restrictionID, 'r2');
        assert.equal(turns[3].direct, false);  // indirect
        assert.equal(turns[3].no, true);  // restricted!
        assert.equal(turns[3].only, false);

        assert.ok(turns[4] instanceof Rapid.osmTurn);
        assert.equal(turns[4].key, '/_b_/'); // u-turn
        assert.equal(turns[4].u, true);
        assert.equal(turns[4].restrictionID, 'r2');
        assert.equal(turns[4].direct, false);  // indirect
        assert.equal(turns[4].no, true);  // restricted!
        assert.equal(turns[4].only, false);
      });

      it('`only_` restriction is only effective towards the via', () => {
        const turns = Rapid.osmIntersection(graph, 'b', maxDist).turns('/', 1);
        assert.ok(turns instanceof Array);
        assert.equal(turns.length, 8);

        assert.ok(turns[5] instanceof Rapid.osmTurn);
        assert.equal(turns[5].key, '/_g_/'); // u-turn from / to / (away from only-via)
        assert.equal(turns[5].u, true);

        assert.ok(turns[6] instanceof Rapid.osmTurn);
        assert.equal(turns[6].key, '/_g_≃'); // left turn from / to ≃ (away from only-via)
        assert.equal(turns[6].u, false);

        assert.ok(turns[7] instanceof Rapid.osmTurn);
        assert.equal(turns[7].key, '/_g_‖'); // straight from / to ‖ (away from only-via)
        assert.equal(turns[7].u, false);
      });
    });


    describe('complex intersection - via 2 ways', () => {
      //
      //  a <--- b <=== c
      //         |
      //         *
      //         ‖
      //  d ~~~> e ≈≈≈> f
      //
      const graph = new Rapid.Graph([
        Rapid.osmNode({ id: 'a', loc: [0, 2] }),
        Rapid.osmNode({ id: 'b', loc: [1, 2] }),
        Rapid.osmNode({ id: 'c', loc: [2, 2] }),
        Rapid.osmNode({ id: 'd', loc: [0, 0] }),
        Rapid.osmNode({ id: 'e', loc: [1, 0] }),
        Rapid.osmNode({ id: 'f', loc: [2, 0] }),
        Rapid.osmNode({ id: '*', loc: [1, 1] }),
        Rapid.osmWay({ id: '-', nodes: ['b', 'a'], tags: { highway: 'residential', oneway: 'yes' } }),
        Rapid.osmWay({ id: '=', nodes: ['c', 'b'], tags: { highway: 'residential', oneway: 'yes' } }),
        Rapid.osmWay({ id: '~', nodes: ['d', 'e'], tags: { highway: 'residential', oneway: 'yes' } }),
        Rapid.osmWay({ id: '≈', nodes: ['e', 'f'], tags: { highway: 'residential', oneway: 'yes' } }),
        Rapid.osmWay({ id: '|', nodes: ['b', '*'], tags: { highway: 'residential' } }),
        Rapid.osmWay({ id: '‖', nodes: ['*', 'e'], tags: { highway: 'residential' } })
      ]);

      it('with no restrictions, allows via node and via way turns', () => {
        const turns = Rapid.osmIntersection(graph, 'b', maxDist).turns('=', 2);
        assert.ok(turns instanceof Array);
        assert.equal(turns.length, 4);

        assert.ok(turns[0] instanceof Rapid.osmTurn);
        assert.equal(turns[0].key, '=_b_-'); // straight to -
        assert.equal(turns[0].u, false);

        assert.ok(turns[1] instanceof Rapid.osmTurn);
        assert.equal(turns[1].key, '=_b_|'); // left to |
        assert.equal(turns[1].u, false);

        assert.ok(turns[2] instanceof Rapid.osmTurn);
        assert.equal(turns[2].key, '=_b_|_*_‖'); // left to ‖ via |
        assert.equal(turns[2].u, false);

        assert.ok(turns[3] instanceof Rapid.osmTurn);
        assert.equal(turns[3].key, '=_b_|_*_‖_e_≈'); // u-turn via |,‖ to ≈
        assert.equal(turns[3].u, false);
      });


      it('supports `no_` via 2 way restriction (ordered)', () => {
        //  'r1': `no_u_turn` FROM '=' VIA WAYS '|','‖' TO '≈'
        const r1 = Rapid.osmRelation({
          id: 'r1',
          tags: { type: 'restriction', restriction: 'no_u_turn' },
          members: [
            { role: 'from', id: '=', type: 'way' },
            { role: 'via', id: '|', type: 'way' },
            { role: 'via', id: '‖', type: 'way' },
            { role: 'to', id: '≈', type: 'way' }
          ]
        });
        const graph2 = graph.replace(r1);
        const turns = Rapid.osmIntersection(graph2, 'b', maxDist).turns('=', 2);
        assert.ok(turns instanceof Array);
        assert.equal(turns.length, 4);

        assert.ok(turns[0] instanceof Rapid.osmTurn);
        assert.equal(turns[0].key, '=_b_-'); // straight to -
        assert.equal(turns[0].u, false);

        assert.ok(turns[1] instanceof Rapid.osmTurn);
        assert.equal(turns[1].key, '=_b_|'); // left to |
        assert.equal(turns[1].u, false);

        assert.ok(turns[2] instanceof Rapid.osmTurn);
        assert.equal(turns[2].key, '=_b_|_*_‖'); // left to ‖ via |
        assert.equal(turns[2].u, false);

        assert.ok(turns[3] instanceof Rapid.osmTurn);
        assert.equal(turns[3].key, '=_b_|_*_‖_e_≈'); // u-turn via |,‖ to ≈
        assert.equal(turns[3].u, false);
        assert.equal(turns[3].restrictionID, 'r1');
        assert.equal(turns[3].direct, true); // direct
        assert.equal(turns[3].no, true); // restricted!
        assert.equal(turns[3].only, false);
      });


      it('supports `no_` via 2 way restriction (unordered)', () => {
        //  'r1': `no_u_turn` FROM '=' VIA WAYS '|','‖' TO '≈'
        const r1 = Rapid.osmRelation({
          id: 'r1',
          tags: { type: 'restriction', restriction: 'no_u_turn' },
          members: [
            { role: 'from', id: '=', type: 'way' },
            { role: 'via', id: '‖', type: 'way' }, // out of order
            { role: 'via', id: '|', type: 'way' }, // out of order
            { role: 'to', id: '≈', type: 'way' }
          ]
        });
        const graph2 = graph.replace(r1);
        const turns = Rapid.osmIntersection(graph2, 'b', maxDist).turns('=', 2);
        assert.ok(turns instanceof Array);
        assert.equal(turns.length, 4);

        assert.ok(turns[0] instanceof Rapid.osmTurn);
        assert.equal(turns[0].key, '=_b_-'); // straight to -
        assert.equal(turns[0].u, false);

        assert.ok(turns[1] instanceof Rapid.osmTurn);
        assert.equal(turns[1].key, '=_b_|'); // left to |
        assert.equal(turns[1].u, false);

        assert.ok(turns[2] instanceof Rapid.osmTurn);
        assert.equal(turns[2].key, '=_b_|_*_‖'); // left to ‖ via |
        assert.equal(turns[2].u, false);

        assert.ok(turns[3] instanceof Rapid.osmTurn);
        assert.equal(turns[3].key, '=_b_|_*_‖_e_≈'); // u-turn via |,‖ to ≈
        assert.equal(turns[3].u, false);
        assert.equal(turns[3].restrictionID, 'r1');
        assert.equal(turns[3].direct, true); // direct
        assert.equal(turns[3].no, true); // restricted!
        assert.equal(turns[3].only, false);
      });


      it('supports `only_` via 2 way restriction (ordered)', () => {
        //  'r1': `only_u_turn` FROM '=' VIA WAYS '|','‖' TO '≈'
        const r1 = Rapid.osmRelation({
          id: 'r1',
          tags: { type: 'restriction', restriction: 'only_u_turn' },
          members: [
            { role: 'from', id: '=', type: 'way' },
            { role: 'via', id: '|', type: 'way' },
            { role: 'via', id: '‖', type: 'way' },
            { role: 'to', id: '≈', type: 'way' }
          ]
        });
        const graph2 = graph.replace(r1);
        const turns = Rapid.osmIntersection(graph2, 'b', maxDist).turns('=', 2);
        assert.ok(turns instanceof Array);
        assert.equal(turns.length, 4);

        assert.ok(turns[0] instanceof Rapid.osmTurn);
        assert.equal(turns[0].key, '=_b_-'); // straight to -
        assert.equal(turns[0].u, false);
        assert.equal(turns[0].restrictionID, 'r1');
        assert.equal(turns[0].direct, false); // indirect
        assert.equal(turns[0].no, true); // restricted!
        assert.equal(turns[0].only, false);

        assert.ok(turns[1] instanceof Rapid.osmTurn);
        assert.equal(turns[1].key, '=_b_|'); // left to |
        assert.equal(turns[1].u, false);
        assert.equal(turns[1].restrictionID, 'r1');
        assert.equal(turns[1].direct, false); // indirect
        assert.equal(turns[1].no, false);
        assert.equal(turns[1].only, true);  // only (along via way)

        assert.ok(turns[2] instanceof Rapid.osmTurn);
        assert.equal(turns[2].key, '=_b_|_*_‖'); // left to ‖ via |
        assert.equal(turns[2].u, false);
        assert.equal(turns[2].restrictionID, 'r1');
        assert.equal(turns[2].direct, false); // indirect
        assert.equal(turns[2].no, false);
        assert.equal(turns[2].only, true);  // only (along via way)

        assert.ok(turns[3] instanceof Rapid.osmTurn);
        assert.equal(turns[3].key, '=_b_|_*_‖_e_≈'); // u-turn via |,‖ to ≈
        assert.equal(turns[3].u, false);
        assert.equal(turns[3].restrictionID, 'r1');
        assert.equal(turns[3].direct, true); // direct
        assert.equal(turns[3].no, false);
        assert.equal(turns[3].only, true); // only!
      });

      it('supports `only_` via 2 way restriction (unordered)', () => {
        //  'r1': `only_u_turn` FROM '=' VIA WAYS '‖','|' TO '≈'
        const r1 = Rapid.osmRelation({
          id: 'r1',
          tags: { type: 'restriction', restriction: 'only_u_turn' },
          members: [
            { role: 'from', id: '=', type: 'way' },
            { role: 'via', id: '‖', type: 'way' }, // out of order
            { role: 'via', id: '|', type: 'way' }, // out of order
            { role: 'to', id: '≈', type: 'way' }
          ]
        });
        const graph2 = graph.replace(r1);
        const turns = Rapid.osmIntersection(graph2, 'b', maxDist).turns('=', 2);
        assert.ok(turns instanceof Array);
        assert.equal(turns.length, 4);

        assert.ok(turns[0] instanceof Rapid.osmTurn);
        assert.equal(turns[0].key, '=_b_-'); // straight to -
        assert.equal(turns[0].u, false);
        assert.equal(turns[0].restrictionID, 'r1');
        assert.equal(turns[0].direct, false); // indirect
        assert.equal(turns[0].no, true); // restricted!
        assert.equal(turns[0].only, false);

        assert.ok(turns[1] instanceof Rapid.osmTurn);
        assert.equal(turns[1].key, '=_b_|'); // left to |
        assert.equal(turns[1].u, false);
        assert.equal(turns[1].restrictionID, 'r1');
        assert.equal(turns[1].direct, false); // indirect
        assert.equal(turns[1].no, false);
        assert.equal(turns[1].only, true);  // only (along via way)

        assert.ok(turns[2] instanceof Rapid.osmTurn);
        assert.equal(turns[2].key, '=_b_|_*_‖'); // left to ‖ via |
        assert.equal(turns[2].u, false);
        assert.equal(turns[2].restrictionID, 'r1');
        assert.equal(turns[2].direct, false); // indirect
        assert.equal(turns[2].no, false);
        assert.equal(turns[2].only, true);  // only (along via way)

        assert.ok(turns[3] instanceof Rapid.osmTurn);
        assert.equal(turns[3].key, '=_b_|_*_‖_e_≈'); // u-turn via |,‖ to ≈
        assert.equal(turns[3].u, false);
        assert.equal(turns[3].restrictionID, 'r1');
        assert.equal(turns[3].direct, true); // direct
        assert.equal(turns[3].no, false);
        assert.equal(turns[3].only, true); // only!
      });
    });


    describe('complex intersection - via 2 ways with loops - gotchas', () => {
      //
      //            e
      //           / \
      //          /   \
      //   a --- b === c ~~~ d
      //
      const graph = new Rapid.Graph([
        Rapid.osmNode({ id: 'a', loc: [0, 0] }),
        Rapid.osmNode({ id: 'b', loc: [1, 0] }),
        Rapid.osmNode({ id: 'c', loc: [3, 0] }),
        Rapid.osmNode({ id: 'd', loc: [4, 0] }),
        Rapid.osmNode({ id: 'e', loc: [2, 2] }),
        Rapid.osmWay({ id: '-', nodes: ['a', 'b'], tags: { highway: 'residential' } }),
        Rapid.osmWay({ id: '=', nodes: ['b', 'c'], tags: { highway: 'residential' } }),
        Rapid.osmWay({ id: '~', nodes: ['c', 'd'], tags: { highway: 'residential' } }),
        Rapid.osmWay({ id: '/', nodes: ['b', 'e'], tags: { highway: 'residential' } }),
        Rapid.osmWay({ id: '\\', nodes: ['e', 'c'], tags: { highway: 'residential' } })
      ]);

      it('with no restrictions, finds all turns', () => {
        const turns = Rapid.osmIntersection(graph, 'c', maxDist).turns('=', 2);
        assert.ok(turns instanceof Array);
        assert.equal(turns.length, 10);

        assert.equal(turns[0].key, '=_b_=');
        assert.equal(turns[0].u, true);

        assert.equal(turns[1].key, '=_b_/');
        assert.equal(turns[1].u, false);

        assert.equal(turns[2].key, '=_b_/_e_\\');
        assert.equal(turns[2].u, false);

        assert.equal(turns[3].key, '=_b_/_e_\\_c_~');
        assert.equal(turns[3].u, false);

        assert.equal(turns[4].key, '=_b_-');
        assert.equal(turns[4].u, false);

        assert.equal(turns[5].key, '=_c_=');
        assert.equal(turns[5].u, true);

        assert.equal(turns[6].key, '=_c_~');
        assert.equal(turns[6].u, false);

        assert.equal(turns[7].key, '=_c_\\');
        assert.equal(turns[7].u, false);

        assert.equal(turns[8].key, '=_c_\\_e_/');
        assert.equal(turns[8].u, false);

        assert.equal(turns[9].key, '=_c_\\_e_/_b_-');
        assert.equal(turns[9].u, false);
      });


      it('matches from-via-to strictly when alternate paths exist between from-via-to', () => {
        const r1 = Rapid.osmRelation({
          id: 'r1',
          tags: { type: 'restriction', restriction: 'no_straight_on' },
          members: [
            { role: 'from', id: '=', type: 'way' },
            { role: 'via', id: 'c', type: 'node' },
            { role: 'to', id: '~', type: 'way' }
          ]
        });
        const graph2 = graph.replace(r1);
        const turns = Rapid.osmIntersection(graph2, 'c', maxDist).turns('=', 2);
        assert.ok(turns instanceof Array);
        assert.equal(turns.length, 10);

        assert.equal(turns[0].key, '=_b_=');
        assert.equal(turns[0].u, true);

        assert.equal(turns[1].key, '=_b_/');
        assert.equal(turns[1].u, false);

        assert.equal(turns[2].key, '=_b_/_e_\\');
        assert.equal(turns[2].u, false);

        assert.equal(turns[3].key, '=_b_/_e_\\_c_~');
        assert.equal(turns[3].u, false);
        assert.equal(turns[3].restrictionID, undefined); // the alternate path should not match
        assert.equal(turns[3].direct, undefined);

        assert.equal(turns[4].key, '=_b_-');
        assert.equal(turns[4].u, false);

        assert.equal(turns[5].key, '=_c_=');
        assert.equal(turns[5].u, true);

        assert.equal(turns[6].key, '=_c_~');
        assert.equal(turns[6].u, false);
        assert.equal(turns[6].restrictionID, 'r1');
        assert.equal(turns[6].direct, true); // direct
        assert.equal(turns[6].no, true); // restricted!
        assert.equal(turns[6].only, false);

        assert.equal(turns[7].key, '=_c_\\');
        assert.equal(turns[7].u, false);

        assert.equal(turns[8].key, '=_c_\\_e_/');
        assert.equal(turns[8].u, false);

        assert.equal(turns[9].key, '=_c_\\_e_/_b_-');
        assert.equal(turns[9].u, false);
      });


      it('`only_` restriction is only effective towards the via', () => {
        const r1 = Rapid.osmRelation({
          id: 'r1',
          tags: { type: 'restriction', restriction: 'only_straight_on' },
          members: [
            { role: 'from', id: '=', type: 'way' },
            { role: 'via', id: 'c', type: 'node' },
            { role: 'to', id: '~', type: 'way' }
          ]
        });
        const graph2 = graph.replace(r1);
        const turns = Rapid.osmIntersection(graph2, 'c', maxDist).turns('=', 2);
        assert.ok(turns instanceof Array);
        assert.equal(turns.length, 8);

        assert.equal(turns[0].key, '=_b_=');  // not towards via
        assert.equal(turns[0].u, true);

        assert.equal(turns[1].key, '=_b_/');  // not towards via
        assert.equal(turns[1].u, false);

        assert.equal(turns[2].key, '=_b_/_e_\\');  // not towards via
        assert.equal(turns[2].u, false);

        assert.equal(turns[3].key, '=_b_/_e_\\_c_~');  // not towards via
        assert.equal(turns[3].u, false);
        assert.equal(turns[3].restrictionID, undefined); // the alternate path should not match
        assert.equal(turns[3].direct, undefined);

        assert.equal(turns[4].key, '=_b_-'); // not towards via
        assert.equal(turns[4].u, false);

        assert.equal(turns[5].key, '=_c_=');
        assert.equal(turns[5].u, true);
        assert.equal(turns[5].restrictionID, 'r1');
        assert.equal(turns[5].direct, false); // indirect
        assert.equal(turns[5].no, true); // restricted!
        assert.equal(turns[5].only, false);

        assert.equal(turns[6].key, '=_c_~');
        assert.equal(turns[6].u, false);
        assert.equal(turns[6].restrictionID, 'r1');
        assert.equal(turns[6].direct, true); // direct
        assert.equal(turns[6].no, false);
        assert.equal(turns[6].only, true); // only!

        assert.equal(turns[7].key, '=_c_\\');
        assert.equal(turns[7].u, false);
        assert.equal(turns[7].restrictionID, 'r1');
        assert.equal(turns[7].direct, false); // indirect
        assert.equal(turns[7].no, true); // restricted!
        assert.equal(turns[7].only, false);
      });
    });

  });
});


describe('osmInferRestriction', () => {
  const viewport = new Rapid.sdk.Viewport({ k: 250 / Math.PI });

  it('infers the restriction type based on the turn angle', () => {
    //
    //  u === * ~~~ w
    //        |
    //        x
    //
    const graph = new Rapid.Graph([
      Rapid.osmNode({ id: 'u', loc: [-1, 0] }),
      Rapid.osmNode({ id: '*', loc: [0, 0] }),
      Rapid.osmNode({ id: 'w', loc: [1, 0] }),
      Rapid.osmNode({ id: 'x', loc: [0, -1] }),
      Rapid.osmWay({ id: '=', nodes: ['u', '*'] }),
      Rapid.osmWay({ id: '-', nodes: ['*', 'x'] }),
      Rapid.osmWay({ id: '~', nodes: ['*', 'w'] })
    ]);

    const r1 = Rapid.osmInferRestriction(graph, {
      from: { node: 'u', way: '=', vertex: '*' },
      to: { node: 'x', way: '-', vertex: '*' }
    }, viewport);
    assert.equal(r1, 'no_right_turn');

    const r2 = Rapid.osmInferRestriction(graph, {
      from: { node: 'x', way: '-', vertex: '*' },
      to: { node: 'w', way: '~', vertex: '*' }
    }, viewport);
    assert.equal(r2, 'no_right_turn');

    const l1 = Rapid.osmInferRestriction(graph, {
      from: { node: 'x', way: '-', vertex: '*' },
      to: { node: 'u', way: '=', vertex: '*' }
    }, viewport);
    assert.equal(l1, 'no_left_turn');

    const l2 = Rapid.osmInferRestriction(graph, {
      from: { node: 'w', way: '~', vertex: '*' },
      to: { node: 'x', way: '-', vertex: '*' }
    }, viewport);
    assert.equal(l2, 'no_left_turn');

    const s = Rapid.osmInferRestriction(graph, {
      from: { node: 'u', way: '=', vertex: '*' },
      to: { node: 'w', way: '~', vertex: '*' }
    }, viewport);
    assert.equal(s, 'no_straight_on');

    const u = Rapid.osmInferRestriction(graph, {
      from: { node: 'u', way: '=', vertex: '*' },
      to: { node: 'u', way: '=', vertex: '*' }
    }, viewport);
    assert.equal(u, 'no_u_turn');
  });


  it('infers no_u_turn from sharply acute angle made by forward oneways', () => {
    //      *
    //     / \
    //  w2/   \w1        angle ≈22.6°
    //   /     \
    //  u       x
    const graph = new Rapid.Graph([
      Rapid.osmNode({ id: 'u', loc: [0, -5] }),
      Rapid.osmNode({ id: '*', loc: [1, 0] }),
      Rapid.osmNode({ id: 'x', loc: [2, -5] }),
      Rapid.osmWay({ id: 'w1', nodes: ['x', '*'], tags: { oneway: 'yes' } }),
      Rapid.osmWay({ id: 'w2', nodes: ['*', 'u'], tags: { oneway: 'yes' } })
    ]);

    const r = Rapid.osmInferRestriction(graph, {
      from: { node: 'x', way: 'w1', vertex: '*' },
      to: { node: 'u', way: 'w2', vertex: '*' }
    }, viewport);
    assert.equal(r, 'no_u_turn');
  });


  it('does not infer no_u_turn from widely acute angle made by forward oneways', () => {
    //      *
    //     / \
    //  w2/   \w1        angle ≈36.9°
    //   /     \         (no left turn)
    //  u       x
    const graph = new Rapid.Graph([
      Rapid.osmNode({ id: 'u', loc: [0, -3] }),
      Rapid.osmNode({ id: '*', loc: [1, 0] }),
      Rapid.osmNode({ id: 'x', loc: [2, -3] }),
      Rapid.osmWay({ id: 'w1', nodes: ['x', '*'], tags: { oneway: 'yes' } }),
      Rapid.osmWay({ id: 'w2', nodes: ['*', 'u'], tags: { oneway: 'yes' } })
    ]);

    const r = Rapid.osmInferRestriction(graph, {
      from: { node: 'x', way: 'w1', vertex: '*' },
      to: { node: 'u', way: 'w2', vertex: '*' }
    }, viewport);
    assert.equal(r, 'no_left_turn');
  });


  it('infers no_u_turn from sharply acute angle made by forward oneways with a via way', () => {
    //      * -- +
    //     /      \
    //  w2/        \w1      angle ≈22.6°
    //   /          \       (no u turn)
    //  u            x
    const graph = new Rapid.Graph([
      Rapid.osmNode({ id: 'u', loc: [0, -5] }),
      Rapid.osmNode({ id: '*', loc: [1, 0] }),
      Rapid.osmNode({ id: '+', loc: [2, 0] }),
      Rapid.osmNode({ id: 'x', loc: [3, -5] }),
      Rapid.osmWay({ id: 'w1', nodes: ['x', '+'], tags: { oneway: 'yes' } }),
      Rapid.osmWay({ id: 'w2', nodes: ['*', 'u'], tags: { oneway: 'yes' } }),
      Rapid.osmWay({ id: '-', nodes: ['*', '+'] })
    ]);

    const r = Rapid.osmInferRestriction(graph, {
      from: { node: 'x', way: 'w1', vertex: '+' },
      to: { node: 'u', way: 'w2', vertex: '*' }
    }, viewport);
    assert.equal(r, 'no_u_turn');
  });


  it('infers no_u_turn from widely acute angle made by forward oneways with a via way', () => {
    //      * -- +
    //     /      \
    //  w2/        \w1      angle ≈36.9°
    //   /          \       (no u turn)
    //  u            x
    const graph = new Rapid.Graph([
      Rapid.osmNode({ id: 'u', loc: [0, -3] }),
      Rapid.osmNode({ id: '*', loc: [1, 0] }),
      Rapid.osmNode({ id: '+', loc: [2, 0] }),
      Rapid.osmNode({ id: 'x', loc: [3, -3] }),
      Rapid.osmWay({ id: 'w1', nodes: ['x', '+'], tags: { oneway: 'yes' } }),
      Rapid.osmWay({ id: 'w2', nodes: ['*', 'u'], tags: { oneway: 'yes' } }),
      Rapid.osmWay({ id: '-', nodes: ['*', '+'] })
    ]);

    const r = Rapid.osmInferRestriction(graph, {
      from: { node: 'x', way: 'w1', vertex: '+' },
      to: { node: 'u', way: 'w2', vertex: '*' }
    }, viewport);
    assert.equal(r, 'no_u_turn');
  });
});
