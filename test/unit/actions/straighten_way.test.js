import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';

const it = function() {};  // remove
const expect = function() {};  // remove

test.todo('actionStraightenWay', async t => {
    var projection = new Rapid.sdk.Projection();

    it('#disabled', function () {
        it('returns falsy for ways with internal nodes near centerline', function () {
            var graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [0, 0]}),
                Rapid.osmNode({id: 'b', loc: [1, 0.01]}),
                Rapid.osmNode({id: 'c', loc: [2, 0]}),
                Rapid.osmNode({id: 'd', loc: [3, 0]}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd']})
            ]);
            expect(Rapid.actionStraightenWay(['-'], projection).disabled(graph)).not.to.be.ok;
        });

        it('returns \'too_bendy\' for ways with internal nodes far off centerline', function () {
            var graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [0, 0]}),
                Rapid.osmNode({id: 'b', loc: [1, 1]}),
                Rapid.osmNode({id: 'c', loc: [2, 0]}),
                Rapid.osmNode({id: 'd', loc: [3, 0]}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd']})
            ]);
            expect(Rapid.actionStraightenWay(['-'], projection).disabled(graph)).to.equal('too_bendy');
        });

        it('returns \'too_bendy\' for ways with coincident start/end nodes', function () {
            var graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [0, 0]}),
                Rapid.osmNode({id: 'b', loc: [1, 0]}),
                Rapid.osmNode({id: 'c', loc: [2, 0]}),
                Rapid.osmNode({id: 'd', loc: [0, 0]}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd']})
            ]);
            expect(Rapid.actionStraightenWay(['-'], projection).disabled(graph)).to.equal('too_bendy');
        });
    });


    it('deletes empty nodes', function() {
        var graph = new Rapid.Graph([
            Rapid.osmNode({id: 'a', loc: [0, 0]}),
            Rapid.osmNode({id: 'b', loc: [1, 0.01], tags: {}}),
            Rapid.osmNode({id: 'c', loc: [2, 0]}),
            Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c']})
        ]);

        graph = Rapid.actionStraightenWay(['-'], projection)(graph);
        expect(graph.entity('-').nodes).to.eql(['a', 'c']);
        expect(graph.hasEntity('b')).to.eq(undefined);
    });

    it('does not delete tagged nodes', function() {
       var graph = new Rapid.Graph([
            Rapid.osmNode({id: 'a', loc: [0, 0]}),
            Rapid.osmNode({id: 'b', loc: [1, 0.01], tags: {foo: 'bar'}}),
            Rapid.osmNode({id: 'c', loc: [2, 0]}),
            Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c']})
        ]);

        graph = Rapid.actionStraightenWay(['-'], projection)(graph);
        expect(graph.entity('-').nodes).to.eql(['a', 'b', 'c']);
        expect(graph.entity('b').loc[0]).to.be.closeTo(1, 1e-6);
        expect(graph.entity('b').loc[1]).to.be.closeTo(0, 1e-6);
    });

    it('does not delete nodes connected to other ways', function() {
        var graph = new Rapid.Graph([
            Rapid.osmNode({id: 'a', loc: [0, 0]}),
            Rapid.osmNode({id: 'b', loc: [1, 0.01]}),
            Rapid.osmNode({id: 'c', loc: [2, 0]}),
            Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c']}),
            Rapid.osmWay({id: '=', nodes: ['b']})
        ]);

        graph = Rapid.actionStraightenWay(['-'], projection)(graph);
        expect(graph.entity('-').nodes).to.eql(['a', 'b', 'c']);
        expect(graph.entity('b').loc[0]).to.be.closeTo(1, 1e-6);
        expect(graph.entity('b').loc[1]).to.be.closeTo(0, 1e-6);
    });

    it('straightens multiple, connected ways', function() {
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

        graph = Rapid.actionStraightenWay(['-', '--'], projection)(graph);
        expect(graph.entity('-').nodes).to.eql(['a', 'b', 'd']);
        expect(graph.entity('--').nodes).to.eql(['d', 'f', 'h']);
        expect(graph.entity('f').loc[0]).to.be.closeTo(5, 1e-6);
        expect(graph.entity('f').loc[1]).to.be.closeTo(0, 1e-6);
        expect(graph.hasEntity('g')).to.eq(undefined);
    });

    it('straightens multiple, connected ways going in different directions', function() {
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

        graph = Rapid.actionStraightenWay(['-', '--'], projection)(graph);
        expect(graph.entity('-').nodes).to.eql(['a', 'b', 'd']);
        expect(graph.entity('--').nodes).to.eql(['h', 'f', 'd']);
        expect(graph.entity('f').loc[0]).to.be.closeTo(5, 1e-6);
        expect(graph.entity('f').loc[1]).to.be.closeTo(0, 1e-6);
        expect(graph.hasEntity('g')).to.eq(undefined);
    });

    it('transitions', function () {
        it('is transitionable', function() {
            expect(Rapid.actionStraightenWay().transitionable).to.be.true;
        });

        it('straighten at t = 0', function() {
           var graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [0, 0]}),
                Rapid.osmNode({id: 'b', loc: [1, 0.01], tags: {foo: 'bar'}}),
                Rapid.osmNode({id: 'c', loc: [2, -0.01]}),
                Rapid.osmNode({id: 'd', loc: [3, 0]}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd']})
            ]);

            graph = Rapid.actionStraightenWay(['-'], projection)(graph, 0);
            expect(graph.entity('-').nodes).to.eql(['a', 'b', 'c', 'd']);
            expect(graph.entity('b').loc[0]).to.be.closeTo(1, 1e-6);
            expect(graph.entity('b').loc[1]).to.be.closeTo(0.01, 1e-6);
            expect(graph.entity('c').loc[0]).to.be.closeTo(2, 1e-6);
            expect(graph.entity('c').loc[1]).to.be.closeTo(-0.01, 1e-6);
        });

        it('straighten at t = 0.5', function() {
           var graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [0, 0]}),
                Rapid.osmNode({id: 'b', loc: [1, 0.01], tags: {foo: 'bar'}}),
                Rapid.osmNode({id: 'c', loc: [2, -0.01]}),
                Rapid.osmNode({id: 'd', loc: [3, 0]}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd']})
            ]);

            graph = Rapid.actionStraightenWay(['-'], projection)(graph, 0.5);
            expect(graph.entity('-').nodes).to.eql(['a', 'b', 'c', 'd']);
            expect(graph.entity('b').loc[0]).to.be.closeTo(1, 1e-6);
            expect(graph.entity('b').loc[1]).to.be.closeTo(0.005, 1e-6);
            expect(graph.entity('c').loc[0]).to.be.closeTo(2, 1e-6);
            expect(graph.entity('c').loc[1]).to.be.closeTo(-0.005, 1e-6);
        });

        it('straighten at t = 1', function() {
           var graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [0, 0]}),
                Rapid.osmNode({id: 'b', loc: [1, 0.01], tags: {foo: 'bar'}}),
                Rapid.osmNode({id: 'c', loc: [2, -0.01]}),
                Rapid.osmNode({id: 'd', loc: [3, 0]}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd']})
            ]);

            graph = Rapid.actionStraightenWay(['-'], projection)(graph, 1);
            expect(graph.entity('-').nodes).to.eql(['a', 'b', 'd']);
            expect(graph.entity('b').loc[0]).to.be.closeTo(1, 1e-6);
            expect(graph.entity('b').loc[1]).to.be.closeTo(0, 1e-6);
            expect(graph.hasEntity('c')).to.eq(undefined);
        });
    });

});
