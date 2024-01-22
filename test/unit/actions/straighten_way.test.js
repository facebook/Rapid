import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';

test('actionStraightenWay', async t => {
    var projection = new Rapid.sdk.Projection();

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

    await t.test('does not delete nodes connected to other ways', () => {
        var graph = new Rapid.Graph([
            Rapid.osmNode({id: 'a', loc: [0, 0]}),
            Rapid.osmNode({id: 'b', loc: [1, 0.01]}),
            Rapid.osmNode({id: 'c', loc: [2, 0]}),
            Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c']}),
            Rapid.osmWay({id: '=', nodes: ['b']})
        ]);

        const result = Rapid.actionStraightenWay(['-'], projection)(graph);
        assert.deepStrictEqual(result.entity('-').nodes, ['a', 'b', 'c']);
        assert.strictEqual(result.entity('b').loc[0], 1);
        assert.strictEqual(result.entity('b').loc[1], 0);
    });

    await t.test('straightens multiple, connected ways', () => {
        var graph = new Rapid.Graph([
            Rapid.osmNode({id: 'a', loc: [0, 0]}),
            Rapid.osmNode({id: 'b', loc: [1, 0.01], tags: {foo: 'bar'}}),
            Rapid.osmNode({id: 'c', loc: [2, -0.01]}),
            Rapid.osmNode({id: 'd', loc: [3, 0]}),
            Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd']}),

            Rapid.osmNode({id: 'e', loc: [4, 0]}),
            Rapid.osmNode({id: 'f', loc: [5, 0.01], tags: {foo: 'bar'}}),
            Rapid.osmNode({id: 'g', loc: [6, -0.01]}),
            Rapid.osmNode({id: 'h', loc: [7, 0]}),
            Rapid.osmWay({id: '--', nodes: ['d', 'e', 'f', 'g', 'h']})
        ]);

        const result = Rapid.actionStraightenWay(['-', '--'], projection)(graph);
        assert.deepStrictEqual(result.entity('-').nodes, ['a', 'b', 'd']);
        assert.deepStrictEqual(result.entity('--').nodes, ['d', 'f', 'h']);
        assert.strictEqual(result.entity('f').loc[0], 5);
        assert.strictEqual(result.entity('f').loc[1], 0);
        assert.strictEqual(result.hasEntity('g'), undefined);
    });

    await t.test('straightens multiple, connected ways going in different directions', () => {
        var graph = new Rapid.Graph([
            Rapid.osmNode({id: 'a', loc: [0, 0]}),
            Rapid.osmNode({id: 'b', loc: [1, 0.01], tags: {foo: 'bar'}}),
            Rapid.osmNode({id: 'c', loc: [2, -0.01]}),
            Rapid.osmNode({id: 'd', loc: [3, 0]}),
            Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd']}),

            Rapid.osmNode({id: 'e', loc: [4, 0]}),
            Rapid.osmNode({id: 'f', loc: [5, 0.01], tags: {foo: 'bar'}}),
            Rapid.osmNode({id: 'g', loc: [6, -0.01]}),
            Rapid.osmNode({id: 'h', loc: [7, 0]}),
            Rapid.osmWay({id: '--', nodes: ['h', 'g', 'f', 'e', 'd']})
        ]);

        const result = Rapid.actionStraightenWay(['-', '--'], projection)(graph);
        assert.deepStrictEqual(result.entity('-').nodes, ['a', 'b', 'd']);
        assert.deepStrictEqual(result.entity('--').nodes, ['h', 'f', 'd']);
        assert.strictEqual(result.entity('f').loc[0], 5);
        assert.strictEqual(result.entity('f').loc[1], 0);
        assert.strictEqual(result.hasEntity('g'), undefined);
    });

    await t.test('transitions', async t => {
        await t.test('is transitionable', () => {
            assert.strictEqual(Rapid.actionStraightenWay().transitionable, true);
        });

        await t.test('straighten at t = 0', () => {
            var graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [0, 0]}),
                Rapid.osmNode({id: 'b', loc: [1, 0.01], tags: {foo: 'bar'}}),
                Rapid.osmNode({id: 'c', loc: [2, -0.01]}),
                Rapid.osmNode({id: 'd', loc: [3, 0]}),
                Rapid.osmWay({id: '-', nodes:                ['a', 'b', 'c', 'd']})
            ]);

            const result = Rapid.actionStraightenWay(['-'], projection)(graph, 0);
            assert.deepStrictEqual(result.entity('-').nodes, ['a', 'b', 'c', 'd']);
            assert.strictEqual(result.entity('b').loc[0], 1);
            assert.strictEqual(result.entity('b').loc[1], 0.01);
            assert.strictEqual(result.entity('c').loc[0], 2);
            assert.strictEqual(result.entity('c').loc[1], -0.01);
        });

        await t.test('straighten at t = 0.5', () => {
            var graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [0, 0]}),
                Rapid.osmNode({id: 'b', loc: [1, 0.01], tags: {foo: 'bar'}}),
                Rapid.osmNode({id: 'c', loc: [2, -0.01]}),
                Rapid.osmNode({id: 'd', loc: [3, 0]}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd']})
            ]);

            const result = Rapid.actionStraightenWay(['-'], projection)(graph, 0.5);
            assert.deepStrictEqual(result.entity('-').nodes, ['a', 'b', 'c', 'd']);
            assert.strictEqual(result.entity('b').loc[0], 1);
            assert.strictEqual(result.entity('b').loc[1], 0.005);
            assert.strictEqual(result.entity('c').loc[0], 2);
            assert.strictEqual(result.entity('c').loc[1], -0.005);
        });

        await t.test('straighten at t = 1', () => {
            var graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [0, 0]}),
                Rapid.osmNode({id: 'b', loc: [1, 0.01], tags: {foo: 'bar'}}),
                Rapid.osmNode({id: 'c', loc: [2, -0.01]}),
                Rapid.osmNode({id: 'd', loc: [3, 0]}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd']})
            ]);

            const result = Rapid.actionStraightenWay(['-'], projection)(graph, 1);
            assert.deepStrictEqual(result.entity('-').nodes, ['a', 'b', 'd']);
            assert.strictEqual(result.entity('b').loc[0], 1);
            assert.strictEqual(result.entity('b').loc[1], 0);
            assert.strictEqual(result.hasEntity('c'), undefined);
        });
    });
});