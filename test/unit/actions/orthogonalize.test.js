import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';

describe('actionOrthogonalize', () => {
    const viewport = {
      project:   val => val,
      unproject: val => val
    };

    describe('closed paths', () => {
        it('orthogonalizes a perfect quad', () => {
            //    d --- c
            //    |     |
            //    a --- b
            const graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [0, 0]}),
                Rapid.osmNode({id: 'b', loc: [2, 0]}),
                Rapid.osmNode({id: 'c', loc: [2, 2]}),
                Rapid.osmNode({id: 'd', loc: [0, 2]}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd', 'a']})
            ]);
            const result = Rapid.actionOrthogonalize('-', viewport)(graph);
            assert.deepEqual(result.entity('-').nodes.length, 5);
        });


        it('orthogonalizes a quad', () => {
            //    d --- c
            //    |     |
            //    a ---  b
            const graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [0, 0]}),
                Rapid.osmNode({id: 'b', loc: [2.1, 0]}),
                Rapid.osmNode({id: 'c', loc: [2, 2]}),
                Rapid.osmNode({id: 'd', loc: [0, 2]}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd', 'a']})
            ]);

            const result = Rapid.actionOrthogonalize('-', viewport)(graph);
            assert.deepEqual(result.entity('-').nodes.length, 5);
        });


        it('orthogonalizes a triangle', () => {
            //    a
            //    | \
            //    |   \
            //     b - c
            const graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [0, 3]}),
                Rapid.osmNode({id: 'b', loc: [0.1, 0]}),
                Rapid.osmNode({id: 'c', loc: [3, 0]}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'a']})
            ]);

            const result = Rapid.actionOrthogonalize('-', viewport)(graph);
            assert.deepEqual(result.entity('-').nodes.length, 4);
        });


        it('deletes empty redundant nodes', () => {
            //    e - d - c
            //    |       |
            //    a ----- b
            const graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [0, 0]}),
                Rapid.osmNode({id: 'b', loc: [2, 0]}),
                Rapid.osmNode({id: 'c', loc: [2, 2]}),
                Rapid.osmNode({id: 'd', loc: [1, 2]}),
                Rapid.osmNode({id: 'e', loc: [0, 2]}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd', 'e', 'a']})
            ]);

            const result = Rapid.actionOrthogonalize('-', viewport)(graph);
            assert.equal(result.hasEntity('d'), undefined);
        });


        it('preserves non empty redundant nodes', () => {
            //    e - d - c
            //    |       |
            //    a ----- b
            const graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [0, 0]}),
                Rapid.osmNode({id: 'b', loc: [2, 0]}),
                Rapid.osmNode({id: 'c', loc: [2, 2]}),
                Rapid.osmNode({id: 'd', loc: [1, 2], tags: {foo: 'bar'}}),
                Rapid.osmNode({id: 'e', loc: [0, 2]}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd', 'e', 'a']})
            ]);

            const result = Rapid.actionOrthogonalize('-', viewport)(graph);
            assert.deepEqual(result.entity('-').nodes.length, 6);
            assert.notEqual(result.hasEntity('d'), undefined);
        });


        it('only moves nodes which are near right or near straight', () => {
            //    f - e
            //    |    \
            //    |     d - c
            //    |         |
            //    a -------- b
            const graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [0, 0]}),
                Rapid.osmNode({id: 'b', loc: [3.1, 0]}),
                Rapid.osmNode({id: 'c', loc: [3, 1]}),
                Rapid.osmNode({id: 'd', loc: [2, 1]}),
                Rapid.osmNode({id: 'e', loc: [1, 2]}),
                Rapid.osmNode({id: 'f', loc: [0, 2]}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd', 'e', 'f', 'a']})
            ]);

            const diff = new Rapid.Difference(graph, Rapid.actionOrthogonalize('-', viewport)(graph));
            assert.ok(diff.changes instanceof Map);
            assert.ok(!diff.changes.has('d'));
            assert.ok(!diff.changes.has('e'));
            assert.ok(diff.changes.has('a'));
            assert.ok(diff.changes.has('b'));
            assert.ok(diff.changes.has('c'));
            assert.ok(diff.changes.has('f'));
        });


        it('does not move or remove self-intersecting nodes', () => {
            //   f -- g
            //   |    |
            //   e --- d - c
            //        |    |
            //        a -- b
            const graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [ 0, -1]}),
                Rapid.osmNode({id: 'b', loc: [ 1, -1]}),
                Rapid.osmNode({id: 'c', loc: [ 0,  1]}),
                Rapid.osmNode({id: 'd', loc: [ 0.1,  0]}),
                Rapid.osmNode({id: 'e', loc: [-1,  0]}),
                Rapid.osmNode({id: 'f', loc: [-1,  1]}),
                Rapid.osmNode({id: 'g', loc: [ 0,  1]}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'd', 'a']})
            ]);

            const diff = new Rapid.Difference(graph, Rapid.actionOrthogonalize('-', viewport)(graph));
            assert.notDeepEqual(Object.keys(diff.changes), ['d']);
            assert.ok(graph.hasEntity('d'));
        });


        it('preserves the shape of skinny quads', () => {
            const viewport = new Rapid.sdk.Viewport();
            const tests = [
                [
                    [-77.0339864831478, 38.8616391227204],
                    [-77.0209775298677, 38.8613609264884],
                    [-77.0210405781065, 38.8607390721519],
                    [-77.0339024188294, 38.8610663645859]
                ],
                [
                    [-89.4706683, 40.6261177],
                    [-89.4706664, 40.6260574],
                    [-89.4693973, 40.6260830],
                    [-89.4694012, 40.6261355]
                ]
            ];

            for (var i = 0; i < tests.length; i++) {
                const graph = new Rapid.Graph([
                    Rapid.osmNode({id: 'a', loc: tests[i][0]}),
                    Rapid.osmNode({id: 'b', loc: tests[i][1]}),
                    Rapid.osmNode({id: 'c', loc: tests[i][2]}),
                    Rapid.osmNode({id: 'd', loc: tests[i][3]}),
                    Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd', 'a']})
                ]);
                const initialWidth = Rapid.sdk.geoSphericalDistance(graph.entity('a').loc, graph.entity('b').loc);
                const result = Rapid.actionOrthogonalize('-', viewport)(graph);
                const finalWidth = Rapid.sdk.geoSphericalDistance(result.entity('a').loc, result.entity('b').loc);
                assert.ok(finalWidth / initialWidth >= 0.90 && finalWidth / initialWidth <= 1.10);
            }
        });
    });


    describe('open paths', () => {
        it('orthogonalizes a perfect quad path', () => {
            //    d --- c
            //          |
            //    a --- b
            const graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [0, 0]}),
                Rapid.osmNode({id: 'b', loc: [2, 0]}),
                Rapid.osmNode({id: 'c', loc: [2, 2]}),
                Rapid.osmNode({id: 'd', loc: [0, 2]}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd']})
            ]);

            const result = Rapid.actionOrthogonalize('-', viewport)(graph);
            assert.deepEqual(result.entity('-').nodes.length, 4);
        });


        it('orthogonalizes a quad path', () => {
            //    d --- c
            //          |
            //    a ---  b
            const graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [0, 0]}),
                Rapid.osmNode({id: 'b', loc: [2.1, 0]}),
                Rapid.osmNode({id: 'c', loc: [2, 2]}),
                Rapid.osmNode({id: 'd', loc: [0, 2]}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd']})
            ]);

            const result = Rapid.actionOrthogonalize('-', viewport)(graph);
            assert.deepEqual(result.entity('-').nodes.length, 4);
        });


        it('orthogonalizes a 3-point path', () => {
            //    a
            //    |
            //    |
            //     b - c
            const graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [0, 3]}),
                Rapid.osmNode({id: 'b', loc: [0.1, 0]}),
                Rapid.osmNode({id: 'c', loc: [3, 0]}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c']})
            ]);

            const result = Rapid.actionOrthogonalize('-', viewport)(graph);
            assert.deepEqual(result.entity('-').nodes.length, 3);
        });


        it('deletes empty redundant nodes', () => {
            //    e - d - c
            //            |
            //    a ----- b
            const graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [0, 0]}),
                Rapid.osmNode({id: 'b', loc: [2, 0]}),
                Rapid.osmNode({id: 'c', loc: [2, 2]}),
                Rapid.osmNode({id: 'd', loc: [1, 2]}),
                Rapid.osmNode({id: 'e', loc: [0, 2]}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd', 'e']})
            ]);

            const result = Rapid.actionOrthogonalize('-', viewport)(graph);
            assert.equal(result.hasEntity('d'), undefined);
        });


        it('preserves non empty redundant nodes', () => {
            //    e - d - c
            //            |
            //    a ----- b
            const graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [0, 0]}),
                Rapid.osmNode({id: 'b', loc: [2, 0]}),
                Rapid.osmNode({id: 'c', loc: [2, 2]}),
                Rapid.osmNode({id: 'd', loc: [1, 2], tags: {foo: 'bar'}}),
                Rapid.osmNode({id: 'e', loc: [0, 2]}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd', 'e']})
            ]);

            const result = Rapid.actionOrthogonalize('-', viewport)(graph);
            assert.deepEqual(result.entity('-').nodes.length, 5);
            assert.ok(result.hasEntity('d'));
        });


        it('only moves non-endpoint nodes which are near right or near straight', () => {
            //    f - e
            //         \
            //          d - c
            //              |
            //    a -------- b
            const graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [0, 0]}),
                Rapid.osmNode({id: 'b', loc: [3.1, 0]}),
                Rapid.osmNode({id: 'c', loc: [3, 1]}),
                Rapid.osmNode({id: 'd', loc: [2, 1]}),
                Rapid.osmNode({id: 'e', loc: [1, 2]}),
                Rapid.osmNode({id: 'f', loc: [0, 2]}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd', 'e', 'f']})
            ]);

            const diff = new Rapid.Difference(graph, Rapid.actionOrthogonalize('-', viewport)(graph));
            assert.ok(diff.changes instanceof Map);
            assert.ok(!diff.changes.has('a'));
            assert.ok(!diff.changes.has('d'));
            assert.ok(!diff.changes.has('e'));
            assert.ok(!diff.changes.has('f'));
            assert.ok(diff.changes.has('b'));
            assert.ok(diff.changes.has('c'));
        });


        it('does not move or remove self-intersecting nodes', () => {
            //   f -- g
            //   |    |
            //   e --- d - c
            const graph = new Rapid.Graph([
                Rapid.osmNode({id: 'c', loc: [ 0,  1]}),
                Rapid.osmNode({id: 'd', loc: [ 0.1,  0]}),
                Rapid.osmNode({id: 'e', loc: [-1,  0]}),
                Rapid.osmNode({id: 'f', loc: [-1,  1]}),
                Rapid.osmNode({id: 'g', loc: [ 0,  1]}),
                Rapid.osmWay({id: '-', nodes: ['c', 'd', 'e', 'f', 'g', 'd']})
            ]);

            const diff = new Rapid.Difference(graph, Rapid.actionOrthogonalize('-', viewport)(graph));
            assert.ok(!Object.keys(diff.changes).includes('d'));
            assert.ok(graph.hasEntity('d'));
        });
    });


    describe('vertices', () => {
        it('orthogonalizes a single vertex in a quad', () => {
            //    d --- c
            //    |     |
            //    a ---  b
            const graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [0, 0]}),
                Rapid.osmNode({id: 'b', loc: [2.1, 0]}),
                Rapid.osmNode({id: 'c', loc: [2, 2]}),
                Rapid.osmNode({id: 'd', loc: [0, 2]}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd', 'a']})
            ]);

            const diff = new Rapid.Difference(graph, Rapid.actionOrthogonalize('-', viewport, 'b')(graph));
            assert.ok(diff.changes instanceof Map);
            assert.ok(!diff.changes.has('a'));
            assert.ok(diff.changes.has('b'));
            assert.ok(!diff.changes.has('c'));
        });


        it('orthogonalizes a single vertex in a triangle', () => {
            //    a
            //    | \
            //    |   \
            //     b - c
            const graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [0, 3]}),
                Rapid.osmNode({id: 'b', loc: [0.1, 0]}),
                Rapid.osmNode({id: 'c', loc: [3, 0]}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'a']})
            ]);

            const diff = new Rapid.Difference(graph, Rapid.actionOrthogonalize('-', viewport, 'b')(graph));
            assert.ok(diff.changes instanceof Map);
            assert.ok(!diff.changes.has('a'));
            assert.ok(diff.changes.has('b'));
            assert.ok(!diff.changes.has('c'));
         });


        it('orthogonalizes a single vertex in a quad path', () => {
            //    d --- c
            //          |
            //    a ---  b
            const graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [0, 0]}),
                Rapid.osmNode({id: 'b', loc: [2.1, 0]}),
                Rapid.osmNode({id: 'c', loc: [2, 2]}),
                Rapid.osmNode({id: 'd', loc: [0, 2]}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd']})
            ]);

            const diff = new Rapid.Difference(graph, Rapid.actionOrthogonalize('-', viewport, 'b')(graph));
            assert.ok(diff.changes instanceof Map);
            assert.ok(!diff.changes.has('a'));
            assert.ok(diff.changes.has('b'));
            assert.ok(!diff.changes.has('c'));
            assert.ok(!diff.changes.has('d'));
        });


        it('orthogonalizes a single vertex in a 3-point path', () => {
            //    a
            //    |
            //    |
            //     b - c
            const graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [0, 3]}),
                Rapid.osmNode({id: 'b', loc: [0.1, 0]}),
                Rapid.osmNode({id: 'c', loc: [3, 0]}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c']})
            ]);

            const diff = new Rapid.Difference(graph, Rapid.actionOrthogonalize('-', viewport, 'b')(graph));
            assert.ok(diff.changes instanceof Map);
            assert.ok(!diff.changes.has('a'));
            assert.ok(diff.changes.has('b'));
            assert.ok(!diff.changes.has('c'));
        });
    });


    describe('#disabled', () => {

        describe('closed paths', () => {
            it('returns "square_enough" for a perfect quad', () => {
                //    d ---- c
                //    |      |
                //    a ---- b
                const graph = new Rapid.Graph([
                    Rapid.osmNode({id: 'a', loc: [0, 0]}),
                    Rapid.osmNode({id: 'b', loc: [2, 0]}),
                    Rapid.osmNode({id: 'c', loc: [2, 2]}),
                    Rapid.osmNode({id: 'd', loc: [0, 2]}),
                    Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd', 'a']})
                ]);

                const result = Rapid.actionOrthogonalize('-', viewport).disabled(graph);
                assert.equal(result, 'square_enough');
            });


            it('returns false for unsquared quad', () => {
                //    d --- c
                //    |     |
                //    a ---- b
                const graph = new Rapid.Graph([
                    Rapid.osmNode({id: 'a', loc: [0, 0]}),
                    Rapid.osmNode({id: 'b', loc: [2.1, 0]}),
                    Rapid.osmNode({id: 'c', loc: [2, 2]}),
                    Rapid.osmNode({id: 'd', loc: [0, 2]}),
                    Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd', 'a']})
                ]);

                const result = Rapid.actionOrthogonalize('-', viewport).disabled(graph);
                assert.equal(result, false);
            });


            it('returns false for unsquared triangle', () => {
                //    a
                //    | \
                //    |   \
                //     b - c
                const graph = new Rapid.Graph([
                    Rapid.osmNode({id: 'a', loc: [0, 3]}),
                    Rapid.osmNode({id: 'b', loc: [0.1, 0]}),
                    Rapid.osmNode({id: 'c', loc: [3, 0]}),
                    Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'a']})
                ]);

                const result = Rapid.actionOrthogonalize('-', viewport).disabled(graph);
                assert.equal(result, false);
            });


            it('returns false for perfectly square shape with redundant nodes', () => {
                //    e - d - c
                //    |       |
                //    a ----- b
                const graph = new Rapid.Graph([
                    Rapid.osmNode({id: 'a', loc: [0, 0]}),
                    Rapid.osmNode({id: 'b', loc: [2, 0]}),
                    Rapid.osmNode({id: 'c', loc: [2, 2]}),
                    Rapid.osmNode({id: 'd', loc: [1, 2]}),
                    Rapid.osmNode({id: 'e', loc: [0, 2]}),
                    Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd', 'e', 'a']})
                ]);

                const result = Rapid.actionOrthogonalize('-', viewport).disabled(graph);
                assert.equal(result, false);
            });


            it('returns "not_squarish" for shape that can not be squared', () => {
                //      e -- d
                //     /      \
                //    f        c
                //     \      /
                //      a -- b
                const graph = new Rapid.Graph([
                    Rapid.osmNode({id: 'a', loc: [1, 0]}),
                    Rapid.osmNode({id: 'b', loc: [3, 0]}),
                    Rapid.osmNode({id: 'c', loc: [4, 2]}),
                    Rapid.osmNode({id: 'd', loc: [3, 4]}),
                    Rapid.osmNode({id: 'e', loc: [1, 4]}),
                    Rapid.osmNode({id: 'f', loc: [0, 2]}),
                    Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd', 'e', 'f', 'a']})
                ]);

                const result = Rapid.actionOrthogonalize('-', viewport).disabled(graph);
                assert.equal(result, 'not_squarish');
            });


            it('returns false for non-square self-intersecting shapes', () => {
                //   f -- g
                //   |    |
                //   e --- d - c
                //        |    |
                //        a -- b
                const graph = new Rapid.Graph([
                    Rapid.osmNode({id: 'a', loc: [ 0, -1]}),
                    Rapid.osmNode({id: 'b', loc: [ 1, -1]}),
                    Rapid.osmNode({id: 'c', loc: [ 0,  1]}),
                    Rapid.osmNode({id: 'd', loc: [ 0.1,  0]}),
                    Rapid.osmNode({id: 'e', loc: [-1,  0]}),
                    Rapid.osmNode({id: 'f', loc: [-1,  1]}),
                    Rapid.osmNode({id: 'g', loc: [ 0,  1]}),
                    Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'd', 'a']})
                ]);

                const result = Rapid.actionOrthogonalize('-', viewport).disabled(graph);
                assert.equal(result, false);
            });
        });


        describe('open paths', () => {
            it('returns "square_enough" for a perfect quad', () => {
                //    d ---- c
                //           |
                //    a ---- b
                const graph = new Rapid.Graph([
                    Rapid.osmNode({id: 'a', loc: [0, 0]}),
                    Rapid.osmNode({id: 'b', loc: [2, 0]}),
                    Rapid.osmNode({id: 'c', loc: [2, 2]}),
                    Rapid.osmNode({id: 'd', loc: [0, 2]}),
                    Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd']})
                ]);

                const result = Rapid.actionOrthogonalize('-', viewport).disabled(graph);
                assert.equal(result, 'square_enough');
            });


            it('returns false for unsquared quad', () => {
                //    d --- c
                //          |
                //    a ---  b
                const graph = new Rapid.Graph([
                    Rapid.osmNode({id: 'a', loc: [0, 0]}),
                    Rapid.osmNode({id: 'b', loc: [2.1, 0]}),
                    Rapid.osmNode({id: 'c', loc: [2, 2]}),
                    Rapid.osmNode({id: 'd', loc: [0, 2]}),
                    Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd']})
                ]);

                const result = Rapid.actionOrthogonalize('-', viewport).disabled(graph);
                assert.equal(result, false);
            });


            it('returns false for unsquared 3-point path', () => {
                //    a
                //    |
                //    |
                //     b - c
                const graph = new Rapid.Graph([
                    Rapid.osmNode({id: 'a', loc: [0, 3]}),
                    Rapid.osmNode({id: 'b', loc: [0, 0.1]}),
                    Rapid.osmNode({id: 'c', loc: [3, 0]}),
                    Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c']})
                ]);

                const result = Rapid.actionOrthogonalize('-', viewport).disabled(graph);
                assert.equal(result, false);
            });


            it('returns false for perfectly square shape with redundant nodes', () => {
                //    e - d - c
                //            |
                //    a ----- b
                const graph = new Rapid.Graph([
                    Rapid.osmNode({id: 'a', loc: [0, 0]}),
                    Rapid.osmNode({id: 'b', loc: [2, 0]}),
                    Rapid.osmNode({id: 'c', loc: [2, 2]}),
                    Rapid.osmNode({id: 'd', loc: [1, 2]}),
                    Rapid.osmNode({id: 'e', loc: [0, 2]}),
                    Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd', 'e']})
                ]);

                const result = Rapid.actionOrthogonalize('-', viewport).disabled(graph);
                assert.equal(result, false);
            });


            it('returns "not_squarish" for path that can not be squared', () => {
                //      e -- d
                //     /      \
                //    f        c
                //            /
                //      a -- b
                const graph = new Rapid.Graph([
                    Rapid.osmNode({id: 'a', loc: [1, 0]}),
                    Rapid.osmNode({id: 'b', loc: [3, 0]}),
                    Rapid.osmNode({id: 'c', loc: [4, 2]}),
                    Rapid.osmNode({id: 'd', loc: [3, 4]}),
                    Rapid.osmNode({id: 'e', loc: [1, 4]}),
                    Rapid.osmNode({id: 'f', loc: [0, 2]}),
                    Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd', 'e', 'f']})
                ]);

                const result = Rapid.actionOrthogonalize('-', viewport).disabled(graph);
                assert.equal(result, 'not_squarish');
            });


            it('returns false for non-square self-intersecting paths', () => {
                //   f -- g
                //   |    |
                //   e --- d - c
                const graph = new Rapid.Graph([
                    Rapid.osmNode({id: 'c', loc: [ 0,  1]}),
                    Rapid.osmNode({id: 'd', loc: [ 0.1,  0]}),
                    Rapid.osmNode({id: 'e', loc: [-1,  0]}),
                    Rapid.osmNode({id: 'f', loc: [-1,  1]}),
                    Rapid.osmNode({id: 'g', loc: [ 0,  1]}),
                    Rapid.osmWay({id: '-', nodes: ['c', 'd', 'e', 'f', 'g', 'd']})
                ]);

                const result = Rapid.actionOrthogonalize('-', viewport).disabled(graph);
                assert.equal(result, false);
            });
        });


        describe('vertex-only', () => {
            it('returns "square_enough" for a vertex in a perfect quad', () => {
                //    d ---- c
                //           |
                //    a ---- b
                const graph = new Rapid.Graph([
                    Rapid.osmNode({id: 'a', loc: [0, 0]}),
                    Rapid.osmNode({id: 'b', loc: [2, 0]}),
                    Rapid.osmNode({id: 'c', loc: [2, 2]}),
                    Rapid.osmNode({id: 'd', loc: [0, 2]}),
                    Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd']})
                ]);

                const result = Rapid.actionOrthogonalize('-', viewport, 'b').disabled(graph);
                assert.equal(result, 'square_enough');
            });


            it('returns false for a vertex in an unsquared quad', () => {
                //    d --- c
                //          |
                //    a ---  b
                const graph = new Rapid.Graph([
                    Rapid.osmNode({id: 'a', loc: [0, 0]}),
                    Rapid.osmNode({id: 'b', loc: [2.1, 0]}),
                    Rapid.osmNode({id: 'c', loc: [2, 2]}),
                    Rapid.osmNode({id: 'd', loc: [0, 2]}),
                    Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd']})
                ]);

                const result = Rapid.actionOrthogonalize('-', viewport, 'b').disabled(graph);
                assert.equal(result, false);
            });


            it('returns false for a vertex in an unsquared 3-point path', () => {
                //    a
                //    |
                //    |
                //     b - c
                const graph = new Rapid.Graph([
                    Rapid.osmNode({id: 'a', loc: [0, 3]}),
                    Rapid.osmNode({id: 'b', loc: [0, 0.1]}),
                    Rapid.osmNode({id: 'c', loc: [3, 0]}),
                    Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c']})
                ]);

                const result = Rapid.actionOrthogonalize('-', viewport, 'b').disabled(graph);
                assert.equal(result, false);
            });


            it('returns "not_squarish" for vertex that can not be squared', () => {
                //      e -- d
                //     /      \
                //    f        c
                //            /
                //      a -- b
                const graph = new Rapid.Graph([
                    Rapid.osmNode({id: 'a', loc: [1, 0]}),
                    Rapid.osmNode({id: 'b', loc: [3, 0]}),
                    Rapid.osmNode({id: 'c', loc: [4, 2]}),
                    Rapid.osmNode({id: 'd', loc: [3, 4]}),
                    Rapid.osmNode({id: 'e', loc: [1, 4]}),
                    Rapid.osmNode({id: 'f', loc: [0, 2]}),
                    Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd', 'e', 'f']})
                ]);

                const result = Rapid.actionOrthogonalize('-', viewport, 'b').disabled(graph);
                assert.equal(result, 'not_squarish');
            });
        });
    });


    describe('transitions', () => {
        it('is transitionable', () => {
            assert.equal(Rapid.actionOrthogonalize().transitionable, true);
        });
        //  for all of these:
        //
        //     f ------------ e
        //     |              |
        //     a -- b -- c -- d
        it('orthogonalize at t = 0', () => {
            const graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [0, 0]}),
                Rapid.osmNode({id: 'b', loc: [1, 0.01], tags: {foo: 'bar'}}),
                Rapid.osmNode({id: 'c', loc: [2, -0.01]}),
                Rapid.osmNode({id: 'd', loc: [3, 0]}),
                Rapid.osmNode({id: 'e', loc: [3, 1]}),
                Rapid.osmNode({id: 'f', loc: [0, 1]}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd', 'e', 'f', 'a']})
            ]);

            const result = Rapid.actionOrthogonalize('-', viewport)(graph, 0);
            assert.deepEqual(result.entity('-').nodes, ['a', 'b', 'c', 'd', 'e', 'f', 'a']);
            assert.ok(Math.abs(result.entity('b').loc[0] - 1) < 1e-6);
            assert.ok(Math.abs(result.entity('b').loc[1] - 0.01) < 1e-6);
            assert.ok(Math.abs(result.entity('c').loc[0] - 2) < 1e-6);
            assert.ok(Math.abs(result.entity('c').loc[1] + 0.01) < 1e-6);
        });


        it('orthogonalize at t = 0.5', () => {
            const graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [0, 0]}),
                Rapid.osmNode({id: 'b', loc: [1, 0.01], tags: {foo: 'bar'}}),
                Rapid.osmNode({id: 'c', loc: [2, -0.01]}),
                Rapid.osmNode({id: 'd', loc: [3, 0]}),
                Rapid.osmNode({id: 'e', loc: [3, 1]}),
                Rapid.osmNode({id: 'f', loc: [0, 1]}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd', 'e', 'f', 'a']})
            ]);

            const result = Rapid.actionOrthogonalize('-', viewport)(graph, 0.5);
            assert.deepEqual(result.entity('-').nodes, ['a', 'b', 'c', 'd', 'e', 'f', 'a']);
            assert.ok(Math.abs(result.entity('b').loc[0] - 1) < 1e-3);
            assert.ok(Math.abs(result.entity('b').loc[1] - 0.005) < 1e-3);
            assert.ok(Math.abs(result.entity('c').loc[0] - 2) < 1e-3);
            assert.ok(Math.abs(result.entity('c').loc[1] + 0.005) < 1e-3);
        });


        it('orthogonalize at t = 1', () => {
            const graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [0, 0]}),
                Rapid.osmNode({id: 'b', loc: [1, 0.01], tags: {foo: 'bar'}}),
                Rapid.osmNode({id: 'c', loc: [2, -0.01]}),
                Rapid.osmNode({id: 'd', loc: [3, 0]}),
                Rapid.osmNode({id: 'e', loc: [3, 1]}),
                Rapid.osmNode({id: 'f', loc: [0, 1]}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd', 'e', 'f', 'a']})
            ]);

            const result = Rapid.actionOrthogonalize('-', viewport)(graph, 1);
            assert.deepEqual(result.entity('-').nodes, ['a', 'b', 'd', 'e', 'f', 'a']);
            assert.ok(Math.abs(result.entity('b').loc[0] - 1) < 2e-3);
            assert.ok(Math.abs(result.entity('b').loc[1]) < 2e-3);
            assert.equal(result.hasEntity('c'), undefined);
        });
    });
});
