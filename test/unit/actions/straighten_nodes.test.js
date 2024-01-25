import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';

describe('actionStraightenNodes', () => {
    const projection = {
        project: function (val) { return val; },
        invert: function (val) { return val; }
    };

    it('returns falsy for ways with internal nodes near centerline', () => {
        const graph = new Rapid.Graph([
            Rapid.osmNode({id: 'a', loc: [0, 0]}),
            Rapid.osmNode({id: 'b', loc: [1, 0.01]}),
            Rapid.osmNode({id: 'c', loc: [2, 0]}),
            Rapid.osmNode({id: 'd', loc: [3, 0]}),
            Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd']})
        ]);
        assert.ok(!Rapid.actionStraightenWay(['-'], projection).disabled(graph));
    });

    it('returns \'too_bendy\' for ways with internal nodes far off centerline', () => {
        const graph = new Rapid.Graph([
            Rapid.osmNode({id: 'a', loc: [0, 0]}),
            Rapid.osmNode({id: 'b', loc: [1, 1]}),
            Rapid.osmNode({id: 'c', loc: [2, 0]}),
            Rapid.osmNode({id: 'd', loc: [3, 0]}),
            Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd']})
        ]);
        assert.strictEqual(Rapid.actionStraightenWay(['-'], projection).disabled(graph), 'too_bendy');
    });

    it('returns \'too_bendy\' for ways with coincident start/end nodes', () => {
        const graph = new Rapid.Graph([
            Rapid.osmNode({id: 'a', loc: [0, 0]}),
            Rapid.osmNode({id: 'b', loc: [1, 0]}),
            Rapid.osmNode({id: 'c', loc: [2, 0]}),
            Rapid.osmNode({id: 'd', loc: [0, 0]}),
            Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd']})
        ]);
        assert.strictEqual(Rapid.actionStraightenWay(['-'], projection).disabled(graph), 'too_bendy');
    });

    it('deletes empty nodes', () => {
        const graph = new Rapid.Graph([
            Rapid.osmNode({id: 'a', loc: [0, 0]}),
            Rapid.osmNode({id: 'b', loc: [1, 0.01], tags: {}}),
            Rapid.osmNode({id: 'c', loc: [2, 0]}),
            Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c']})
        ]);

        const result = Rapid.actionStraightenWay(['-'], projection)(graph);
        assert.deepStrictEqual(result.entity('-').nodes, ['a', 'c']);
        assert.strictEqual(result.hasEntity('b'), undefined);
    });

    it('does not delete tagged nodes', () => {
        const graph = new Rapid.Graph([
            Rapid.osmNode({id: 'a', loc: [0, 0]}),
            Rapid.osmNode({id: 'b', loc: [1, 0.01], tags: {foo: 'bar'}}),
            Rapid.osmNode({id: 'c', loc: [2, 0]}),
            Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c']})
        ]);

        const result = Rapid.actionStraightenWay(['-'], projection)(graph);
        assert.deepStrictEqual(result.entity('-').nodes, ['a', 'b', 'c']);
        assert.strictEqual(result.entity('b').loc[0], 1);
        assert.strictEqual(result.entity('b').loc[1], 0);
    });

    describe('transitions', () => {
        it('is transitionable', () => {
            assert.strictEqual(Rapid.actionStraightenWay().transitionable, true);
        });

        it('straighten at t = 0', () => {
            const graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [0, -1]}),
                Rapid.osmNode({id: 'b', loc: [5, 1], tags: {foo: 'bar'}}),
                Rapid.osmNode({id: 'c', loc: [10, -1]}),  // untagged
                Rapid.osmNode({id: 'd', loc: [15, 1]})
            ]);

            const result = Rapid.actionStraightenNodes(['a','b','c','d'], projection)(graph, 0);
            assert.deepStrictEqual(result.entity('a').loc, [0, -1]);
            assert.deepStrictEqual(result.entity('b').loc, [5, 1]);
            assert.deepStrictEqual(result.entity('c').loc, [10, -1]);
            assert.deepStrictEqual(result.entity('d').loc, [15, 1]);
        });

        it('straighten at t = 0.5', () => {
            const graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [0, -1]}),
                Rapid.osmNode({id: 'b', loc: [5, 1], tags: {foo: 'bar'}}),
                Rapid.osmNode({id: 'c', loc: [10, -1]}),  // untagged
                Rapid.osmNode({id: 'd', loc: [15, 1]})
            ]);

            const result = Rapid.actionStraightenNodes(['a','b','c','d'], projection)(graph, 0.5);
            assert.deepStrictEqual(result.entity('a').loc, [0, -0.5]);
            assert.deepStrictEqual(result.entity('b').loc, [5, 0.5]);
            assert.deepStrictEqual(result.entity('c').loc, [10, -0.5]);
            assert.deepStrictEqual(result.entity('d').loc, [15, 0.5]);
        });

        it('straighten at t = 1', () => {
            const graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [0, -1]}),
                Rapid.osmNode({id: 'b', loc: [5, 1], tags: {foo: 'bar'}}),
                Rapid.osmNode({id: 'c', loc: [10, -1]}),  // untagged
                Rapid.osmNode({id: 'd', loc: [15, 1]})
            ]);

            const result = Rapid.actionStraightenNodes(['a','b','c','d'], projection)(graph, 1);
            assert.deepStrictEqual(result.entity('a').loc, [0, 0]);
            assert.deepStrictEqual(result.entity('b').loc, [5, 0]);
            assert.deepStrictEqual(result.entity('c').loc, [10, 0]);
            assert.deepStrictEqual(result.entity('d').loc, [15, 0]);
        });
    });
});