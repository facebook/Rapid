import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';

test('actionRestrictTurn', async t => {
    await t.test('adds a via node restriction to an unrestricted turn', () => {
        //
        // u === * --- w
        //
        var graph = new Rapid.Graph([
            Rapid.osmNode({id: 'u'}),
            Rapid.osmNode({id: '*'}),
            Rapid.osmNode({id: 'w'}),
            Rapid.osmWay({id: '=', nodes: ['u', '*']}),
            Rapid.osmWay({id: '-', nodes: ['*', 'w']})
        ]);

        var turn = {
            from: { node: 'u', way: '=' },
            via:  { node: '*'},
            to:   { node: 'w', way: '-' }
        };

        var action = Rapid.actionRestrictTurn(turn, 'no_straight_on', 'r');
        const result = action(graph);

        var r = result.entity('r');
        assert.deepEqual(r.tags, {type: 'restriction', restriction: 'no_straight_on'});

        var f = r.memberByRole('from');
        assert.strictEqual(f.id, '=');
        assert.strictEqual(f.type, 'way');

        var v = r.memberByRole('via');
        assert.strictEqual(v.id, '*');
        assert.strictEqual(v.type, 'node');

        var t = r.memberByRole('to');
        assert.strictEqual(t.id, '-');
        assert.strictEqual(t.type, 'way');
    });

    await t.test('adds a via way restriction to an unrestricted turn', () => {
        //
        // u === v1
        //       |
        // w --- v2
        //
        var graph = new Rapid.Graph([
            Rapid.osmNode({id: 'u'}),
            Rapid.osmNode({id: 'v1'}),
            Rapid.osmNode({id: 'v2'}),
            Rapid.osmNode({id: 'w'}),
            Rapid.osmWay({id: '=', nodes: ['u', 'v1']}),
            Rapid.osmWay({id: '|', nodes: ['v1', 'v2']}),
            Rapid.osmWay({id: '-', nodes: ['v2', 'w']})
        ]);

        var turn = {
            from: { node: 'u', way: '=' },
            via:  { ways: ['|'] },
            to:   { node: 'w', way: '-' }
        };

        var action = Rapid.actionRestrictTurn(turn, 'no_u_turn', 'r');
        const result =  action(graph);

        var r = result.entity('r');
        assert.deepEqual(r.tags, {type: 'restriction', restriction: 'no_u_turn'});

        var f = r.memberByRole('from');
        assert.strictEqual(f.id, '=');
        assert.strictEqual(f.type, 'way');

        var v = r.memberByRole('via');
        assert.strictEqual(v.id, '|');
        assert.strictEqual(v.type, 'way');

        var t = r.memberByRole('to');
        assert.strictEqual(t.id, '-');
        assert.strictEqual(t.type, 'way');
    });
});
