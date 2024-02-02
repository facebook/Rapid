import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';

describe('actionMoveNode', () => {
    it('changes a node\'s location', function () {
        const node = Rapid.osmNode({id: 'a', loc: [0, 0]});
        const toLoc = [2, 3];
        const graph = new Rapid.Graph([node]);

        const result = Rapid.actionMoveNode('a', toLoc)(graph);
        assert.deepEqual(result.entity('a').loc, toLoc);
    });


    describe('transitions', () => {
        it('is transitionable', function() {
            assert.strictEqual(Rapid.actionMoveNode().transitionable, true);
        });


        it('move node at t = 0', function() {
            const node = Rapid.osmNode({id: 'a', loc: [0, 0]});
            const toLoc = [2, 3];
            const graph = new Rapid.Graph([node]);

            const result = Rapid.actionMoveNode('a', toLoc)(graph, 0);
            assert.strictEqual(result.entity('a').loc[0], 0, 1e-6);
            assert.strictEqual(result.entity('a').loc[1], 0, 1e-6);
        });


        it('move node at t = 0.5', function() {
            const node = Rapid.osmNode({id: 'a', loc: [0, 0]});
            const toLoc = [2, 3];
            const graph = new Rapid.Graph([node]);

            const result = Rapid.actionMoveNode('a', toLoc)(graph, 0.5);
            assert.strictEqual(result.entity('a').loc[0], 1, 1e-6);
            assert.strictEqual(result.entity('a').loc[1], 1.5, 1e-6);
        });


        it('move node at t = 1', function() {
            const node = Rapid.osmNode({id: 'a', loc: [0, 0]});
            const toLoc = [2, 3];
            const graph = new Rapid.Graph([node]);

            const result = Rapid.actionMoveNode('a', toLoc)(graph, 1);
            assert.strictEqual(result.entity('a').loc[0], 2, 1e-6);
            assert.strictEqual(result.entity('a').loc[1], 3, 1e-6);
        });
    });
});