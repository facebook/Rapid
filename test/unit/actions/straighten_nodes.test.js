import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';

test('actionStraightenNodes', async t => {
    var projection = {
        project: function (val) { return val; },
        invert: function (val) { return val; }
    };

    await t.test('returns falsy for ways with internal nodes near centerline', () => {
        var graph = new Rapid.Graph([
            Rapid.osmNode({id: 'a', loc: [0, 0]}),
            Rapid.osmNode({id: 'b', loc: [1, 0.01]}),
            Rapid.osmNode({id: 'c', loc: [2, 0]}),
            Rapid.osmNode({id: 'd', loc: [3, 0]}),
            Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd']})
        ]);
        assert.ok(!Rapid.actionStraightenWay(['-'], projection).disabled(graph));
    });

    await t.test('returns \'too_bendy\' for ways with internal nodes far off centerline', () => {
        var graph = new Rapid.Graph([
            Rapid.osmNode({id: 'a', loc: [0, 0]}),
            Rapid.osmNode({id: 'b', loc: [1, 1]}),
            Rapid.osmNode({id: 'c', loc: [2, 0]}),
            Rapid.osmNode({id: 'd', loc: [3, 0]}),
            Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd']})
        ]);
        assert.strictEqual(Rapid.actionStraightenWay(['-'], projection).disabled(graph), 'too_bendy');
    });

    await t.test('returns \'too_bendy\' for ways with coincident start/end nodes', () => {
        var graph = new Rapid.Graph([
            Rapid.osmNode({id: 'a', loc: [0, 0]}),
            Rapid.osmNode({id: 'b', loc: [1, 0]}),
            Rapid.osmNode({id: 'c', loc: [2, 0]}),
            Rapid.osmNode({id: 'd', loc: [0, 0]}),
            Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd']})
        ]);
        assert.strictEqual(Rapid.actionStraightenWay(['-'], projection).disabled(graph), 'too_bendy');
    });

    await t.test('deletes empty nodes', () => {
        var graph = new Rapid.Graph([
            Rapid.osmNode({id: 'a', loc: [0, 0]}),
            Rapid.osmNode({id: 'b', loc: [1, 0.01], tags: {}}),
            Rapid.osmNode({id: 'c', loc: [2, 0]}),
            Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c']})
        ]);

        const result = Rapid.actionStraightenWay(['-'], projection)(graph);
        assert.deepStrictEqual(result.entity('-').nodes, ['a', 'c']);
        assert.strictEqual(result.hasEntity('b'), undefined);
    });

    await t.test('does not delete tagged nodes', () => {
        var graph = new Rapid.Graph([
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

    await t.test('transitions', async t => {
        await t.test('is transitionable', () => {
            assert.strictEqual(Rapid.actionStraightenWay().transitionable, true);
        });

        await t.test('straighten at t = 0', () => {
            var graph = new Rapid.Graph([
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

        await t.test('straighten at t = 0.5', () => {
            var graph = new Rapid.Graph([
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

        await t.test('straighten at t = 1', () => {
            var graph = new Rapid.Graph([
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