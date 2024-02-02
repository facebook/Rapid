import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';

describe('actionRevert', () => {
    describe('basic', () => {
        it('removes a new entity', () => {
            const n1 = Rapid.osmNode({id: 'n-1'}),
                graph = new Rapid.Graph().replace(n1);

            const result = Rapid.actionRevert('n-1')(graph);
            assert.strictEqual(result.hasEntity('n-1'), undefined, 'n-1 removed');
        });


        it('reverts an updated entity', () => {
            const n1 = Rapid.osmNode({id: 'n1'}),
                n1up = n1.update({}),
                graph = new Rapid.Graph([n1]).replace(n1up);

            const result = Rapid.actionRevert('n1')(graph);
            assert.strictEqual(result.hasEntity('n1'), n1, 'n1 reverted');
        });


        it('restores a deleted entity', () => {
            const n1 = Rapid.osmNode({id: 'n1'}),
                graph = new Rapid.Graph([n1]).remove(n1);

            const result = Rapid.actionRevert('n1')(graph);
            assert.strictEqual(result.hasEntity('n1'), n1);
        });
    });

    describe('reverting way child nodes', () => {
        it('removes new node, updates parent way nodelist', () => {
            // note: test with a 3 node way so w1 doesn't go degenerate..
            const n1 = Rapid.osmNode({id: 'n1'}),
                n2 = Rapid.osmNode({id: 'n2'}),
                n3 = Rapid.osmNode({id: 'n-3'}),
                w1 = Rapid.osmWay({id: 'w1', nodes: ['n1', 'n2']}),
                w1up = w1.addNode('n-3', 2),
                graph = new Rapid.Graph([n1, n2, w1]).replace(n3).replace(w1up);

            const result = Rapid.actionRevert('n-3')(graph);

            const w1_1 = result.hasEntity('w1');
            assert.strictEqual(result.hasEntity('n1'), n1, 'n1 unchanged');
            assert.strictEqual(result.hasEntity('n2'), n2, 'n2 unchanged');
            assert.strictEqual(result.hasEntity('n-3'), undefined, 'n-3 removed');
            assert.deepStrictEqual(result.parentWays(n1), [w1_1], 'n1 has w1 as parent way');
            assert.deepStrictEqual(result.parentWays(n2), [w1_1], 'n2 has w1 as parent way');
            assert.deepStrictEqual(w1_1.nodes, w1.nodes, 'w1 nodes updated');
        });


        it('reverts existing node, preserves parent way nodelist', () => {
            const n1 = Rapid.osmNode({id: 'n1'}),
                n2 = Rapid.osmNode({id: 'n2'}),
                w1 = Rapid.osmWay({id: 'w1', nodes: ['n1', 'n2']}),
                n1up = n1.update({}),
                graph = new Rapid.Graph([n1, n2, w1]).replace(n1up);

            const result = Rapid.actionRevert('n1')(graph);

            const w1_1 = result.hasEntity('w1');
            assert.strictEqual(result.hasEntity('n1'), n1, 'n1 reverted');
            assert.strictEqual(result.hasEntity('n2'), n2, 'n2 unchanged');
            assert.deepStrictEqual(result.parentWays(n1), [w1_1], 'n1 has w1 as parent way');
            assert.deepStrictEqual(result.parentWays(n2), [w1_1], 'n2 has w1 as parent way');
            assert.deepStrictEqual(w1_1.nodes, w1.nodes, 'w1 nodes preserved');
        });
    });

    describe('reverting relation members', () => {
        it('removes new node, updates parent relation memberlist', () => {
            const n1 = Rapid.osmNode({id: 'n1'}),
                n2 = Rapid.osmNode({id: 'n-2'}),
                r1 = Rapid.osmRelation({id: 'r1', members: [{id: 'n1'}]}),
                r1up = r1.addMember({id: 'n-2'}, 1),
                graph = new Rapid.Graph([n1, r1]).replace(n2).replace(r1up);

            const result = Rapid.actionRevert('n-2')(graph);

            const r1_1 = result.hasEntity('r1');
            assert.strictEqual(result.hasEntity('n1'), n1, 'n1 unchanged');
            assert.strictEqual(result.hasEntity('n-2'), undefined, 'n-2 removed');
            assert.deepStrictEqual(result.parentRelations(n1), [r1_1], 'n1 has r1 as parent relation');
            assert.deepStrictEqual(r1_1.members, r1.members, 'r1 members updated');
        });


        it('reverts existing node, preserves parent relation memberlist', () => {
            const n1 = Rapid.osmNode({id: 'n1'}),
                n2 = Rapid.osmNode({id: 'n2'}),
                r1 = Rapid.osmRelation({id: 'r1', members: [{id: 'n1'}, {id: 'n2'}]}),
                n1up = n1.update({}),
                graph = new Rapid.Graph([n1, n2, r1]).replace(n1up);

            const result = Rapid.actionRevert('n1')(graph);

            const r1_1 = result.hasEntity('r1');
            assert.strictEqual(result.hasEntity('n1'), n1, 'n1 reverted');
            assert.strictEqual(result.hasEntity('n2'), n2, 'n2 unchanged');
            assert.deepStrictEqual(result.parentRelations(n1), [r1_1], 'n1 has r1 as parent relation');
            assert.deepStrictEqual(result.parentRelations(n2), [r1_1], 'n2 has r1 as parent relation');
            assert.deepStrictEqual(r1_1.members, r1.members, 'r1 members preserved');
        });
    });

    describe('reverting parent ways', () => {
        it('removes new way, preserves new and existing child nodes', () => {
            const n1 = Rapid.osmNode({id: 'n1'}),
                n2 = Rapid.osmNode({id: 'n-2'}),
                w1 = Rapid.osmWay({id: 'w-1', nodes: ['n1', 'n-2']}),
                graph = new Rapid.Graph([n1]).replace(n2).replace(w1);

            const result = Rapid.actionRevert('w-1')(graph);
            assert.strictEqual(result.hasEntity('w-1'), undefined, 'w-1 removed');
            assert.strictEqual(result.hasEntity('n1'), n1, 'n1 unchanged');
            assert.strictEqual(result.hasEntity('n-2'), n2, 'n-2 unchanged');
            assert.deepStrictEqual(result.parentWays(n1), [], 'n1 has no parent ways');
            assert.deepStrictEqual(result.parentWays(n2), [], 'n-2 has no parent ways');
        });


        it('reverts an updated way, preserves new and existing child nodes', () => {
            const n1 = Rapid.osmNode({id: 'n1'}),
                n2 = Rapid.osmNode({id: 'n-2'}),
                w1 = Rapid.osmWay({id: 'w1', nodes: ['n1']}),
                w1up = w1.addNode('n-2', 1),
                graph = new Rapid.Graph([n1, w1]).replace(n2).replace(w1up);

            const result = Rapid.actionRevert('w1')(graph);
            assert.strictEqual(result.hasEntity('w1'), w1, 'w1 reverted');
                        assert.strictEqual(result.hasEntity('n1'), n1, 'n1 unchanged');
            assert.strictEqual(result.hasEntity('n-2'), n2, 'n-2 unchanged');
            assert.deepStrictEqual(result.parentWays(n1), [w1], 'n1 has w1 as parent way');
            assert.deepStrictEqual(result.parentWays(n2), [], 'n2 has no parent ways');
        });


        it('restores a deleted way, preserves new and existing child nodes', () => {
            const n1 = Rapid.osmNode({id: 'n1'}),
                n2 = Rapid.osmNode({id: 'n-2'}),
                w1 = Rapid.osmWay({id: 'w1', nodes: ['n1']}),
                w1up = w1.addNode('n-2', 1),
                graph = new Rapid.Graph([n1, w1]).replace(n2).replace(w1up).remove(w1up);

            const result = Rapid.actionRevert('w1')(graph);
            assert.strictEqual(result.hasEntity('w1'), w1, 'w1 restored');
            assert.strictEqual(result.hasEntity('n1'), n1, 'n1 unchanged');
            assert.strictEqual(result.hasEntity('n-2'), n2, 'n-2 unchanged');
            assert.deepStrictEqual(result.parentWays(n1), [w1], 'n1 has w1 as parent way');
            assert.deepStrictEqual(result.parentWays(n2), [], 'n2 has no parent ways');
        });
    });

    describe('reverting parent relations', () => {
        it('removes new relation, preserves new and existing members', () => {
            const n1 = Rapid.osmNode({id: 'n1'}),
                n2 = Rapid.osmNode({id: 'n-2'}),
                r1 = Rapid.osmRelation({id: 'r-1', members: [{id: 'n1'}, {id: 'n-2'}]}),
                graph = new Rapid.Graph([n1]).replace(n2).replace(r1);

            const result = Rapid.actionRevert('r-1')(graph);
            assert.strictEqual(result.hasEntity('r-1'), undefined, 'r-1 removed');
            assert.strictEqual(result.hasEntity('n1'), n1, 'n1 unchanged');
            assert.strictEqual(result.hasEntity('n-2'), n2, 'n-2 unchanged');
            assert.deepStrictEqual(result.parentRelations(n1), [], 'n1 has no parent relations');
            assert.deepStrictEqual(result.parentRelations(n2), [], 'n-2 has no parent relations');
        });


        it('reverts an updated relation, preserves new and existing members', () => {
            const n1 = Rapid.osmNode({id: 'n1'}),
                n2 = Rapid.osmNode({id: 'n-2'}),
                r1 = Rapid.osmRelation({id: 'r1', members: [{id: 'n1'}]}),
                r1up = r1.addMember({id: 'n-2'}, 1),
                graph = new Rapid.Graph([n1, r1]).replace(n2).replace(r1up);

            const result  = Rapid.actionRevert('r1')(graph);
            assert.strictEqual(result.hasEntity('r1'), r1, 'r1 reverted');
            assert.strictEqual(result.hasEntity('n1'), n1, 'n1 unchanged');
            assert.strictEqual(result.hasEntity('n-2'), n2, 'n-2 unchanged');
            assert.deepStrictEqual(result.parentRelations(n1), [r1], 'n1 has r1 as parent relation');
            assert.deepStrictEqual(result.parentRelations(n2), [], 'n-2 has no parent relations');
        });


        it('restores a deleted relation, preserves new and existing members', () => {
            const n1 = Rapid.osmNode({id: 'n1'}),
                n2 = Rapid.osmNode({id: 'n-2'}),
                r1 = Rapid.osmRelation({id: 'r1', members: [{id: 'n1'}]}),
                r1up = r1.addMember({id: 'n-2'}, 1),
                graph = new Rapid.Graph([n1, r1]).replace(n2).replace(r1up).remove(r1up);

            const result = Rapid.actionRevert('r1')(graph);
            assert.strictEqual(result.hasEntity('r1'), r1, 'r1 reverted');
            assert.strictEqual(result.hasEntity('n1'), n1, 'n1 unchanged');
            assert.strictEqual(result.hasEntity('n-2'), n2, 'n-2 unchanged');
            assert.deepStrictEqual(result.parentRelations(n1), [r1], 'n1 has r1 as parent relation');
            assert.deepStrictEqual(result.parentRelations(n2), [], 'n-2 has no parent relations');
        });
    });
});