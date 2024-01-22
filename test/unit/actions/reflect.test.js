import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';

test('actionReflect', async t => {
    var projection = new Rapid.sdk.Projection();
    await t.test('does not create or remove nodes', () => {
        var graph = new Rapid.Graph([
            Rapid.osmNode({id: 'a', loc: [0, 0]}),
            Rapid.osmNode({id: 'b', loc: [4, 0]}),
            Rapid.osmNode({id: 'c', loc: [4, 2]}),
            Rapid.osmNode({id: 'd', loc: [1, 2]}),
            Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd', 'a']})
        ]);
        const result = Rapid.actionReflect(['-'], projection)(graph);
        assert.deepEqual(result.entity('-').nodes.length, 5);
    });

    await t.test('reflects across long axis', () => {
        //    d -- c      a ---- b
        //   /     |  ->   \     |
        //  a ---- b        d -- c
        var graph = new Rapid.Graph([
            Rapid.osmNode({id: 'a', loc: [0, 0]}),
            Rapid.osmNode({id: 'b', loc: [4, 0]}),
            Rapid.osmNode({id: 'c', loc: [4, 2]}),
            Rapid.osmNode({id: 'd', loc: [1, 2]}),
            Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd', 'a']})
        ]);
        const result = Rapid.actionReflect(['-'], projection)(graph);
        var epsilon = 1e-9;
        assert.ok(Math.abs(result.entity('a').loc[0] - 0) < epsilon);
        assert.ok(Math.abs(result.entity('a').loc[1] - 2) < epsilon);
        assert.ok(Math.abs(result.entity('b').loc[0] - 4) < epsilon);
        assert.ok(Math.abs(result.entity('b').loc[1] - 2) < epsilon);
        assert.ok(Math.abs(result.entity('c').loc[0] - 4) < epsilon);
        assert.ok(Math.abs(result.entity('c').loc[1]) < epsilon);
        assert.ok(Math.abs(result.entity('d').loc[0] - 1) < epsilon);
        assert.ok(Math.abs(result.entity('d').loc[1]) < epsilon);
    });

    await t.test('reflects across long axis', () => {
        //    d -- c      a ---- b
        //   /     |  ->   \     |
        //  a ---- b        d -- c
        var graph = new Rapid.Graph([
            Rapid.osmNode({id: 'a', loc: [0, 0]}),
            Rapid.osmNode({id: 'b', loc: [4, 0]}),
            Rapid.osmNode({id: 'c', loc: [4, 2]}),
            Rapid.osmNode({id: 'd', loc: [1, 2]}),
            Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd', 'a']})
        ]);
        const result = Rapid.actionReflect(['-'], projection)(graph);
        var epsilon = 1e-6;
        assert.ok(Math.abs(result.entity('a').loc[0] - 0) < epsilon);
        assert.ok(Math.abs(result.entity('a').loc[1] - 2) < epsilon);
        assert.ok(Math.abs(result.entity('b').loc[0] - 4) < epsilon);
        assert.ok(Math.abs(result.entity('b').loc[1] - 2) < epsilon);
        assert.ok(Math.abs(result.entity('c').loc[0] - 4) < epsilon);
        assert.ok(Math.abs(result.entity('c').loc[1]) < epsilon);
        assert.ok(Math.abs(result.entity('d').loc[0] - 1) < epsilon);
        assert.ok(Math.abs(result.entity('d').loc[1]) < epsilon);
    });

    await t.test('reflects across short axis', () => {
        //    d -- c      c -- d
        //   /     |  ->  |     \
        //  a ---- b      b ---- a
        var graph = new Rapid.Graph([
            Rapid.osmNode({id: 'a', loc: [0, 0]}),
            Rapid.osmNode({id: 'b', loc: [4, 0]}),
            Rapid.osmNode({id: 'c', loc: [4, 2]}),
            Rapid.osmNode({id: 'd', loc: [1, 2]}),
            Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd', 'a']})
        ]);
        const result = Rapid.actionReflect(['-'], projection).useLongAxis(false)(graph);
        var epsilon = 1e-6;
        assert.ok(Math.abs(result.entity('a').loc[0] - 4) < epsilon);
        assert.ok(Math.abs(result.entity('a').loc[1]) < epsilon);
        assert.ok(Math.abs(result.entity('b').loc[0]) < epsilon);
        assert.ok(Math.abs(result.entity('b').loc[1]) < epsilon);
        assert.ok(Math.abs(result.entity('c').loc[0]) < epsilon);
        assert.ok(Math.abs(result.entity('c').loc[1] - 2) < epsilon);
        assert.ok(Math.abs(result.entity('d').loc[0] - 3) < epsilon);
        assert.ok(Math.abs(result.entity('d').loc[1] - 2) < epsilon);
    });

    await t.test('transitions', async t => {
        await t.test('is transitionable', () => {
            assert.equal(Rapid.actionReflect().transitionable, true);
        });

        await t.test('reflect long at t = 0', () => {
            var graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [0, 0]}),
                Rapid.osmNode({id: 'b', loc: [4, 0]}),
                Rapid.osmNode({id: 'c', loc: [4, 2]}),
                Rapid.osmNode({id: 'd', loc: [1, 2]}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd', 'a']})
            ]);
            const result = Rapid.actionReflect(['-'], projection)(graph, 0);
            var epsilon = 1e-6;
            assert.ok(Math.abs(result.entity('a').loc[0]) < epsilon);
            assert.ok(Math.abs(result.entity('a').loc[1]) < epsilon);
            assert.ok(Math.abs(result.entity('b').loc[0] - 4) < epsilon);
            assert.ok(Math.abs(result.entity('b').loc[1]) < epsilon);
            assert.ok(Math.abs(result.entity('c').loc[0] - 4) < epsilon);
            assert.ok(Math.abs(result.entity('c').loc[1] - 2) < epsilon);
            assert.ok(Math.abs(result.entity('d').loc[0] - 1) < epsilon);
            assert.ok(Math.abs(result.entity('d').loc[1] - 2) < epsilon);
        });

        await t.test('reflect long at t = 0.5', () => {
            var graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [0, 0]}),
                Rapid.osmNode({id: 'b', loc: [4, 0]}),
                Rapid.osmNode({id: 'c', loc: [4, 2]}),
                Rapid.osmNode({id: 'd', loc: [1, 2]}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd', 'a']})
            ]);
            const result = Rapid.actionReflect(['-'], projection)(graph, 0.5);
            var epsilon = 1e-6;
            assert.ok(Math.abs(result.entity('a').loc[0]) < epsilon);
            assert.ok(Math.abs(result.entity('a').loc[1] - 1) < epsilon);
            assert.ok(Math.abs(result.entity('b').loc[0] - 4) < epsilon);
            assert.ok(Math.abs(result.entity('b').loc[1] - 1) < epsilon);
            assert.ok(Math.abs(result.entity('c').loc[0] - 4) < epsilon);
            assert.ok(Math.abs(result.entity('c').loc[1] - 1) < epsilon);
            assert.ok(Math.abs(result.entity('d').loc[0] - 1) < epsilon);
            assert.ok(Math.abs(result.entity('d').loc[1] - 1) < epsilon);
        });

        await t.test('reflect short at t = 1', () => {
            var graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [0, 0]}),
                Rapid.osmNode({id: 'b', loc: [4, 0]}),
                Rapid.osmNode({id: 'c', loc: [4, 2]}),
                Rapid.osmNode({id: 'd', loc: [1, 2]}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd', 'a']})
            ]);
            const result = Rapid.actionReflect(['-'], projection).useLongAxis(false)(graph, 1);
            var epsilon = 1e-6;
            assert.ok(Math.abs(result.entity('a').loc[0] - 4) < epsilon);
            assert.ok(Math.abs(result.entity('a').loc[1]) < epsilon);
            assert.ok(Math.abs(result.entity('b').loc[0]) < epsilon);
            assert.ok(Math.abs(result.entity('b').loc[1]) < epsilon);
            assert.ok(Math.abs(result.entity('c').loc[0]) < epsilon);
            assert.ok(Math.abs(result.entity('c').loc[1] - 2) < epsilon);
            assert.ok(Math.abs(result.entity('d').loc[0] - 3) < epsilon);
            assert.ok(Math.abs(result.entity('d').loc[1] - 2) < epsilon);
        });
    });
});
