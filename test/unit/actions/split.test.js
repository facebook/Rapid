import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';

test('actionSplit', async t => {
    await t.test('#disabled', async t => {
        await t.test('returns falsy for a non-end node of a single way', () => {
            //
            //  a ---> b ---> c         split at 'b' not disabled
            //
            var graph = new Rapid.Graph([
                Rapid.osmNode({ id: 'a', loc: [0, 0] }),
                Rapid.osmNode({ id: 'b', loc: [1, 0] }),
                Rapid.osmNode({ id: 'c', loc: [2, 0] }),
                Rapid.osmWay({ id: '-', nodes: ['a', 'b', 'c'] })
            ]);

            assert.strictEqual(!Rapid.actionSplit('b').disabled(graph), true);
        });

        await t.test('returns falsy for an intersection of two ways', () => {
            //
            //         c
            //         |
            //  a ---> * ---> b         split at '*' not disabled
            //         |
            //         d
            //
            var graph = new Rapid.Graph([
                Rapid.osmNode({ id: 'a', loc: [-1, 0] }),
                Rapid.osmNode({ id: 'b', loc: [1, 0] }),
                Rapid.osmNode({ id: 'c', loc: [0, 1] }),
                Rapid.osmNode({ id: 'd', loc: [0, -1] }),
                Rapid.osmNode({ id: '*', loc: [0, 0] }),
                Rapid.osmWay({ id: '-', nodes: ['a', '*', 'b'] }),
                Rapid.osmWay({ id: '|', nodes: ['c', '*', 'd'] })
            ]);

            assert.strictEqual(!Rapid.actionSplit('*').disabled(graph), true);
        });

        await t.test('returns falsy for an intersection of two ways with parent way specified', () => {
            //
            //         c
            //         |
            //  a ---> * ---> b         split '-' at '*' not disabled
            //         |
            //         d
            //
            var graph = new Rapid.Graph([
                Rapid.osmNode({ id: 'a', loc: [-1, 0] }),
                Rapid.osmNode({ id: 'b', loc: [1, 0] }),
                Rapid.osmNode({ id: 'c', loc: [0, 1] }),
                Rapid.osmNode({ id: 'd', loc: [0, -1] }),
                Rapid.osmNode({ id: '*', loc: [0, 0] }),
                Rapid.osmWay({ id: '-', nodes: ['a', '*', 'b'] }),
                Rapid.osmWay({ id: '|', nodes: ['c', '*', 'd'] })
            ]);

            assert.strictEqual(!Rapid.actionSplit('*').limitWays(['-']).disabled(graph), true);
        });

        await t.test('returns falsy for a self-intersection', () => {
            //
            //  b -- c
            //  |   /
            //  |  /                    split '-' at 'a' not disabled
            //  | /
            //  a -- b
            //
            var graph = new Rapid.Graph([
                Rapid.osmNode({ id: 'a', loc: [0, 0] }),
                Rapid.osmNode({ id: 'b', loc: [0, 2] }),
                Rapid.osmNode({ id: 'c', loc: [1, 2] }),
                Rapid.osmNode({ id: 'd', loc: [1, 0] }),
                Rapid.osmWay({ id: '-', nodes: ['a', 'b', 'c', 'a', 'd'] })
            ]);

            assert.strictEqual(!Rapid.actionSplit('a').disabled(graph), true);
        });

        await t.test('returns \'not_eligible\' for the first node of a single way', () => {
            //
            //  a ---> b                split at 'a' disabled - 'not eligible'
            //
            var graph = new Rapid.Graph([
                Rapid.osmNode({ id: 'a', loc: [0, 0] }),
                Rapid.osmNode({ id: 'b', loc: [1, 0] }),
                Rapid.osmWay({ id: '-', nodes: ['a', 'b'] })
            ]);
            assert.strictEqual(Rapid.actionSplit('a').disabled(graph), 'not_eligible');
        });

        await t.test('returns \'not_eligible\' for the last node of a single way', () => {
            //
            //  a ---> b                split at 'b' disabled - 'not eligible'
            //
            var graph = new Rapid.Graph([
                Rapid.osmNode({ id: 'a', loc: [0, 0] }),
                Rapid.osmNode({ id: 'b', loc: [1, 0] }),
                Rapid.osmWay({ id: '-', nodes: ['a', 'b'] })
            ]);
            assert.strictEqual(Rapid.actionSplit('b').disabled(graph), 'not_eligible');
        });

        await t.test('returns \'not_eligible\' for an intersection of two ways with non-parent way specified', () => {
            //
            //         c
            //         |
            //  a ---> * ---> b         split '-' and '=' at '*' disabled - 'not eligible'
            //         |                (there is no '=' here)
            //         d
            //
            var graph = new Rapid.Graph([
                Rapid.osmNode({ id: 'a', loc: [-1, 0] }),
                Rapid.osmNode({ id: 'b', loc: [1, 0] }),
                Rapid.osmNode({ id: 'c', loc: [0, 1] }),
                Rapid.osmNode({ id: 'd', loc: [0, -1] }),
                Rapid.osmNode({ id: '*', loc: [0, 0] }),
                Rapid.osmWay({ id: '-', nodes: ['a', '*', 'b'] }),
                Rapid.osmWay({ id: '|', nodes: ['c', '*', 'd'] })
            ]);

            assert.strictEqual(Rapid.actionSplit('*').limitWays(['-', '=']).disabled(graph), 'not_eligible');
        });
    });
    await t.test('ways', async t => {

    await t.test('creates a new way with the appropriate nodes', () => {
        var graph = new Rapid.Graph([
            Rapid.osmNode({ id: 'a', loc: [0, 0] }),
            Rapid.osmNode({ id: 'b', loc: [1, 0] }),
            Rapid.osmNode({ id: 'c', loc: [2, 0] }),
            Rapid.osmWay({ id: '-', nodes: ['a', 'b', 'c'] })
        ]);

        const result = Rapid.actionSplit('b', ['='])(graph);

        assert.deepEqual(result.entity('-').nodes, ['a', 'b']);
        assert.deepEqual(result.entity('=').nodes, ['b', 'c']);
    });

    await t.test('copies tags to the new way', () => {
        const tags = { highway: 'residential' };
        var graph = new Rapid.Graph([
            Rapid.osmNode({ id: 'a', loc: [0, 0] }),
            Rapid.osmNode({ id: 'b', loc: [1, 0] }),
            Rapid.osmNode({ id: 'c', loc: [2, 0] }),
            Rapid.osmWay({ id: '-', nodes: ['a', 'b', 'c'], tags: tags })
        ]);

        const result = Rapid.actionSplit('b', ['='])(graph);

        assert.equal(result.entity('-').tags, tags);
        assert.equal(result.entity('=').tags, tags);
    });

    await t.test('splits a way at a T-junction', () => {
        var graph = new Rapid.Graph([
            Rapid.osmNode({ id: 'a', loc: [-1, 0] }),
            Rapid.osmNode({ id: 'b', loc: [0, 0] }),
            Rapid.osmNode({ id: 'c', loc: [1, 0] }),
            Rapid.osmNode({ id: 'd', loc: [0, -1] }),
            Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c']}),
            Rapid.osmWay({id: '|', nodes: ['d', 'b']})
        ]);

        const result = Rapid.actionSplit('b', ['='])(graph);

        assert.deepEqual(result.entity('-').nodes, ['a', 'b']);
        assert.deepEqual(result.entity('=').nodes, ['b', 'c']);
        assert.deepEqual(result.entity('|').nodes, ['d', 'b']);
    });

    await t.test('splits multiple ways at an intersection', () => {
        var graph = new Rapid.Graph([
            Rapid.osmNode({ id: 'a', loc: [-1, 0] }),
            Rapid.osmNode({ id: 'b', loc: [1, 0] }),
            Rapid.osmNode({ id: 'c', loc: [0, 1] }),
            Rapid.osmNode({ id: 'd', loc: [0, -1] }),
            Rapid.osmNode({ id: '*', loc: [0, 0] }),
            Rapid.osmWay({ id: '-', nodes: ['a', '*', 'b'] }),
            Rapid.osmWay({ id: '|', nodes: ['c', '*', 'd'] })
        ]);

        const result = Rapid.actionSplit('*', ['=', '¦'])(graph);

        assert.deepEqual(result.entity('-').nodes, ['a', '*']);
        assert.deepEqual(result.entity('=').nodes, ['*', 'b']);
        assert.deepEqual(result.entity('|').nodes, ['c', '*']);
        assert.deepEqual(result.entity('¦').nodes, ['*', 'd']);
    });

    await t.test('splits the specified ways at an intersection', () => {
        var graph = new Rapid.Graph([
            Rapid.osmNode({ id: 'a', loc: [-1, 0] }),
            Rapid.osmNode({ id: 'b', loc: [1, 0] }),
            Rapid.osmNode({ id: 'c', loc: [0, 1] }),
            Rapid.osmNode({ id: 'd', loc: [0, -1] }),
            Rapid.osmNode({ id: '*', loc: [0, 0] }),
            Rapid.osmWay({ id: '-', nodes: ['a', '*', 'b'] }),
            Rapid.osmWay({ id: '|', nodes: ['c', '*', 'd'] })
        ]);

        const g1 = Rapid.actionSplit('*', ['=']).limitWays(['-'])(graph);
        assert.deepEqual(g1.entity('-').nodes, ['a', '*']);
                assert.deepEqual(g1.entity('=').nodes, ['*', 'b']);
        assert.deepEqual(g1.entity('|').nodes, ['c', '*', 'd']);

        const g2 = Rapid.actionSplit('*', ['¦']).limitWays(['|'])(graph);
        assert.deepEqual(g2.entity('-').nodes, ['a', '*', 'b']);
        assert.deepEqual(g2.entity('|').nodes, ['c', '*']);
        assert.deepEqual(g2.entity('¦').nodes, ['*', 'd']);

        const g3 = Rapid.actionSplit('*', ['=', '¦']).limitWays(['-', '|'])(graph);
        assert.deepEqual(g3.entity('-').nodes, ['a', '*']);
        assert.deepEqual(g3.entity('=').nodes, ['*', 'b']);
        assert.deepEqual(g3.entity('|').nodes, ['c', '*']);
        assert.deepEqual(g3.entity('¦').nodes, ['*', 'd']);
    });

    await t.test('splits self-intersecting ways', () => {
        var graph = new Rapid.Graph([
            Rapid.osmNode({ id: 'a', loc: [0, 0] }),
            Rapid.osmNode({ id: 'b', loc: [0, 2] }),
            Rapid.osmNode({ id: 'c', loc: [-1, 0] }),
            Rapid.osmNode({ id: 'd', loc: [1, 0] }),
            Rapid.osmWay({ id: '-', nodes: ['a', 'b', 'c', 'a', 'd'] })
        ]);

        const result = Rapid.actionSplit('a', ['='])(graph);

        assert.deepEqual(result.entity('-').nodes, ['a', 'b', 'c', 'a']);
        assert.deepEqual(result.entity('=').nodes, ['a', 'd']);
    });

    await t.test('splits a closed way at the given point and its antipode', () => {
        var graph = new Rapid.Graph([
            Rapid.osmNode({ id: 'a', loc: [0, 1] }),
            Rapid.osmNode({ id: 'b', loc: [1, 1] }),
            Rapid.osmNode({ id: 'c', loc: [1, 0] }),
            Rapid.osmNode({ id: 'd', loc: [0, 0] }),
            Rapid.osmWay({ id: '-', nodes: ['a', 'b', 'c', 'd', 'a']})
        ]);

        const g1 = Rapid.actionSplit('a', ['='])(graph);
        assert.deepEqual(g1.entity('-').nodes, ['c', 'd', 'a']);
        assert.deepEqual(g1.entity('=').nodes, ['a', 'b', 'c']);

        const g2 = Rapid.actionSplit('b', ['='])(graph);
        assert.deepEqual(g2.entity('-').nodes, ['b', 'c', 'd']);
        assert.deepEqual(g2.entity('=').nodes, ['d', 'a', 'b']);

        const g3 = Rapid.actionSplit('c', ['='])(graph);
        assert.deepEqual(g3.entity('-').nodes, ['c', 'd', 'a']);
        assert.deepEqual(g3.entity('=').nodes, ['a', 'b', 'c']);

        const g4 = Rapid.actionSplit('d', ['='])(graph);
        assert.deepEqual(g4.entity('-').nodes, ['b', 'c', 'd']);
        assert.deepEqual(g4.entity('=').nodes, ['d', 'a', 'b']);
    });
});

    await t.test('relations', async t => {

        function members(graph) {
            return graph.entity('r').members.map(function (m) { return m.id; });
        }

         await t.test('handles incomplete relations', () => {
            //
            // Situation:
            //    a ---> b ---> c         split at 'b'
            //    Relation: ['~', '-']
            //
            // Expected result:
            //    a ---> b ===> c
            //    Relation: ['~', '-', '=']
            //
            var graph = new Rapid.Graph([
                Rapid.osmNode({ id: 'a', loc: [0, 0] }),
                Rapid.osmNode({ id: 'b', loc: [1, 0] }),
                Rapid.osmNode({ id: 'c', loc: [2, 0] }),
                Rapid.osmWay({ id: '-', nodes: ['a', 'b', 'c'] }),
                Rapid.osmRelation({id: 'r', members: [
                    { id: '~', type: 'way' },
                    { id: '-', type: 'way' }
                ]})
            ]);

            graph = Rapid.actionSplit('b', ['='])(graph);
            assert.deepEqual(members(graph), ['~', '-', '=']);
        });


    await t.test('member ordering', async t => {

     await t.test('adds the new way to parent relations (simple)', () => {
        //
        // Situation:
        //    a ---> b ---> c         split at 'b'
        //    Relation: ['-']
        //
        // Expected result:
        //    a ---> b ===> c
        //    Relation: ['-', '=']
        //
        var graph = new Rapid.Graph([
            Rapid.osmNode({ id: 'a', loc: [0, 0] }),
            Rapid.osmNode({ id: 'b', loc: [1, 0] }),
            Rapid.osmNode({ id: 'c', loc: [2, 0] }),
            Rapid.osmWay({ id: '-', nodes: ['a', 'b', 'c'] }),
            Rapid.osmRelation({id: 'r', members: [
                { id: '-', type: 'way', role: 'forward' }
            ]})
        ]);

        graph = Rapid.actionSplit('b', ['='])(graph);

        assert.deepEqual(graph.entity('r').members, [
            { id: '-', type: 'way', role: 'forward' },
            { id: '=', type: 'way', role: 'forward' }
        ]);
    });

        await t.test('adds the new way to parent relations (forward order)', () => {
        //
        // Situation:
        //    a ---> b ---> c ~~~> d        split at 'b'
        //    Relation: ['-', '~']
        //
        // Expected result:
        //    a ---> b ===> c ~~~> d
        //    Relation: ['-', '=', '~']
        //
        var graph = new Rapid.Graph([
            Rapid.osmNode({ id: 'a', loc: [0, 0] }),
            Rapid.osmNode({ id: 'b', loc: [1, 0] }),
            Rapid.osmNode({ id: 'c', loc: [2, 0] }),
            Rapid.osmNode({ id: 'd', loc: [3, 0] }),
            Rapid.osmWay({ id: '-', nodes: ['a', 'b', 'c'] }),
            Rapid.osmWay({ id: '~', nodes: ['c', 'd'] }),
            Rapid.osmRelation({id: 'r', members: [
                { id: '-', type: 'way' },
                { id: '~', type: 'way' }
            ]})
        ]);

        graph = Rapid.actionSplit('b', ['='])(graph);
        assert.deepEqual(members(graph), ['-', '=', '~']);
    });

    await t.test('adds the new way to parent relations (reverse order)', () => {
        //
        // Situation:
        //    a ---> b ---> c ~~~> d        split at 'b'
        //    Relation: ['~', '-']
        //
        // Expected result:
        //    a ---> b ===> c ~~~> d
        //    Relation: ['~', '=', '-']
        //
        var graph = new Rapid.Graph([
            Rapid.osmNode({ id: 'a', loc: [0, 0] }),
            Rapid.osmNode({ id: 'b', loc: [1, 0] }),
            Rapid.osmNode({ id: 'c', loc: [2, 0] }),
            Rapid.osmNode({ id: 'd', loc: [3, 0] }),
            Rapid.osmWay({ id: '-', nodes: ['a', 'b', 'c'] }),
            Rapid.osmWay({ id: '~', nodes: ['c', 'd'] }),
            Rapid.osmRelation({id: 'r', members: [
                { id: '~', type: 'way' },
                { id: '-', type: 'way' }
            ]})
        ]);

        graph = Rapid.actionSplit('b', ['='])(graph);
        assert.deepEqual(members(graph), ['~', '=', '-']);
    });

    await t.test('reorders members as node, way, relation (for Public Transport routing)', () => {
        var graph = new Rapid.Graph([
            Rapid.osmNode({ id: 'a', loc: [0, 0] }),
            Rapid.osmNode({ id: 'b', loc: [1, 0] }),
            Rapid.osmNode({ id: 'c', loc: [2, 0] }),
            Rapid.osmWay({ id: '-', nodes: ['a', 'b', 'c'] }),
            Rapid.osmRelation({id: 'r', members: [
                { id: 'n1', type: 'node', role: 'forward' },
                                { id: '-', type: 'way', role: 'forward' },
                { id: 'r1', type: 'relation', role: 'forward' },
                { id: 'n2', type: 'node', role: 'forward' }
            ]})
        ]);

        graph = Rapid.actionSplit('b', ['='])(graph);

        assert.deepEqual(graph.entity('r').members, [
            { id: 'n1', type: 'node', role: 'forward' },
            { id: 'n2', type: 'node', role: 'forward' },
            { id: '-', type: 'way', role: 'forward' },
            { id: '=', type: 'way', role: 'forward' },
            { id: 'r1', type: 'relation', role: 'forward'}
        ]);
    });
});

    await t.test('splitting out-and-back routes', async t => {

    await t.test('splits out-and-back1 route at b', () => {
        //
        // Situation:
        //    a ---> b ---> c ~~~> d                split at 'b'
        //    Relation: ['-', '~', '~', '-']
        //
        // Expected result:
        //    a ---> b ===> c ~~~> d
        //    Relation: ['-', '=', '~', '~', '=', '-']
        //
        var graph = new Rapid.Graph([
            Rapid.osmNode({ id: 'a', loc: [0, 0] }),
            Rapid.osmNode({ id: 'b', loc: [1, 0] }),
            Rapid.osmNode({ id: 'c', loc: [2, 0] }),
            Rapid.osmNode({ id: 'd', loc: [3, 0] }),
            Rapid.osmWay({ id: '-', nodes: ['a', 'b', 'c'] }),
            Rapid.osmWay({ id: '~', nodes: ['c', 'd'] }),
            Rapid.osmRelation({id: 'r', members: [
                { id: '-', type: 'way' },
                { id: '~', type: 'way' },
                { id: '~', type: 'way' },
                { id: '-', type: 'way' }
            ]})
        ]);

        graph = Rapid.actionSplit('b', ['='])(graph);
        assert.deepEqual(members(graph), ['-', '=', '~', '~', '=', '-']);
    });

    await t.test('splits out-and-back2 route at b', () => {
        //
        // Situation:
        //    a <--- b <--- c ~~~> d                split at 'b'
        //    Relation: ['-', '~', '~', '-']
        //
        // Expected result:
        //    a <=== b <--- c ~~~> d
        //    Relation: ['=', '-', '~', '~', '-', '=']
        //
        var graph = new Rapid.Graph([
            Rapid.osmNode({ id: 'a', loc: [0, 0] }),
            Rapid.osmNode({ id: 'b', loc: [1, 0] }),
            Rapid.osmNode({ id: 'c', loc: [2, 0] }),
            Rapid.osmNode({ id: 'd', loc: [3, 0] }),
            Rapid.osmWay({ id: '-', nodes: ['c', 'b', 'a'] }),
            Rapid.osmWay({ id: '~', nodes: ['c', 'd'] }),
            Rapid.osmRelation({id: 'r', members: [
                { id: '-', type: 'way' },
                { id: '~', type: 'way' },
                { id: '~', type: 'way' },
                { id: '-', type: 'way' }
            ]})
        ]);

        graph = Rapid.actionSplit('b', ['='])(graph);
        assert.deepEqual(members(graph), ['=', '-', '~', '~', '-', '=']);
    });

    await t.test('splits out-and-back3 route at b', () => {
        //
        // Situation:
        //    a ---> b ---> c <~~~ d                split at 'b'
        //    Relation: ['-', '~', '~', '-']
        //
        // Expected result:
        //    a ---> b ===> c <~~~ d
        //    Relation: ['-', '=', '~', '~', '=', '-']
        //
        var graph = new Rapid.Graph([
            Rapid.osmNode({ id: 'a', loc: [0, 0] }),
            Rapid.osmNode({ id: 'b', loc: [1, 0] }),
            Rapid.osmNode({ id: 'c', loc: [2, 0] }),
            Rapid.osmNode({ id: 'd', loc: [3, 0] }),
            Rapid.osmWay({ id: '-', nodes: ['a', 'b', 'c'] }),
            Rapid.osmWay({ id: '~', nodes: ['d', 'c'] }),
            Rapid.osmRelation({id: 'r', members: [
                { id: '-', type: 'way' },
                { id: '~', type: 'way' },
                { id: '~', type: 'way' },
                { id: '-', type: 'way' }
            ]})
        ]);

        graph = Rapid.actionSplit('b', ['='])(graph);
        assert.deepEqual(members(graph), ['-', '=', '~', '~', '=', '-']);
    });

        await t.test('splits out-and-back4 route at b', () => {
            //
            // Situation:
            //    a <--- b <--- c <~~~ d                split at 'b'
            //    Relation: ['-', '~', '~', '-']
            //
            // Expected result:
            //    a <=== b <--- c <~~~ d
            //    Relation: ['=', '-', '~', '~', '-', '=']
            //
            var graph = new Rapid.Graph([
                Rapid.osmNode({ id: 'a', loc: [0, 0] }),
                Rapid.osmNode({ id: 'b', loc: [1, 0] }),
                Rapid.osmNode({ id: 'c', loc: [2, 0] }),
                Rapid.osmNode({ id: 'd', loc: [3, 0] }),
                Rapid.osmWay({ id: '-', nodes: ['c', 'b', 'a'] }),
                Rapid.osmWay({ id: '~', nodes: ['d', 'c'] }),
                Rapid.osmRelation({id: 'r', members: [
                    { id: '-', type: 'way' },
                    { id: '~', type: 'way' },
                    { id: '~', type: 'way' },
                    { id: '-', type: 'way' }
                ]})
            ]);

            graph = Rapid.actionSplit('b', ['='])(graph);
            assert.deepEqual(members(graph), ['=', '-', '~', '~', '-', '=']);
        });
    });

        await t.test('splitting hat routes', async t => {
            const a = Rapid.osmNode({id: 'a', loc: [0, 0]});
            const b = Rapid.osmNode({id: 'b', loc: [1, 0]});
            const c = Rapid.osmNode({id: 'c', loc: [2, 1]});
            const d = Rapid.osmNode({id: 'd', loc: [3, 0]});
            const e = Rapid.osmNode({id: 'e', loc: [4, 0]});
            await t.test('splits hat1a route at c', () => {
                //
                // Expected result:
                //          ###> c >***
                //          #         *
                //    a --> b ~~~~~~> d ==> e
                //
                //    Relation: ['-', '#', '*', '~', '#', '*', '=']
                //
                var graph = new Rapid.Graph([
                    a, b, c, d, e,
                    Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
                    Rapid.osmWay({id: '#', nodes: ['b', 'c', 'd']}),
                    Rapid.osmWay({id: '~', nodes: ['b', 'd']}),
                    Rapid.osmWay({id: '=', nodes: ['d', 'e']}),
                    Rapid.osmRelation({
                        id: 'r', members: [
                            {id: '-', type: 'way'},
                            {id: '#', type: 'way'},
                            {id: '~', type: 'way'},
                            {id: '#', type: 'way'},
                            {id: '=', type: 'way'}
                        ]
                    })
                ]);
                graph = Rapid.actionSplit('c', ['*'])(graph);
                assert.deepEqual(members(graph), ['-', '#', '*', '~', '#', '*', '=']);
            });
            //
            // Situation:
            //          ###> c >###
            //          #         #
            //    a --> b ~~~~~~> d ==> e
            //
            //    Relation: ['-', '#', '~', '#', '=']
            //
            const hat1a = new Rapid.Graph([
                a, b, c, d, e,
                Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
                Rapid.osmWay({id: '#', nodes: ['b', 'c', 'd']}),
                Rapid.osmWay({id: '~', nodes: ['b', 'd']}),
                Rapid.osmWay({id: '=', nodes: ['d', 'e']}),
                Rapid.osmRelation({
                    id: 'r', members: [
                        {id: '-', type: 'way'},
                        {id: '#', type: 'way'},
                        {id: '~', type: 'way'},
                        {id: '#', type: 'way'},
                        {id: '=', type: 'way'}
                    ]
                })
            ]);

            //
            // Situation:
            //          ###> c >###
            //          #         #
            //    a --> b ~~~~~~> d ==> e
            //
            //    Relation: ['-', '~', '#', '~', '=']
            //
            const hat1b = new Rapid.Graph([
                a, b, c, d, e,
                Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
                Rapid.osmWay({id: '#', nodes: ['b', 'c', 'd']}),
                Rapid.osmWay({id: '~', nodes: ['b', 'd']}),
                Rapid.osmWay({id: '=', nodes: ['d', 'e']}),
                Rapid.osmRelation({
                    id: 'r', members: [
                        {id: '-', type: 'way'},
                        {id: '~', type: 'way'},
                        {id: '#', type: 'way'},
                        {id: '~', type: 'way'},
                        {id: '=', type: 'way'}
                    ]
                })
            ]);

            //
            // Situation:
            //          ###< c <###
            //          #         #
            //    a --> b ~~~~~~> d ==> e
            //
            //    Relation: ['-', '#', '~', '#', '=']
            //
            const hat2 = new Rapid.Graph([
                a, b, c, d, e,
                Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
                Rapid.osmWay({id: '#', nodes: ['d', 'c', 'b']}),
                Rapid.osmWay({id: '~', nodes: ['b', 'd']}),
                Rapid.osmWay({id: '=', nodes: ['d', 'e']}),
                Rapid.osmRelation({
                    id: 'r', members: [
                        {id: '-', type: 'way'},
                        {id: '#', type: 'way'},
                        {id: '~', type: 'way'},
                        {id: '#', type: 'way'},
                        {id: '=', type: 'way'}
                    ]
                })
            ]);

            //
            // Situation:
            //          ###< c <###
            //          #         #
            //    a --> b <~~~~~~ d ==> e
            //
            //    Relation: ['-', '#', '~', '#', '=']
            //
            const hat3 = new Rapid.Graph([
                a, b, c, d, e,
                Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
                Rapid.osmWay({id: '#', nodes: ['d', 'c', 'b']}),
                Rapid.osmWay({id: '~', nodes: ['d', 'b']}),
                Rapid.osmWay({id: '=', nodes: ['d', 'e']}),
                Rapid.osmRelation({
                    id: 'r', members: [
                        {id: '-', type: 'way'},
                        {id: '#', type: 'way'},
                        {id: '~', type: 'way'},
                        {id: '#', type: 'way'},
                        {id: '=', type: 'way'}
                    ]
                })
            ]);

            //
            // Situation:
            //          ###> c >###
            //          #         #
            //    a --> b <~~~~~~ d ==> e
            //
            //    Relation: ['-', '#', '~', '#', '=']
            //
            const hat4 = new Rapid.Graph([
                a, b, c, d, e,
                Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
                Rapid.osmWay({id: '#', nodes: ['b', 'c', 'd']}),
                Rapid.osmWay({id: '~', nodes: ['d', 'b']}),
                Rapid.osmWay({id: '=', nodes: ['d', 'e']}),
                Rapid.osmRelation({
                    id: 'r', members: [
                        {id: '-', type: 'way'},
                        {id: '#', type: 'way'},
                        {id: '~', type: 'way'},
                        {id: '#', type: 'way'},
                        {id: '=', type: 'way'}
                    ]
                })
            ]);

            //
            // Situation:
            //          ###> c >###
            //          #         #
            //    a <-- b ~~~~~~> d <== e
            //
            //    Relation: ['-', '#', '~', '#', '=']
            //
            const hat5 = new Rapid.Graph([
                a, b, c, d, e,
                Rapid.osmWay({id: '-', nodes: ['b', 'a']}),
                Rapid.osmWay({id: '#', nodes: ['b', 'c', 'd']}),
                Rapid.osmWay({id: '~', nodes: ['b', 'd']}),
                Rapid.osmWay({id: '=', nodes: ['e', 'd']}),
                Rapid.osmRelation({
                    id: 'r', members: [
                        {id: '-', type: 'way'},
                        {id: '#', type: 'way'},
                        {id: '~', type: 'way'},
                        {id: '#', type: 'way'},
                        {id: '=', type: 'way'}
                    ]
                })
            ]);

            await t.test('splits hat1a route at c', () => {
                //
                // Expected result:
                //          ###> c >***
                //          #         *
                //    a --> b ~~~~~~> d ==> e
                //
                //    Relation: ['-', '#', '*', '~', '#', '*', '=']
                //
                var graph = hat1a;
                graph = Rapid.actionSplit('c', ['*'])(graph);
                assert.deepEqual(graph.entity('#').nodes, ['b', 'c']);
                assert.deepEqual(graph.entity('*').nodes, ['c', 'd']);
                assert.deepEqual(members(graph), ['-', '#', '*', '~', '#', '*', '=']);
            });

             await t.test('splits hat1b route at c', () => {
                //
                // Expected result:
                //          ###> c >***
                //          #         *
                //    a --> b ~~~~~~> d ==> e
                //
                //    Relation: ['-', '~', '*', '#', '~', '=']
                //
                var graph = hat1b;
                graph = Rapid.actionSplit('c', ['*'])(graph);

                assert.deepEqual(graph.entity('#').nodes, ['b', 'c']);
                assert.deepEqual(graph.entity('*').nodes, ['c', 'd']);
                assert.deepEqual(members(graph), ['-', '~', '*', '#', '~', '=']);
            });

             await t.test('splits hat2 route at c', () => {
                //
                // Expected result:
                //          ***< c <###
                //          *         #
                //    a --> b ~~~~~~> d ==> e
                //
                //    Relation: ['-', '*', '#', '~', '*', '#', '=']
                //
                var graph = hat2;
                graph = Rapid.actionSplit('c', ['*'])(graph);

                assert.deepEqual(graph.entity('#').nodes, ['d', 'c']);
                assert.deepEqual(graph.entity('*').nodes, ['c', 'b']);
                assert.deepEqual(members(graph), ['-', '*', '#', '~', '*', '#', '=']);
            });

             await t.test('splits hat3 route at c', () => {
                //
                // Expected result:
                //          ***< c <###
                //          *         #
                //    a --> b <~~~~~~ d ==> e
                //
                //    Relation: ['-', '*', '#', '~', '*', '#', '=']
                //
                var graph = hat3;
                graph = Rapid.actionSplit('c', ['*'])(graph);

                assert.deepEqual(graph.entity('#').nodes, ['d', 'c']);
                assert.deepEqual(graph.entity('*').nodes, ['c', 'b']);
                assert.deepEqual(members(graph), ['-', '*', '#', '~', '*', '#', '=']);
            });

             await t.test('splits hat4 route at c', () => {
                //
                // Expected result:
                //          ###> c >***
                //          #         *
                //    a --> b <~~~~~~ d ==> e
                //
                //    Relation: ['-', '*', '#', '~', '*', '#', '=']
                //
                var graph = hat4;
                graph = Rapid.actionSplit('c', ['*'])(graph);

                assert.deepEqual(graph.entity('#').nodes, ['b', 'c']);
                assert.deepEqual(graph.entity('*').nodes, ['c', 'd']);
                assert.deepEqual(members(graph), ['-', '#', '*', '~', '#', '*', '=']);
            });

             await t.test('splits hat5 route at c', () => {
                //
                // Expected result:
                //          ###> c >***
                //          #         *
                //    a <-- b ~~~~~~> d <== e
                //
                //    Relation: ['-', '#', '*', '~', '#', '*', '=']
                //
                var graph = hat5;
                graph = Rapid.actionSplit('c', ['*'])(graph);

                assert.deepEqual(graph.entity('#').nodes, ['b', 'c']);
                assert.deepEqual(graph.entity('*').nodes, ['c', 'd']);
                assert.deepEqual(members(graph), ['-', '#', '*', '~', '#', '*', '=']);
            });

        });

        await t.test('splitting spoon routes', async t => {
            const a = Rapid.osmNode({ id: 'a', loc: [0, 0] });
            const b = Rapid.osmNode({ id: 'b', loc: [0, 1] });
            const c = Rapid.osmNode({ id: 'c', loc: [1, 1] });
            const d = Rapid.osmNode({ id: 'd', loc: [1, 0] });
            const e = Rapid.osmNode({ id: 'e', loc: [2, 0] });
            const f = Rapid.osmNode({ id: 'f', loc: [3, 0] });

            //
            // Situation:
            //    b --> c
            //    |     |
            //    a <-- d ~~~> e ~~~> f
            //
            //    Relation: ['~', '-', '~']
            //
            const spoon1 = new Rapid.Graph([
                a, b, c, d, e, f,
                Rapid.osmWay({id: '-', nodes: ['d', 'a', 'b', 'c', 'd']}),
                Rapid.osmWay({id: '~', nodes: ['d', 'e', 'f']}),
                Rapid.osmRelation({id: 'r', members: [
                    {id: '~', type: 'way'},
                    {id: '-', type: 'way'},
                    {id: '~', type: 'way'}
                ]})
            ]);

            //
            // Situation:
            //    b <-- c
            //    |     |
            //    a --> d ~~~> e ~~~> f
            //
            //    Relation: ['~', '-', '~']
            //
            const spoon2 = new Rapid.Graph([
                a, b, c, d, e, f,
                Rapid.osmWay({id: '-', nodes: ['d', 'c', 'b', 'a', 'd']}),
                Rapid.osmWay({id: '~', nodes: ['d', 'e', 'f']}),
                Rapid.osmRelation({id: 'r', members: [
                    {id: '~', type: 'way'},
                    {id: '-', type: 'way'},
                    {id: '~', type: 'way'}
                ]})
            ]);

            //
            // Situation:
            //    b --> c
            //    |     |
            //    a <-- d <~~~ e <~~~ f
            //
            //    Relation: ['~', '-', '~']
            //
            const spoon3 = new Rapid.Graph([
                a, b, c, d, e, f,
                Rapid.osmWay({id: '-', nodes: ['d', 'a', 'b', 'c', 'd']}),
                Rapid.osmWay({id: '~', nodes: ['f', 'e', 'd']}),
                Rapid.osmRelation({id: 'r', members: [
                    {id: '~', type: 'way'},
                    {id: '-', type: 'way'},
                    {id: '~', type: 'way'}
                ]})
            ]);

            //
            // Situation:
            //    b <-- c
            //    |     |
            //    a --> d <~~~ e <~~~ f
            //
            //    Relation: ['~', '-', '~']
            //
            const spoon4 = new Rapid.Graph([
                a, b, c, d, e, f,
                Rapid.osmWay({id: '-', nodes: ['d', 'c', 'b', 'a', 'd']}),
                Rapid.osmWay({id: '~', nodes: ['f', 'e', 'd']}),
                Rapid.osmRelation({id: 'r', members: [
                    {id: '~', type: 'way'},
                    {id: '-', type: 'way'},
                    {id: '~', type: 'way'}
                ]})
            ]);

             await t.test('splits spoon1 route at d', () => {
                //
                // Expected result:
                //    b ==> c
                //    |     ‖
                //    a <-- d ~~~> e ~~~> f
                //
                //    Relation: ['~', '-', '=', '~']
                //
                var graph = spoon1;
                graph = Rapid.actionSplit('d', ['='])(graph);

                assert.deepEqual(graph.entity('-').nodes, ['d', 'a', 'b']);
                assert.deepEqual(graph.entity('=').nodes, ['b', 'c', 'd']);
                assert.deepEqual(graph.entity('~').nodes, ['d', 'e', 'f']);
                assert.deepEqual(members(graph), ['~', '-', '=', '~']);
            });

             await t.test('splits spoon2 route at d', () => {
                //
                // Expected result:
                //    b <== c
                //    |     ‖
                //    a --> d ~~~> e ~~~> f
                //
                //    Relation: ['~', '-', '=', '~']
                //
                var graph = spoon2;
                graph = Rapid.actionSplit('d', ['='])(graph);

                assert.deepEqual(graph.entity('-').nodes, ['b', 'a', 'd']);
                assert.deepEqual(graph.entity('=').nodes, ['d', 'c', 'b']);
                assert.deepEqual(graph.entity('~').nodes, ['d', 'e', 'f']);
                assert.deepEqual(members(graph), ['~', '-', '=', '~']);
            });

             await t.test('splits spoon3 route at d', () => {
                //
                // Expected result:
                //    b ==> c
                //    |     ‖
                //    a <-- d <~~~ e <~~~ f
                //
                //    Relation: ['~', '-', '=', '~']
                //
                var graph = spoon3;
                graph = Rapid.actionSplit('d', ['='])(graph);

                assert.deepEqual(graph.entity('-').nodes, ['d', 'a', 'b']);
                assert.deepEqual(graph.entity('=').nodes, ['b', 'c', 'd']);
                assert.deepEqual(graph.entity('~').nodes, ['f', 'e', 'd']);
                assert.deepEqual(members(graph), ['~', '-', '=', '~']);
            });

            await t.test('splits spoon4 route at d', () => {
                //
                // Expected result:
                //    b <== c
                //    |     ‖
                //    a --> d <~~~ e <~~~ f
                //
                //    Relation: ['~', '-', '=', '~']
                //
                var graph = spoon4;
                graph = Rapid.actionSplit('d', ['='])(graph);

                assert.deepEqual(graph.entity('-').nodes, ['b', 'a', 'd']);
                assert.deepEqual(graph.entity('=').nodes, ['d', 'c', 'b']);
                assert.deepEqual(graph.entity('~').nodes, ['f', 'e', 'd']);
                assert.deepEqual(members(graph), ['~', '-', '=', '~']);
            });

             await t.test('splits spoon1 route at e', () => {
                //
                // Expected result:
                //    b --> c
                //    |     |
                //    a <-- d ~~~> e ===> f
                //
                //    Relation: ['=', '~', '-', '~', '=']
                //
                var graph = spoon1;
                graph = Rapid.actionSplit('e', ['='])(graph);

                assert.deepEqual(graph.entity('-').nodes, ['d', 'a', 'b', 'c', 'd']);
                assert.deepEqual(graph.entity('~').nodes, ['d', 'e']);
                assert.deepEqual(graph.entity('=').nodes, ['e', 'f']);
                assert.deepEqual(members(graph), ['=', '~', '-', '~', '=']);
            });

            await t.test('splits spoon2 route at e', () => {
                //
                // Expected result:
                //    b <-- c
                //    |     |
                //    a --> d ~~~> e ===> f
                //
                //    Relation: ['=', '~', '-', '~', '=']
                //
                var graph = spoon2;
                graph = Rapid.actionSplit('e', ['='])(graph);

                assert.deepEqual(graph.entity('-').nodes, ['d', 'c', 'b', 'a', 'd']);
                assert.deepEqual(graph.entity('~').nodes, ['d', 'e']);
                assert.deepEqual(graph.entity('=').nodes, ['e', 'f']);
                assert.deepEqual(members(graph), ['=', '~', '-', '~', '=']);
            });

             await t.test('splits spoon3 route at e', () => {
                //
                // Expected result:
                //    b --> c
                //    |     |
                //    a <-- d <=== e <~~~ f
                //
                //    Relation: ['~', '=', '-', '=', '~']
                //
                var graph = spoon3;
                graph = Rapid.actionSplit('e', ['='])(graph);

                assert.deepEqual(graph.entity('-').nodes, ['d', 'a', 'b', 'c', 'd']);
                assert.deepEqual(graph.entity('~').nodes, ['f', 'e']);
                assert.deepEqual(graph.entity('=').nodes, ['e', 'd']);
                assert.deepEqual(members(graph), ['~', '=', '-', '=', '~']);
            });

            await t.test('splits spoon4 route at e', () => {
                //
                // Expected result:
                //    b <-- c
                //    |     |
                //    a --> d <=== e <~~~ f
                //
                //    Relation: ['~', '=', '-', '=', '~']
                //
                var graph = spoon4;
                graph = Rapid.actionSplit('e', ['='])(graph);

                assert.deepEqual(graph.entity('-').nodes, ['d', 'c', 'b', 'a', 'd']);
                assert.deepEqual(graph.entity('~').nodes, ['f', 'e']);
                assert.deepEqual(graph.entity('=').nodes, ['e', 'd']);
                assert.deepEqual(members(graph), ['~', '=', '-', '=', '~']);
            });

        });


        await t.test('type = multipolygon', async t => {
            await t.test('splits an area by converting it to a multipolygon', () => {
                // Situation:
                //    a ---- b
                //    |      |
                //    d ---- c
                //
                // Split at a.
                //
                // Expected result:
                //    a ---- b
                //    ||     |
                //    d ==== c
                //
                var graph = new Rapid.Graph([
                    Rapid.osmNode({id: 'a', loc: [0,1]}),
                    Rapid.osmNode({id: 'b', loc: [1,1]}),
                    Rapid.osmNode({id: 'c', loc: [1,0]}),
                    Rapid.osmNode({id: 'd', loc: [0,0]}),
                    Rapid.osmWay({id: '-', tags: {area: 'yes'}, nodes: ['a', 'b', 'c', 'd', 'a']})
                ]);

                graph = Rapid.actionSplit('a', ['='])(graph);
                assert.deepStrictEqual(graph.entity('-').tags, {});
                assert.deepStrictEqual(graph.entity('=').tags, {});
                assert.strictEqual(graph.parentRelations(graph.entity('-')).length, 1, 'graph.entity("-") has one parent relation');

                const relation = graph.parentRelations(graph.entity('-'))[0];
                assert.deepStrictEqual(relation.tags, {type: 'multipolygon', area: 'yes'});
                assert.deepStrictEqual(relation.members, [
                    {id: '-', role: 'outer', type: 'way'},
                    {id: '=', role: 'outer', type: 'way'}
                ]);
            });

            await t.test('splits only the line of a node shared by a line and an area', () => {
                var graph = new Rapid.Graph([
                    Rapid.osmNode({id: 'a', loc: [0,1]}),
                    Rapid.osmNode({id: 'b', loc: [1,1]}),
                    Rapid.osmNode({id: 'c', loc: [1,0]}),
                    Rapid.osmWay({id: '-',  nodes: ['a', 'b', 'c']}),
                    Rapid.osmWay({id: '=',  nodes: ['a', 'b', 'c', 'a'], tags: {area: 'yes'}})
                ]);

                graph = Rapid.actionSplit('b', ['~'])(graph);

                assert.deepStrictEqual(graph.entity('-').nodes, ['b', 'c'], 'graph.entity("-").nodes should be ["b", "c"]');
                assert.deepStrictEqual(graph.entity('~').nodes, ['a', 'b'], 'graph.entity("~").nodes should be ["a", "b"]');
                assert.deepStrictEqual(graph.entity('=').nodes, ['a', 'b', 'c', 'a'], 'graph.entity("=").nodes should be ["a", "b", "c", "a"]');
                assert.strictEqual(graph.parentRelations(graph.entity('=')).length, 0, 'graph.entity("=") should have no parent relations');
            });

            await t.test('converts simple multipolygon to a proper multipolygon', () => {
                var graph = new Rapid.Graph([
                    Rapid.osmNode({id: 'a'}),
                    Rapid.osmNode({id: 'b'}),
                    Rapid.osmNode({id: 'c'}),
                    Rapid.osmWay({'id': '-', nodes: ['a', 'b', 'c'], tags: { area: 'yes' }}),
                    Rapid.osmRelation({id: 'r', members: [{id: '-', type: 'way', role: 'outer'}], tags: {type: 'multipolygon'}})
                ]);

                graph = Rapid.actionSplit('b', ['='])(graph);

                assert.deepEqual(graph.entity('-').tags, {});
                assert.deepEqual(graph.entity('r').tags, {type: 'multipolygon', area: 'yes' });
                const ids = graph.entity('r').members.map(function(m) { return m.id; });
                assert.deepEqual(ids, ['-', '=']);
            });
        });

        const types = ['restriction', 'restriction:bus', 'manoeuvre'];
        await Promise.all(types.map(async (type) => {
             await t.test('type = ' + type, async t => {
                await t.test('updates a restriction\'s \'from\' role - via node', () => {
                    // Situation:
                    //    a ----> b ----> c ~~~~ d
                    // A restriction from ---- to ~~~~ via node c.
                    //
                    // Split at b.
                    //
                    // Expected result:
                    //    a ----> b ====> c ~~~~ d
                    // A restriction from ==== to ~~~~ via node c.
                    //
                    var graph = new Rapid.Graph([
                    Rapid.osmNode({id: 'a'}),
                    Rapid.osmNode({id: 'b'}),
                    Rapid.osmNode({id: 'c'}),
                    Rapid.osmNode({id: 'd'}),
                    Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c']}),
                    Rapid.osmWay({id: '~', nodes: ['c', 'd']}),
                    Rapid.osmRelation({id: 'r', tags: {type: type}, members: [
                        {id: '-', role: 'from', type: 'way'},
                        {id: '~', role: 'to', type: 'way'},
                        {id: 'c', role: 'via', type: 'node'}
                    ]})
                ]);
                graph = Rapid.actionSplit('b', ['='])(graph);
                assert.deepEqual(graph.entity('r').members, [
                    {id: '=', role: 'from', type: 'way'},
                    {id: '~', role: 'to', type: 'way'},
                    {id: 'c', role: 'via', type: 'node'}
                ]);
            });

                await t.test('updates a restriction\'s \'to\' role - via node', () => {
                    //
                    // Situation:
                    //    a ----> b ----> c ~~~~ d
                    // A restriction from ~~~~ to ---- via node c.
                    //
                    // Split at b.
                    //
                    // Expected result:
                    //    a ----> b ====> c ~~~~ d
                    // A restriction from ~~~~ to ==== via node c.
                    //
                    var graph = new Rapid.Graph([
                        Rapid.osmNode({id: 'a'}),
                        Rapid.osmNode({id: 'b'}),
                        Rapid.osmNode({id: 'c'}),
                        Rapid.osmNode({id: 'd'}),
                        Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c']}),
                        Rapid.osmWay({id: '~', nodes: ['c', 'd']}),
                        Rapid.osmRelation({id: 'r', tags: {type: type}, members: [
                            {id: '~', role: 'from', type: 'way'},
                            {id: '-', role: 'to', type: 'way'},
                            {id: 'c', role: 'via', type: 'node'}
                        ]})
                    ]);

                    graph = Rapid.actionSplit('b', ['='])(graph);

                    assert.deepEqual(graph.entity('r').members, [
                        {id: '~', role: 'from', type: 'way'},
                        {id: '=', role: 'to', type: 'way'},
                        {id: 'c', role: 'via', type: 'node'}
                    ]);
                });

                await t.test('updates both \'to\' and \'from\' roles for via-node u-turn restrictions', () => {
                    //
                    // Situation:
                    //    a ----> b ----> c ~~~~ d
                    // A restriction from ---- to ---- via node c.
                    //
                    // Split at b.
                    //
                    // Expected result:
                    //    a ----> b ====> c ~~~~ d
                    // A restriction from ==== to ==== via node c.
                    //
                    var graph = new Rapid.Graph([
                        Rapid.osmNode({id: 'a'}),
                        Rapid.osmNode({id: 'b'}),
                        Rapid.osmNode({id: 'c'}),
                        Rapid.osmNode({id: 'd'}),
                        Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c']}),
                        Rapid.osmWay({id: '~', nodes: ['c', 'd']}),
                        Rapid.osmRelation({id: 'r', tags: {type: type}, members: [
                            {id: '-', role: 'from', type: 'way'},
                            {id: '-', role: 'to', type: 'way'},
                            {id: 'c', role: 'via', type: 'node'}
                        ]})
                    ]);

                    graph = Rapid.actionSplit('b', ['='])(graph);

                    assert.deepEqual(graph.entity('r').members, [
                        {id: '=', role: 'from', type: 'way'},
                        {id: '=', role: 'to', type: 'way'},
                        {id: 'c', role: 'via', type: 'node'}
                    ]);
                });

                await t.test('updates a restriction\'s \'from\' role - via way', () => {
                    //
                    // Situation:
                    //            e <~~~~ d
                    //                    |
                    //                    |
                    //    a ----> b ----> c
                    //
                    // A restriction from ---- to ~~~~ via way |
                    //
                    // Split at b.
                    //
                    // Expected result:
                    //            e <~~~~ d
                    //                    |
                    //                    |
                    //    a ----> b ====> c
                    //
                    // A restriction from ==== to ~~~~ via way |
                    //
                    var graph = new Rapid.Graph([
                        Rapid.osmNode({id: 'a'}),
                        Rapid.osmNode({id: 'b'}),
                        Rapid.osmNode({id: 'c'}),
                        Rapid.osmNode({id: 'd'}),
                        Rapid.osmNode({id: 'e'}),
                        Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c']}),
                        Rapid.osmWay({id: '|', nodes: ['c', 'd']}),
                        Rapid.osmWay({id: '~', nodes: ['d', 'e']}),
                        Rapid.osmRelation({id: 'r', tags: {type: type}, members: [
                            {id: '-', role: 'from', type: 'way'},
                            {id: '~', role: 'to', type: 'way'},
                            {id: '|', role: 'via', type: 'way'}
                        ]})
                    ]);

                    graph = Rapid.actionSplit('b', ['='])(graph);

                    assert.deepEqual(graph.entity('r').members, [
                        {id: '=', role: 'from', type: 'way'},
                        {id: '~', role: 'to', type: 'way'},
                        {id: '|', role: 'via', type: 'way'}
                    ]);
                });

                await t.test('updates a restriction\'s \'to\' role - via way', () => {
                    //
                    // Situation:
                    //            e <~~~~ d
                    //                    |
                    //                    |
                    //    a ----> b ----> c
                    //
                    // A restriction from ~~~~ to ---- via way |
                    //
                    // Split at b.
                    //
                    // Expected result:
                    //            e <~~~~ d
                    //                    |
                    //                    |
                    //    a ----> b ====> c
                    //
                    // A restriction from ~~~~ to ==== via way |
                    //
                    var graph = new Rapid.Graph([
                        Rapid.osmNode({id: 'a'}),
                        Rapid.osmNode({id: 'b'}),
                        Rapid.osmNode({id: 'c'}),
                        Rapid.osmNode({id: 'd'}),
                        Rapid.osmNode({id: 'e'}),
                        Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c']}),
                        Rapid.osmWay({id: '|', nodes: ['c', 'd']}),
                        Rapid.osmWay({id: '~', nodes: ['d', 'e']}),
                        Rapid.osmRelation({id: 'r', tags: {type: type}, members: [
                            {id: '~', role: 'from', type: 'way'},
                            {id: '-', role: 'to', type: 'way'},
                            {id: '|', role: 'via', type: 'way'}
                        ]})
                    ]);

                    graph = Rapid.actionSplit('b', ['='])(graph);

                    assert.deepEqual(graph.entity('r').members, [
                        {id: '~', role: 'from', type: 'way'},
                        {id: '=', role: 'to', type: 'way'},
                        {id: '|', role: 'via', type: 'way'}
                    ]);
                });


                await t.test('updates a restriction\'s \'via\' role when splitting via way', () => {
                    //
                    // Situation:
                    //    d               e
                    //    |               ‖
                    //    |               ‖
                    //    a ----> b ----> c
                    //
                    // A restriction from | to ‖ via way ----
                    //
                    // Split at b.
                    //
                    // Expected result:
                    //    d               e
                    //    |               ‖
                    //    |               ‖
                    //    a ----> b ====> c
                    //
                    // A restriction from | to ‖ via ways ----, ====
                    //
                    var graph = new Rapid.Graph([
                        Rapid.osmNode({id: 'a'}),
                        Rapid.osmNode({id: 'b'}),
                        Rapid.osmNode({id: 'c'}),
                        Rapid.osmNode({id: 'd'}),
                        Rapid.osmNode({id: 'e'}),
                        Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c']}),
                        Rapid.osmWay({id: '|', nodes: ['d', 'a']}),
                        Rapid.osmWay({id: '‖', nodes: ['e', 'c']}),
                        Rapid.osmRelation({id: 'r', tags: {type: type}, members: [
                            {id: '|', role: 'from', type: 'way'},
                            {id: '-', role: 'via', type: 'way'},
                            {id: '‖', role: 'to', type: 'way'}
                        ]})
                    ]);

                    graph = Rapid.actionSplit('b', ['='])(graph);

                    assert.deepEqual(graph.entity('r').members, [
                        {id: '|', role: 'from', type: 'way'},
                        {id: '-', role: 'via', type: 'way'},
                        {id: '=', role: 'via', type: 'way'},
                        {id: '‖', role: 'to', type: 'way'}
                    ]);
                });

                await t.test('leaves unaffected restrictions unchanged', () => {
                    //
                    // Situation:
                    //    a <---- b <---- c ~~~~ d
                    // A restriction from ---- to ~~~~ via c.
                    //
                    // Split at b.
                    //
                    // Expected result:
                    //    a <==== b <---- c ~~~~ d
                    // A restriction from ---- to ~~~~ via c.
                    //
                    var graph = new Rapid.Graph([
                        Rapid.osmNode({id: 'a'}),
                        Rapid.osmNode({id: 'b'}),
                        Rapid.osmNode({id: 'c'}),
                        Rapid.osmNode({id: 'd'}),
                        Rapid.osmWay({id: '-', nodes: ['c', 'b', 'a']}),
                        Rapid.osmWay({id: '~', nodes: ['c', 'd']}),
                        Rapid.osmRelation({id: 'r', tags: {type: type}, members: [
                            {id: '-', role: 'from', type: 'way'},
                            {id: '~', role: 'to', type: 'way'},
                            {id: 'c', role: 'via', type: 'node'}
                        ]})
                    ]);

                    graph = Rapid.actionSplit('b', ['='])(graph);

                    assert.deepEqual(graph.entity('r').members, [
                        {id: '-', role: 'from', type: 'way'},
                        {id: '~', role: 'to', type: 'way'},
                        {id: 'c', role: 'via', type: 'node'}
                    ]);
                });
            });
        }));
    });
});
