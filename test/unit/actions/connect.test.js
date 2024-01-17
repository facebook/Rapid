import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';

const it = function() {};  // remove
const expect = function() {};  // remove

test.todo('actionConnect', async t => {
    it('chooses the first non-new node as the survivor', function() {
        var graph = new Rapid.Graph([
            Rapid.osmNode({id: 'a'}),
            Rapid.osmNode({id: 'b', version: '1'}),
            Rapid.osmNode({id: 'c', version: '1'})
        ]);

        graph = Rapid.actionConnect(['a', 'b', 'c'])(graph);
        expect(graph.hasEntity('a')).not.to.be.ok;
        expect(graph.hasEntity('b')).to.be.ok;
        expect(graph.hasEntity('c')).not.to.be.ok;
    });

    it('chooses the last node as the survivor when all are new', function() {
        var graph = new Rapid.Graph([
            Rapid.osmNode({id: 'a'}),
            Rapid.osmNode({id: 'b'}),
            Rapid.osmNode({id: 'c'})
        ]);

        graph = Rapid.actionConnect(['a', 'b', 'c'])(graph);
        expect(graph.hasEntity('a')).not.to.be.ok;
        expect(graph.hasEntity('b')).not.to.be.ok;
        expect(graph.hasEntity('c')).to.be.ok;
    });


    it('replaces non-surviving nodes in parent ways', function() {
        // a --- b --- c
        //
        //       e
        //       |
        //       d
        //
        // Connect [e, b].
        //
        // Expected result:
        //
        // a --- b --- c
        //       |
        //       d
        //
        var graph = new Rapid.Graph([
            Rapid.osmNode({id: 'a'}),
            Rapid.osmNode({id: 'b'}),
            Rapid.osmNode({id: 'c'}),
            Rapid.osmNode({id: 'd'}),
            Rapid.osmNode({id: 'e'}),
            Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c']}),
            Rapid.osmWay({id: '|', nodes: ['d', 'e']})
        ]);

        graph = Rapid.actionConnect(['e', 'b'])(graph);
        expect(graph.entity('-').nodes).to.eql(['a', 'b', 'c']);
        expect(graph.entity('|').nodes).to.eql(['d', 'b']);
    });

    it('handles circular ways', function() {
        // c -- a   d === e
        // |   /
        // |  /
        // | /
        // b
        //
        // Connect [a, d].
        //
        var graph = new Rapid.Graph([
            Rapid.osmNode({id: 'a'}),
            Rapid.osmNode({id: 'b'}),
            Rapid.osmNode({id: 'c'}),
            Rapid.osmNode({id: 'd'}),
            Rapid.osmNode({id: 'e'}),
            Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'a']}),
            Rapid.osmWay({id: '=', nodes: ['d', 'e']})
        ]);

        graph = Rapid.actionConnect(['a', 'd'])(graph);
        expect(graph.entity('-').nodes).to.eql(['d', 'b', 'c', 'd']);
    });

    it('merges adjacent nodes', function() {
        // a --- b --- c
        //
        // Connect [b, c]
        //
        // Expected result:
        //
        // a --- c
        //
        var graph = new Rapid.Graph([
            Rapid.osmNode({id: 'a'}),
            Rapid.osmNode({id: 'b'}),
            Rapid.osmNode({id: 'c'}),
            Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c']})
        ]);

        graph = Rapid.actionConnect(['b', 'c'])(graph);
        expect(graph.entity('-').nodes).to.eql(['a', 'c']);
        expect(graph.hasEntity('b')).to.be.undefined;
    });

    it('merges adjacent nodes with connections', function() {
        // a --- b --- c
        //       |
        //       d
        //
        // Connect [b, c]
        //
        // Expected result:
        //
        // a --- c
        //       |
        //       d
        //
        var graph = new Rapid.Graph([
            Rapid.osmNode({id: 'a'}),
            Rapid.osmNode({id: 'b'}),
            Rapid.osmNode({id: 'c'}),
            Rapid.osmNode({id: 'c'}),
            Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c']}),
            Rapid.osmWay({id: '|', nodes: ['b', 'd']})
        ]);

        graph = Rapid.actionConnect(['b', 'c'])(graph);
        expect(graph.entity('-').nodes).to.eql(['a', 'c']);
        expect(graph.entity('|').nodes).to.eql(['c', 'd']);
        expect(graph.hasEntity('b')).to.be.undefined;
    });

    it('deletes a degenerate way', function() {
        // a --- b
        //
        // Connect [a, b]
        //
        var graph = new Rapid.Graph([
            Rapid.osmNode({id: 'a'}),
            Rapid.osmNode({id: 'b'}),
            Rapid.osmWay({id: '-', nodes: ['a', 'b']})
        ]);

        graph = Rapid.actionConnect(['a', 'b'])(graph);
        expect(graph.hasEntity('a')).to.be.undefined;
        expect(graph.hasEntity('-')).to.be.undefined;
    });

    it('merges tags to the surviving node', function() {
        var graph = new Rapid.Graph([
            Rapid.osmNode({id: 'a', tags: {a: 'a'}}),
            Rapid.osmNode({id: 'b', tags: {b: 'b'}}),
            Rapid.osmNode({id: 'c', tags: {c: 'c'}})
        ]);

        graph = Rapid.actionConnect(['a', 'b', 'c'])(graph);
        expect(graph.entity('c').tags).to.eql({a: 'a', b: 'b', c: 'c'});
    });

    it('merges memberships to the surviving node', function() {
        var graph = new Rapid.Graph([
            Rapid.osmNode({id: 'a'}),
            Rapid.osmNode({id: 'b'}),
            Rapid.osmNode({id: 'c'}),
            Rapid.osmNode({id: 'c'}),
            Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
            Rapid.osmWay({id: '=', nodes: ['c', 'd']}),
            Rapid.osmRelation({id: 'r1', members: [{id: 'b', role: 'r1', type: 'node'}]}),
            Rapid.osmRelation({id: 'r2', members: [{id: 'b', role: 'r2', type: 'node'}, {id: 'c', role: 'r2', type: 'node'}]})
        ]);

        graph = Rapid.actionConnect(['b', 'c'])(graph);
        expect(graph.entity('r1').members).to.eql([{id: 'c', role: 'r1', type: 'node'}]);
        expect(graph.entity('r2').members).to.eql([{id: 'c', role: 'r2', type: 'node'}]);
    });


    it('#disabled', function () {
        it('returns falsy when connecting members of the same relation and same roles', function () {
            var graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a'}),
                Rapid.osmNode({id: 'b'}),
                Rapid.osmNode({id: 'c'}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c']}),
                Rapid.osmRelation({id: 'r1', members: [
                    { id: 'b', type: 'node', role: 'foo' },
                    { id: 'c', type: 'node', role: 'foo' }
                ]})
            ]);

            expect(Rapid.actionConnect(['b', 'c']).disabled(graph)).to.be.not.ok;
        });

        it('returns falsy when connecting members of different relation and different roles', function () {
            var graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a'}),
                Rapid.osmNode({id: 'b'}),
                Rapid.osmNode({id: 'c'}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c']}),
                Rapid.osmRelation({id: 'r1', members: [{ id: 'b', type: 'node', role: 'foo' } ]}),
                Rapid.osmRelation({id: 'r2', members: [{ id: 'c', type: 'node', role: 'bar' } ]})
            ]);

            expect(Rapid.actionConnect(['b', 'c']).disabled(graph)).to.be.not.ok;
        });

        it('returns \'relation\' when connecting members of the same relation but different roles', function () {
            var graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a'}),
                Rapid.osmNode({id: 'b'}),
                Rapid.osmNode({id: 'c'}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c']}),
                Rapid.osmRelation({id: 'r1', members: [
                    { id: 'b', type: 'node', role: 'foo' },
                    { id: 'c', type: 'node', role: 'bar' }
                ]})
            ]);

            expect(Rapid.actionConnect(['b', 'c']).disabled(graph)).to.eql('relation');
        });

        it('returns falsy when connecting a node unrelated to the restriction', function () {
            //
            //  a --- b   d ~~~ e        r1:  `no_right_turn`
            //        |                        FROM '-'
            //        |                        VIA  'b'
            //        c                        TO   '|'
            //
            var graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a'}),
                Rapid.osmNode({id: 'b'}),
                Rapid.osmNode({id: 'c'}),
                Rapid.osmNode({id: 'd'}),
                Rapid.osmNode({id: 'e'}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
                Rapid.osmWay({id: '|', nodes: ['b', 'c']}),
                Rapid.osmWay({id: '~', nodes: ['d', 'e']}),
                Rapid.osmRelation({id: 'r1', tags: { type: 'restriction', restriction: 'no_right_turn' }, members: [
                    { id: '-', type: 'way', role: 'from' },
                    { id: 'b', type: 'node', role: 'via' },
                    { id: '|', type: 'way', role: 'to' }
                ]})
            ]);

            expect(Rapid.actionConnect(['a', 'd']).disabled(graph)).to.be.not.ok;
            expect(Rapid.actionConnect(['b', 'd']).disabled(graph)).to.be.not.ok;
            expect(Rapid.actionConnect(['c', 'd']).disabled(graph)).to.be.not.ok;
        });

        it('returns falsy when connecting nodes that would not break a via-node restriction', function () {
            //
            //  a --- b --- c      r1:  `no_right_turn`
            //              |            FROM '-'
            //              d            VIA  'c'
            //              |            TO   '|'
            //              e
            //
            var graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a'}),
                Rapid.osmNode({id: 'b'}),
                Rapid.osmNode({id: 'c'}),
                Rapid.osmNode({id: 'd'}),
                Rapid.osmNode({id: 'e'}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c']}),
                Rapid.osmWay({id: '|', nodes: ['c', 'd', 'e']}),
                Rapid.osmRelation({id: 'r1', tags: { type: 'restriction', restriction: 'no_right_turn' }, members: [
                    { id: '-', type: 'way', role: 'from' },
                    { id: 'c', type: 'node', role: 'via' },
                    { id: '|', type: 'way', role: 'to' }
                ]})
            ]);

            // allowed: adjacent connections that don't destroy a way
            expect(Rapid.actionConnect(['a', 'b']).disabled(graph)).to.be.not.ok;
            expect(Rapid.actionConnect(['b', 'c']).disabled(graph)).to.be.not.ok;
            expect(Rapid.actionConnect(['c', 'd']).disabled(graph)).to.be.not.ok;
            expect(Rapid.actionConnect(['d', 'e']).disabled(graph)).to.be.not.ok;
        });

        it('returns falsy when connecting nodes that would not break a via-way restriction', function () {
            //
            //  a --- b --- c      r1:  `no_u_turn`
            //              |            FROM '='
            //              d            VIA  '|'
            //              |            TO   '-'
            //  g === f === e
            //
            var graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a'}),
                Rapid.osmNode({id: 'b'}),
                Rapid.osmNode({id: 'c'}),
                Rapid.osmNode({id: 'd'}),
                Rapid.osmNode({id: 'e'}),
                Rapid.osmNode({id: 'f'}),
                Rapid.osmNode({id: 'g'}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c']}),
                Rapid.osmWay({id: '|', nodes: ['c', 'd', 'e']}),
                Rapid.osmWay({id: '=', nodes: ['e', 'f', 'g']}),
                Rapid.osmRelation({id: 'r1', tags: { type: 'restriction', restriction: 'no_u_turn' }, members: [
                    { id: '=', type: 'way', role: 'from' },
                    { id: '|', type: 'way', role: 'via' },
                    { id: '-', type: 'way', role: 'to' }
                ]})
            ]);

            // allowed: adjacent connections that don't destroy a way
            expect(Rapid.actionConnect(['a', 'b']).disabled(graph)).to.be.not.ok;
            expect(Rapid.actionConnect(['b', 'c']).disabled(graph)).to.be.not.ok;
            expect(Rapid.actionConnect(['c', 'd']).disabled(graph)).to.be.not.ok;
            expect(Rapid.actionConnect(['d', 'e']).disabled(graph)).to.be.not.ok;
            expect(Rapid.actionConnect(['e', 'f']).disabled(graph)).to.be.not.ok;
            expect(Rapid.actionConnect(['f', 'g']).disabled(graph)).to.be.not.ok;
        });

        it('returns \'restriction\' when connecting nodes that would break a via-node restriction', function () {
            //
            //  a --- b --- c      r1:  `no_right_turn`
            //              |            FROM '-'
            //              d            VIA  'c'
            //              |            TO   '|'
            //              e
            //
            var graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a'}),
                Rapid.osmNode({id: 'b'}),
                Rapid.osmNode({id: 'c'}),
                Rapid.osmNode({id: 'd'}),
                Rapid.osmNode({id: 'e'}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c']}),
                Rapid.osmWay({id: '|', nodes: ['c', 'd', 'e']}),
                Rapid.osmRelation({id: 'r1', tags: { type: 'restriction', restriction: 'no_right_turn' }, members: [
                    { id: '-', type: 'way', role: 'from' },
                    { id: 'c', type: 'node', role: 'via' },
                    { id: '|', type: 'way', role: 'to' }
                ]})
            ]);

            // prevented:
            // extra connections to the VIA node, or any connections between distinct FROM and TO
            expect(Rapid.actionConnect(['a', 'c']).disabled(graph)).to.eql('restriction', 'extra connection FROM-VIA');
            expect(Rapid.actionConnect(['e', 'c']).disabled(graph)).to.eql('restriction', 'extra connection TO-VIA');
            expect(Rapid.actionConnect(['b', 'd']).disabled(graph)).to.eql('restriction', 'extra connection FROM-TO');
        });

        it('returns falsy when connecting nodes on a via-node u_turn restriction', function () {
            //
            //  a --- b --- c      r1:  `no_u_turn`
            //              |            FROM '-'
            //              d            VIA  'c'
            //              |            TO   '-'
            //              e
            //
            var graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a'}),
                Rapid.osmNode({id: 'b'}),
                Rapid.osmNode({id: 'c'}),
                Rapid.osmNode({id: 'd'}),
                Rapid.osmNode({id: 'e'}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c']}),
                Rapid.osmWay({id: '|', nodes: ['c', 'd', 'e']}),
                Rapid.osmRelation({id: 'r1', tags: { type: 'restriction', restriction: 'no_u_turn' }, members: [
                    { id: '-', type: 'way', role: 'from' },
                    { id: 'c', type: 'node', role: 'via' },
                    { id: '-', type: 'way', role: 'to' }
                ]})
            ]);

            // The u-turn case is one where a connection between FROM-TO should be allowed
            expect(Rapid.actionConnect(['a', 'b']).disabled(graph)).to.be.not.ok;
            expect(Rapid.actionConnect(['b', 'c']).disabled(graph)).to.be.not.ok;
        });

        it('returns \'restriction\' when connecting nodes that would break a via-way restriction', function () {
            //
            //  a --- b --- c      r1:  `no_u_turn`
            //              |            FROM '='
            //              d            VIA  '|'
            //              |            TO   '-'
            //  g === f === e
            //
            var graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a'}),
                Rapid.osmNode({id: 'b'}),
                Rapid.osmNode({id: 'c'}),
                Rapid.osmNode({id: 'd'}),
                Rapid.osmNode({id: 'e'}),
                Rapid.osmNode({id: 'f'}),
                Rapid.osmNode({id: 'g'}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c']}),
                Rapid.osmWay({id: '|', nodes: ['c', 'd', 'e']}),
                Rapid.osmWay({id: '=', nodes: ['e', 'f', 'g']}),
                Rapid.osmRelation({id: 'r1', tags: { type: 'restriction', restriction: 'no_u_turn' }, members: [
                    { id: '=', type: 'way', role: 'from' },
                    { id: '|', type: 'way', role: 'via' },
                    { id: '-', type: 'way', role: 'to' }
                ]})
            ]);

            // prevented:
            // extra connections to any node along VIA way
            expect(Rapid.actionConnect(['a', 'c']).disabled(graph)).to.eql('restriction', 'extra connection TO-VIA c');
            expect(Rapid.actionConnect(['b', 'd']).disabled(graph)).to.eql('restriction', 'extra connection TO-VIA d');
            expect(Rapid.actionConnect(['b', 'e']).disabled(graph)).to.eql('restriction', 'extra connection TO-VIA e');
            expect(Rapid.actionConnect(['c', 'e']).disabled(graph)).to.eql('restriction', 'extra connection VIA-VIA');
            expect(Rapid.actionConnect(['f', 'c']).disabled(graph)).to.eql('restriction', 'extra connection FROM-VIA c');
            expect(Rapid.actionConnect(['f', 'd']).disabled(graph)).to.eql('restriction', 'extra connection FROM-VIA d');
            expect(Rapid.actionConnect(['g', 'e']).disabled(graph)).to.eql('restriction', 'extra connection FROM-VIA e');
        });

        it('returns \'restriction\' when connecting would destroy a way in a via-node restriction', function () {
            //
            //  a --- b      r1:  `no_right_turn`
            //        |            FROM '-'
            //        |            VIA  'b'
            //        c            TO   '|'
            //
            var graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a'}),
                Rapid.osmNode({id: 'b'}),
                Rapid.osmNode({id: 'c'}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
                Rapid.osmWay({id: '|', nodes: ['b', 'c']}),
                Rapid.osmRelation({id: 'r1', tags: { type: 'restriction', restriction: 'no_right_turn' }, members: [
                    { id: '-', type: 'way', role: 'from' },
                    { id: 'b', type: 'node', role: 'via' },
                    { id: '|', type: 'way', role: 'to' }
                ]})
            ]);

            expect(Rapid.actionConnect(['a', 'b']).disabled(graph)).to.eql('restriction', 'destroy FROM');
            expect(Rapid.actionConnect(['b', 'c']).disabled(graph)).to.eql('restriction', 'destroy TO');
        });

        it('returns \'restriction\' when connecting would destroy a way in via-way restriction', function () {
            //
            //  a --- b      r1:  `no_u_turn`
            //        |            FROM '='
            //        |            VIA  '|'
            //  d === c            TO   '-'
            //
            var graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a'}),
                Rapid.osmNode({id: 'b'}),
                Rapid.osmNode({id: 'c'}),
                Rapid.osmNode({id: 'd'}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
                Rapid.osmWay({id: '|', nodes: ['b', 'c']}),
                Rapid.osmWay({id: '=', nodes: ['c', 'd']}),
                Rapid.osmRelation({id: 'r1', tags: { type: 'restriction', restriction: 'no_u_turn' }, members: [
                    { id: '=', type: 'way', role: 'from' },
                    { id: '|', type: 'way', role: 'via' },
                    { id: '-', type: 'way', role: 'to' }
                ]})
            ]);

            expect(Rapid.actionConnect(['a', 'b']).disabled(graph)).to.eql('restriction', 'destroy TO');
            expect(Rapid.actionConnect(['b', 'c']).disabled(graph)).to.eql('restriction', 'destroy VIA');
            expect(Rapid.actionConnect(['c', 'd']).disabled(graph)).to.eql('restriction', 'destroy FROM');
        });

    });
});
