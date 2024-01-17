import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';

const it = function() {};  // remove
const expect = function() {};  // remove

test.todo('actionJoin', async t => {
    it('#disabled', function () {
        it('returns falsy for ways that share an end/start node', function () {
            // a --> b ==> c
            var graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [0,0]}),
                Rapid.osmNode({id: 'b', loc: [2,0]}),
                Rapid.osmNode({id: 'c', loc: [4,0]}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
                Rapid.osmWay({id: '=', nodes: ['b', 'c']})
            ]);

            expect(Rapid.actionJoin(['-', '=']).disabled(graph)).not.to.be.ok;
        });

        it('returns falsy for ways that share a start/end node', function () {
            // a <-- b <== c
            var graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [0,0]}),
                Rapid.osmNode({id: 'b', loc: [2,0]}),
                Rapid.osmNode({id: 'c', loc: [4,0]}),
                Rapid.osmWay({id: '-', nodes: ['b', 'a']}),
                Rapid.osmWay({id: '=', nodes: ['c', 'b']})
            ]);

            expect(Rapid.actionJoin(['-', '=']).disabled(graph)).not.to.be.ok;
        });

        it('returns falsy for ways that share a start/start node', function () {
            // a <-- b ==> c
            var graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [0,0]}),
                Rapid.osmNode({id: 'b', loc: [2,0]}),
                Rapid.osmNode({id: 'c', loc: [4,0]}),
                Rapid.osmWay({id: '-', nodes: ['b', 'a']}),
                Rapid.osmWay({id: '=', nodes: ['b', 'c']})
            ]);

            expect(Rapid.actionJoin(['-', '=']).disabled(graph)).not.to.be.ok;
        });

        it('returns falsy for ways that share an end/end node', function () {
            // a --> b <== c
            var graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [0,0]}),
                Rapid.osmNode({id: 'b', loc: [2,0]}),
                Rapid.osmNode({id: 'c', loc: [4,0]}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
                Rapid.osmWay({id: '=', nodes: ['c', 'b']})
            ]);

            expect(Rapid.actionJoin(['-', '=']).disabled(graph)).not.to.be.ok;
        });

        it('returns falsy for more than two ways when connected, regardless of order', function () {
            // a --> b ==> c ~~> d
            var graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [0,0]}),
                Rapid.osmNode({id: 'b', loc: [2,0]}),
                Rapid.osmNode({id: 'c', loc: [4,0]}),
                Rapid.osmNode({id: 'd', loc: [6,0]}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
                Rapid.osmWay({id: '=', nodes: ['b', 'c']}),
                Rapid.osmWay({id: '~', nodes: ['c', 'd']})
            ]);

            expect(Rapid.actionJoin(['-', '=', '~']).disabled(graph)).not.to.be.ok;
            expect(Rapid.actionJoin(['-', '~', '=']).disabled(graph)).not.to.be.ok;
            expect(Rapid.actionJoin(['=', '-', '~']).disabled(graph)).not.to.be.ok;
            expect(Rapid.actionJoin(['=', '~', '-']).disabled(graph)).not.to.be.ok;
            expect(Rapid.actionJoin(['~', '=', '-']).disabled(graph)).not.to.be.ok;
            expect(Rapid.actionJoin(['~', '-', '=']).disabled(graph)).not.to.be.ok;
        });

        it('returns \'not_eligible\' for non-line geometries', function () {
            var graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [0,0]})
            ]);

            expect(Rapid.actionJoin(['a']).disabled(graph)).to.equal('not_eligible');
        });

        it('returns \'not_adjacent\' for ways that don\'t share the necessary nodes', function () {
            // a -- b -- c
            //      |
            //      d
            var graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [0,0]}),
                Rapid.osmNode({id: 'b', loc: [2,0]}),
                Rapid.osmNode({id: 'c', loc: [4,0]}),
                Rapid.osmNode({id: 'd', loc: [2,2]}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c']}),
                Rapid.osmWay({id: '=', nodes: ['b', 'd']})
            ]);

            expect(Rapid.actionJoin(['-', '=']).disabled(graph)).to.equal('not_adjacent');
        });

        ['restriction', 'connectivity'].forEach(function (type) {
            it('returns ' + type + ' in situations where a ' + type + 'relation would be damaged (a)', function () {
                // a --> b ==> c
                // from: -
                // to: =
                // via: b
                var graph = new Rapid.Graph([
                    Rapid.osmNode({id: 'a', loc: [0,0]}),
                    Rapid.osmNode({id: 'b', loc: [2,0]}),
                    Rapid.osmNode({id: 'c', loc: [4,0]}),
                    Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
                    Rapid.osmWay({id: '=', nodes: ['b', 'c']}),
                    Rapid.osmRelation({id: 'r', tags: {'type': type}, members: [
                        {type: 'way', id: '-', role: 'from'},
                        {type: 'way', id: '=', role: 'to'},
                        {type: 'node', id: 'b', role: 'via'}
                    ]})
                ]);

                expect(Rapid.actionJoin(['-', '=']).disabled(graph)).to.equal(type);
            });

            it('returns ' + type + ' in situations where a ' + type + 'relation would be damaged (b)', function () {
                // a --> b ==> c
                //       |
                //       d
                // from: -
                // to: |
                // via: b
                var graph = new Rapid.Graph([
                    Rapid.osmNode({id: 'a', loc: [0,0]}),
                    Rapid.osmNode({id: 'b', loc: [2,0]}),
                    Rapid.osmNode({id: 'c', loc: [4,0]}),
                    Rapid.osmNode({id: 'd', loc: [2,2]}),
                    Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
                    Rapid.osmWay({id: '=', nodes: ['b', 'c']}),
                    Rapid.osmWay({id: '|', nodes: ['b', 'd']}),
                    Rapid.osmRelation({id: 'r', tags: {'type': type}, members: [
                        {type: 'way', id: '-', role: 'from'},
                        {type: 'way', id: '|', role: 'to'},
                        {type: 'node', id: 'b', role: 'via'}
                    ]})
                ]);

                expect(Rapid.actionJoin(['-', '=']).disabled(graph)).to.equal(type);
            });

            it('returns falsy in situations where a '+ type + 'relation wouldn\'t be damaged (a)', function () {
                // a --> b ==> c
                // |
                // d
                // from: -
                // to: |
                // via: a
                var graph = new Rapid.Graph([
                    Rapid.osmNode({id: 'a', loc: [0,0]}),
                    Rapid.osmNode({id: 'b', loc: [2,0]}),
                    Rapid.osmNode({id: 'c', loc: [4,0]}),
                    Rapid.osmNode({id: 'd', loc: [0,2]}),
                    Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
                    Rapid.osmWay({id: '=', nodes: ['b', 'c']}),
                    Rapid.osmWay({id: '|', nodes: ['a', 'd']}),
                    Rapid.osmRelation({id: 'r', tags: {'type': type}, members: [
                        {type: 'way', id: '-', role: 'from'},
                        {type: 'way', id: '|', role: 'to'},
                        {type: 'node', id: 'a', role: 'via'}
                    ]})
                ]);

                expect(Rapid.actionJoin(['-', '=']).disabled(graph)).not.to.be.ok;
            });

            it('returns falsy in situations where a ' + type + 'restriction wouldn\'t be damaged (b)', function () {
                //       d
                //       |
                // a --> b ==> c
                //       \
                //        e
                // from: |
                // to: \
                // via: b
                var graph = new Rapid.Graph([
                    Rapid.osmNode({id: 'a', loc: [0,0]}),
                    Rapid.osmNode({id: 'b', loc: [2,0]}),
                    Rapid.osmNode({id: 'c', loc: [4,0]}),
                    Rapid.osmNode({id: 'd', loc: [2,-2]}),
                    Rapid.osmNode({id: 'e', loc: [3,2]}),
                    Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
                    Rapid.osmWay({id: '=', nodes: ['b', 'c']}),
                    Rapid.osmWay({id: '|', nodes: ['d', 'b']}),
                    Rapid.osmWay({id: '\\', nodes: ['b', 'e']}),
                    Rapid.osmRelation({id: 'r', tags: {'type': type}, members: [
                        {type: 'way', id: '|', role: 'from'},
                        {type: 'way', id: '\\', role: 'to'},
                        {type: 'node', id: 'b', role: 'via'}
                    ]})
                ]);

                expect(Rapid.actionJoin(['-', '=']).disabled(graph)).not.to.be.ok;
            });
        });

        it('returns \'conflicting_relations\' when a relation would be extended', function () {
            // a --> b ==> c
            // members: -
            // not member: =
            var graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [0,0]}),
                Rapid.osmNode({id: 'b', loc: [2,0]}),
                Rapid.osmNode({id: 'c', loc: [4,0]}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
                Rapid.osmWay({id: '=', nodes: ['b', 'c']}),
                Rapid.osmRelation({id: 'r', tags: {}, members: [
                        {type: 'way', id: '-'},
                    ]})
            ]);

            expect(Rapid.actionJoin(['-', '=']).disabled(graph)).to.equal('conflicting_relations');
        });

        it('returns \'conflicting_relations\' when a relation would be forked', function () {
            // a --> b ==> c
            //       |
            //       d
            // members: -, =
            // not member: |
            var graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [0,0]}),
                Rapid.osmNode({id: 'b', loc: [2,0]}),
                Rapid.osmNode({id: 'c', loc: [4,0]}),
                Rapid.osmNode({id: 'd', loc: [2,2]}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
                Rapid.osmWay({id: '=', nodes: ['b', 'c']}),
                Rapid.osmWay({id: '|', nodes: ['b', 'd']}),
                Rapid.osmRelation({id: 'r', tags: {}, members: [
                    {type: 'way', id: '-'},
                    {type: 'way', id: '='},
                ]})
            ]);

            expect(Rapid.actionJoin(['-', '|']).disabled(graph)).to.equal('conflicting_relations');
        });

        it('returns \'paths_intersect\' if resulting way intersects itself', function () {
            //   d
            //   |
            // a ---b
            //   |  /
            //   | /
            //   c
            var graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [0,0]}),
                Rapid.osmNode({id: 'b', loc: [0,10]}),
                Rapid.osmNode({id: 'c', loc: [5,5]}),
                Rapid.osmNode({id: 'd', loc: [-5,5]}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c']}),
                Rapid.osmWay({id: '=', nodes: ['c', 'd']}),
            ]);

            expect(Rapid.actionJoin(['-', '=']).disabled(graph)).to.equal('paths_intersect');
        });

        it('returns \'conflicting_tags\' for two entities that have conflicting tags', function () {
            var graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [0,0]}),
                Rapid.osmNode({id: 'b', loc: [2,0]}),
                Rapid.osmNode({id: 'c', loc: [4,0]}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b'], tags: {highway: 'primary'}}),
                Rapid.osmWay({id: '=', nodes: ['b', 'c'], tags: {highway: 'secondary'}})
            ]);

            expect(Rapid.actionJoin(['-', '=']).disabled(graph)).to.equal('conflicting_tags');
        });

        it('takes tag reversals into account when calculating conflicts', function () {
            var graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [0,0]}),
                Rapid.osmNode({id: 'b', loc: [2,0]}),
                Rapid.osmNode({id: 'c', loc: [4,0]}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b'], tags: {'oneway': 'yes'}}),
                Rapid.osmWay({id: '=', nodes: ['c', 'b'], tags: {'oneway': '-1'}})
            ]);

            expect(Rapid.actionJoin(['-', '=']).disabled(graph)).not.to.be.ok;
        });

        it('returns falsy for exceptions to tag conflicts: missing tag', function () {
            var graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [0,0]}),
                Rapid.osmNode({id: 'b', loc: [2,0]}),
                Rapid.osmNode({id: 'c', loc: [4,0]}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b'], tags: {highway: 'primary'}}),
                Rapid.osmWay({id: '=', nodes: ['b', 'c'], tags: {}})
            ]);

            expect(Rapid.actionJoin(['-', '=']).disabled(graph)).not.to.be.ok;
        });

        it('returns falsy for exceptions to tag conflicts: uninteresting tag', function () {
            var graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [0,0]}),
                Rapid.osmNode({id: 'b', loc: [2,0]}),
                Rapid.osmNode({id: 'c', loc: [4,0]}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b'], tags: {'tiger:cfcc': 'A41'}}),
                Rapid.osmWay({id: '=', nodes: ['b', 'c'], tags: {'tiger:cfcc': 'A42'}})
            ]);

            expect(Rapid.actionJoin(['-', '=']).disabled(graph)).not.to.be.ok;
        });
    });

    it('joins a --> b ==> c', function () {
        // Expected result:
        // a --> b --> c
        var graph = new Rapid.Graph([
            Rapid.osmNode({id: 'a', loc: [0,0]}),
            Rapid.osmNode({id: 'b', loc: [2,0]}),
            Rapid.osmNode({id: 'c', loc: [4,0]}),
            Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
            Rapid.osmWay({id: '=', nodes: ['b', 'c']})
        ]);

        graph = Rapid.actionJoin(['-', '='])(graph);

        expect(graph.entity('-').nodes).to.eql(['a', 'b', 'c']);
        expect(graph.hasEntity('=')).to.be.undefined;
    });

    it('joins a <-- b <== c', function () {
        // Expected result:
        // a <-- b <-- c
        var graph = new Rapid.Graph([
            Rapid.osmNode({id: 'a', loc: [0,0]}),
            Rapid.osmNode({id: 'b', loc: [2,0]}),
            Rapid.osmNode({id: 'c', loc: [4,0]}),
            Rapid.osmWay({id: '-', nodes: ['b', 'a']}),
            Rapid.osmWay({id: '=', nodes: ['c', 'b']})
        ]);

        graph = Rapid.actionJoin(['-', '='])(graph);
        expect(graph.entity('-').nodes).to.eql(['c', 'b', 'a']);
        expect(graph.hasEntity('=')).to.be.undefined;
    });

    it('joins a <-- b ==> c', function () {
        // Expected result:
        // a --> b --> c
        var graph = new Rapid.Graph([
            Rapid.osmNode({id: 'a', loc: [0,0]}),
            Rapid.osmNode({id: 'b', loc: [2,0]}),
            Rapid.osmNode({id: 'c', loc: [4,0]}),
            Rapid.osmWay({id: '-', nodes: ['b', 'a'], tags: {'lanes:forward': 2}}),
            Rapid.osmWay({id: '=', nodes: ['b', 'c']})
        ]);

        graph = Rapid.actionJoin(['-', '='])(graph);

        expect(graph.entity('-').nodes).to.eql(['c', 'b', 'a']);
        expect(graph.hasEntity('=')).to.be.undefined;
        expect(graph.entity('-').tags).to.eql({'lanes:forward': 2});
    });

    it('joins a --> b <== c', function () {
        // Expected result:
        // a --> b --> c
        // tags on === reversed
        var graph = new Rapid.Graph([
            Rapid.osmNode({id: 'a', loc: [0,0]}),
            Rapid.osmNode({id: 'b', loc: [2,0]}),
            Rapid.osmNode({id: 'c', loc: [4,0]}),
            Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
            Rapid.osmWay({id: '=', nodes: ['c', 'b'], tags: {'lanes:forward': 2}})
        ]);

        graph = Rapid.actionJoin(['-', '='])(graph);

        expect(graph.entity('-').nodes).to.eql(['a', 'b', 'c']);
        expect(graph.hasEntity('=')).to.be.undefined;
        expect(graph.entity('-').tags).to.eql({'lanes:backward': 2});
    });

    it('joins a --> b <== c <++ d **> e', function () {
        // Expected result:
        // a --> b --> c --> d --> e
        // tags on === reversed
        var graph = new Rapid.Graph([
            Rapid.osmNode({id: 'a', loc: [0,0]}),
            Rapid.osmNode({id: 'b', loc: [2,0]}),
            Rapid.osmNode({id: 'c', loc: [4,0]}),
            Rapid.osmNode({id: 'd', loc: [6,0]}),
            Rapid.osmNode({id: 'e', loc: [8,0]}),
            Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
            Rapid.osmWay({id: '=', nodes: ['c', 'b'], tags: {'lanes:forward': 2}}),
            Rapid.osmWay({id: '+', nodes: ['d', 'c']}),
            Rapid.osmWay({id: '*', nodes: ['d', 'e'], tags: {'lanes:backward': 2}})
        ]);

        graph = Rapid.actionJoin(['-', '=', '+', '*'])(graph);

        expect(graph.entity('-').nodes).to.eql(['a', 'b', 'c', 'd', 'e']);
        expect(graph.hasEntity('=')).to.be.undefined;
        expect(graph.hasEntity('+')).to.be.undefined;
        expect(graph.hasEntity('*')).to.be.undefined;
        expect(graph.entity('-').tags).to.eql({'lanes:backward': 2});
    });

    it('prefers to keep existing ways', function () {
        // a --> b ==> c ++> d
        // --- is new, === is existing, +++ is new
        // Expected result:
        // a ==> b ==> c ==> d
        var graph = new Rapid.Graph([
            Rapid.osmNode({id: 'a', loc: [0,0]}),
            Rapid.osmNode({id: 'b', loc: [2,0]}),
            Rapid.osmNode({id: 'c', loc: [4,0]}),
            Rapid.osmNode({id: 'd', loc: [6,0]}),
            Rapid.osmWay({id: 'w-1', nodes: ['a', 'b']}),
            Rapid.osmWay({id: 'w1', nodes: ['b', 'c']}),
            Rapid.osmWay({id: 'w-2', nodes: ['c', 'd']})
        ]);

        graph = Rapid.actionJoin(['w-1', 'w1', 'w-2'])(graph);

        expect(graph.entity('w1').nodes).to.eql(['a', 'b', 'c', 'd']);
        expect(graph.hasEntity('w-1')).to.be.undefined;
        expect(graph.hasEntity('w-2')).to.be.undefined;
    });

    it('prefers to keep the oldest way', function () {
        // n1 ==> n2 ++> n3 --> n4
        // ==> is existing, ++> is existing, --> is new
        // Expected result:
        // n1 ==> n2 ==> n3 ==> n4
        var graph = new Rapid.Graph([
            Rapid.osmNode({ id: 'n1', loc: [0,0] }),
            Rapid.osmNode({ id: 'n2', loc: [2,0] }),
            Rapid.osmNode({ id: 'n3', loc: [4,0] }),
            Rapid.osmNode({ id: 'n4', loc: [6,0] }),
            Rapid.osmWay({ id: 'w1', nodes: ['n2', 'n3'] }),
            Rapid.osmWay({ id: 'w2', nodes: ['n1', 'n2'] }),
            Rapid.osmWay({ id: 'w-1', nodes: ['n3', 'n4'] })
        ]);

        graph = Rapid.actionJoin(['w1', 'w2', 'w-1'])(graph);

        // way 1 is the oldest (it has the lower id) so it kept that one
        expect(graph.entity('w1').nodes).to.eql(['n1', 'n2', 'n3', 'n4']);
        expect(graph.hasEntity('w2')).to.be.undefined;
        expect(graph.hasEntity('w-1')).to.be.undefined;
    });

    it('merges tags', function () {
        var graph = new Rapid.Graph([
            Rapid.osmNode({id: 'a', loc: [0,0]}),
            Rapid.osmNode({id: 'b', loc: [2,0]}),
            Rapid.osmNode({id: 'c', loc: [4,0]}),
            Rapid.osmNode({id: 'd', loc: [6,0]}),
            Rapid.osmNode({id: 'e', loc: [8,0]}),
            Rapid.osmWay({id: '-', nodes: ['a', 'b'], tags: {a: 'a', b: '-', c: 'c'}}),
            Rapid.osmWay({id: '=', nodes: ['b', 'c'], tags: {a: 'a', b: '=', d: 'd'}}),
            Rapid.osmWay({id: '+', nodes: ['c', 'd'], tags: {a: 'a', b: '=', e: 'e'}})
        ]);

        graph = Rapid.actionJoin(['-', '=', '+'])(graph);

        expect(graph.entity('-').tags).to.eql({a: 'a', b: '-;=', c: 'c', d: 'd', e: 'e'});
    });

    it('preserves sidedness of start segment, co-directional lines', function () {
        // a -----> b =====> c
        //   v v v
        //
        //  Expected result:
        // a -----> b -----> c
        //   v v v    v v v
        //
        var graph = new Rapid.Graph([
            Rapid.osmNode({id: 'a', loc: [0,0]}),
            Rapid.osmNode({id: 'b', loc: [2,0]}),
            Rapid.osmNode({id: 'c', loc: [4,0]}),
            Rapid.osmWay({id: '-', nodes: ['a', 'b'], tags: { natural: 'cliff' }}),
            Rapid.osmWay({id: '=', nodes: ['b', 'c']})
        ]);
        graph = Rapid.actionJoin(['-', '='])(graph);
        expect(graph.entity('-').nodes).to.eql(['a', 'b', 'c']);
        expect(graph.entity('-').tags).to.eql({ natural: 'cliff' });
    });

    it('preserves sidedness of end segment, co-directional lines', function () {
        // a -----> b =====> c
        //            v v v
        //
        //  Expected result:
        // a =====> b =====> c
        //   v v v    v v v
        //
        var graph = new Rapid.Graph([
            Rapid.osmNode({id: 'a', loc: [0,0]}),
            Rapid.osmNode({id: 'b', loc: [2,0]}),
            Rapid.osmNode({id: 'c', loc: [4,0]}),
            Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
            Rapid.osmWay({id: '=', nodes: ['b', 'c'], tags: { natural: 'cliff' }})
        ]);
        graph = Rapid.actionJoin(['-', '='])(graph);
        expect(graph.entity('=').nodes).to.eql(['a', 'b', 'c']);
        expect(graph.entity('=').tags).to.eql({ natural: 'cliff' });
    });

    it('preserves sidedness of start segment, contra-directional lines', function () {
        // a -----> b <===== c
        //   v v v
        //
        //  Expected result:
        // a -----> b -----> c
        //   v v v    v v v
        //
        var graph = new Rapid.Graph([
            Rapid.osmNode({id: 'a', loc: [0,0]}),
            Rapid.osmNode({id: 'b', loc: [2,0]}),
            Rapid.osmNode({id: 'c', loc: [4,0]}),
            Rapid.osmWay({id: '-', nodes: ['a', 'b'], tags: { natural: 'cliff' }}),
            Rapid.osmWay({id: '=', nodes: ['c', 'b']})
        ]);
        graph = Rapid.actionJoin(['-', '='])(graph);
        expect(graph.entity('-').nodes).to.eql(['a', 'b', 'c']);
        expect(graph.entity('-').tags).to.eql({ natural: 'cliff' });
    });

    it('preserves sidedness of end segment, contra-directional lines', function () {
        // a -----> b <===== c
        //             v v v
        //
        //  Expected result:
        // a <===== b <===== c
        //    v v v    v v v
        //
        var graph = new Rapid.Graph([
            Rapid.osmNode({id: 'a', loc: [0,0]}),
            Rapid.osmNode({id: 'b', loc: [2,0]}),
            Rapid.osmNode({id: 'c', loc: [4,0]}),
            Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
            Rapid.osmWay({id: '=', nodes: ['c', 'b'], tags: { natural: 'cliff' }})
        ]);
        graph = Rapid.actionJoin(['-', '='])(graph);
        expect(graph.entity('=').nodes).to.eql(['c', 'b', 'a']);
        expect(graph.entity('=').tags).to.eql({ natural: 'cliff' });
    });


    it('merges relations', function () {
        var graph = new Rapid.Graph([
            Rapid.osmNode({id: 'a', loc: [0,0]}),
            Rapid.osmNode({id: 'b', loc: [2,0]}),
            Rapid.osmNode({id: 'c', loc: [4,0]}),
            Rapid.osmWay({id: '-', nodes: ['a', 'b']}),
            Rapid.osmWay({id: '=', nodes: ['b', 'c']}),
            Rapid.osmRelation({id: 'r1', members: [
                {id: '=', role: 'r1', type: 'way'}
            ]}),
            Rapid.osmRelation({id: 'r2', members: [
                {id: '=', role: 'r2', type: 'way'},
                {id: '-', role: 'r2', type: 'way'}
            ]})
        ]);

        graph = Rapid.actionJoin(['-', '='])(graph);

        expect(graph.entity('r1').members).to.eql([{id: '-', role: 'r1', type: 'way'}]);
        expect(graph.entity('r2').members).to.eql([{id: '-', role: 'r2', type: 'way'}]);
    });

    it('preserves duplicate route segments in relations', function () {
        //
        // Situation:
        //    a ---> b ===> c ~~~~> d                        join '-' and '='
        //    Relation: ['-', '=', '~', '~', '=', '-']
        //
        // Expected result:
        //    a ---> b ---> c ~~~~> d
        //    Relation: ['-', '~', '~', '-']
        //
        var graph = new Rapid.Graph([
            Rapid.osmNode({ id: 'a', loc: [0, 0] }),
            Rapid.osmNode({ id: 'b', loc: [1, 0] }),
            Rapid.osmNode({ id: 'c', loc: [2, 0] }),
            Rapid.osmNode({ id: 'd', loc: [3, 0] }),
            Rapid.osmWay({ id: '-', nodes: ['a', 'b'] }),
            Rapid.osmWay({ id: '=', nodes: ['b', 'c'] }),
            Rapid.osmWay({ id: '~', nodes: ['c', 'd'] }),
            Rapid.osmRelation({id: 'r', members: [
                {id: '-', role: 'forward', type: 'way'},
                {id: '=', role: 'forward', type: 'way'},
                {id: '~', role: 'forward', type: 'way'},
                {id: '~', role: 'forward', type: 'way'},
                {id: '=', role: 'forward', type: 'way'},
                {id: '-', role: 'forward', type: 'way'}
            ]})
        ]);

        graph = Rapid.actionJoin(['-', '='])(graph);

        expect(graph.entity('-').nodes).to.eql(['a', 'b', 'c']);
        expect(graph.entity('~').nodes).to.eql(['c', 'd']);
        expect(graph.entity('r').members).to.eql([
                {id: '-', role: 'forward', type: 'way'},
                {id: '~', role: 'forward', type: 'way'},
                {id: '~', role: 'forward', type: 'way'},
                {id: '-', role: 'forward', type: 'way'}
        ]);
    });

    it('collapses resultant single-member multipolygon into basic area', function () {
        // Situation:
        // b --> c
        // |#####|
        // |# m #|
        // |#####|
        // a <== d
        //
        //  Expected result:
        // a --> b
        // |#####|
        // |#####|
        // |#####|
        // d <-- c
        var graph = new Rapid.Graph([
            Rapid.osmNode({id: 'a', loc: [0,0]}),
            Rapid.osmNode({id: 'b', loc: [0,2]}),
            Rapid.osmNode({id: 'c', loc: [2,2]}),
            Rapid.osmNode({id: 'd', loc: [2,0]}),
            Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd']}),
            Rapid.osmWay({id: '=', nodes: ['d', 'a']}),
            Rapid.osmRelation({id: 'm', members: [
                {id: '-', role: 'outer', type: 'way'},
                {id: '=', role: 'outer', type: 'way'}
            ], tags: {
                type: 'multipolygon',
                man_made: 'pier'
            }})
        ]);

        graph = Rapid.actionJoin(['-', '='])(graph);

        expect(graph.entity('-').nodes).to.eql(['a', 'b', 'c', 'd', 'a']);
        expect(graph.entity('-').tags).to.eql({ man_made: 'pier', area: 'yes' });
        expect(graph.hasEntity('=')).to.be.undefined;
        expect(graph.hasEntity('m')).to.be.undefined;
    });

    it('does not collapse resultant single-member multipolygon into basic area when tags conflict', function () {
        // Situation:
        // b --> c
        // |#####|
        // |# m #|
        // |#####|
        // a <== d
        //
        //  Expected result:
        // a --> b
        // |#####|
        // |# m #|
        // |#####|
        // d <-- c
        var graph = new Rapid.Graph([
            Rapid.osmNode({id: 'a', loc: [0,0]}),
            Rapid.osmNode({id: 'b', loc: [0,2]}),
            Rapid.osmNode({id: 'c', loc: [2,2]}),
            Rapid.osmNode({id: 'd', loc: [2,0]}),
            Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd'], tags: { surface: 'paved' }}),
            Rapid.osmWay({id: '=', nodes: ['d', 'a']}),
            Rapid.osmRelation({id: 'm', members: [
                {id: '-', role: 'outer', type: 'way'},
                {id: '=', role: 'outer', type: 'way'}
            ], tags: {
                type: 'multipolygon',
                man_made: 'pier',
                surface: 'wood'
            }})
        ]);

        graph = Rapid.actionJoin(['-', '='])(graph);

        expect(graph.entity('-').nodes).to.eql(['a', 'b', 'c', 'd', 'a']);
        expect(graph.entity('-').tags).to.eql({ surface: 'paved' });
        expect(graph.hasEntity('=')).to.be.undefined;
        expect(graph.hasEntity('m').tags).to.eql({
            type: 'multipolygon',
            man_made: 'pier',
            surface: 'wood'
        });
    });

});
