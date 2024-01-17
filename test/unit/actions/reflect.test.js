import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';

const it = function() {};  // remove
const expect = function() {};  // remove

test.todo('actionReflect', async t => {
    var projection = new Rapid.sdk.Projection();

    it('does not create or remove nodes', function () {
        var graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [0, 0]}),
                Rapid.osmNode({id: 'b', loc: [4, 0]}),
                Rapid.osmNode({id: 'c', loc: [4, 2]}),
                Rapid.osmNode({id: 'd', loc: [1, 2]}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd', 'a']})
            ]);
        graph = Rapid.actionReflect(['-'], projection)(graph);
        expect(graph.entity('-').nodes).to.have.length(5);
    });


    it('reflects across long axis', function () {
        //
        //    d -- c      a ---- b
        //   /     |  ->   \     |
        //  a ---- b        d -- c
        //
        var graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [0, 0]}),
                Rapid.osmNode({id: 'b', loc: [4, 0]}),
                Rapid.osmNode({id: 'c', loc: [4, 2]}),
                Rapid.osmNode({id: 'd', loc: [1, 2]}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd', 'a']})
            ]);
        graph = Rapid.actionReflect(['-'], projection)(graph);
        expect(graph.entity('a').loc[0]).to.be.closeTo(0, 1e-6);
        expect(graph.entity('a').loc[1]).to.be.closeTo(2, 1e-6);
        expect(graph.entity('b').loc[0]).to.be.closeTo(4, 1e-6);
        expect(graph.entity('b').loc[1]).to.be.closeTo(2, 1e-6);
        expect(graph.entity('c').loc[0]).to.be.closeTo(4, 1e-6);
        expect(graph.entity('c').loc[1]).to.be.closeTo(0, 1e-6);
        expect(graph.entity('d').loc[0]).to.be.closeTo(1, 1e-6);
        expect(graph.entity('d').loc[1]).to.be.closeTo(0, 1e-6);
    });


    it('reflects across short axis', function () {
        //
        //    d -- c      c -- d
        //   /     |  ->  |     \
        //  a ---- b      b ---- a
        //
        var graph = new Rapid.Graph([
                Rapid.osmNode({id: 'a', loc: [0, 0]}),
                Rapid.osmNode({id: 'b', loc: [4, 0]}),
                Rapid.osmNode({id: 'c', loc: [4, 2]}),
                Rapid.osmNode({id: 'd', loc: [1, 2]}),
                Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd', 'a']})
            ]);
        graph = Rapid.actionReflect(['-'], projection).useLongAxis(false)(graph);
        expect(graph.entity('a').loc[0]).to.be.closeTo(4, 1e-6);
        expect(graph.entity('a').loc[1]).to.be.closeTo(0, 1e-6);
        expect(graph.entity('b').loc[0]).to.be.closeTo(0, 1e-6);
        expect(graph.entity('b').loc[1]).to.be.closeTo(0, 1e-6);
        expect(graph.entity('c').loc[0]).to.be.closeTo(0, 1e-6);
        expect(graph.entity('c').loc[1]).to.be.closeTo(2, 1e-6);
        expect(graph.entity('d').loc[0]).to.be.closeTo(3, 1e-6);
        expect(graph.entity('d').loc[1]).to.be.closeTo(2, 1e-6);
    });


    it('transitions', function () {
        it('is transitionable', function() {
            expect(Rapid.actionReflect().transitionable).to.be.true;
        });

        it('reflect long at t = 0', function() {
            var graph = new Rapid.Graph([
                    Rapid.osmNode({id: 'a', loc: [0, 0]}),
                    Rapid.osmNode({id: 'b', loc: [4, 0]}),
                    Rapid.osmNode({id: 'c', loc: [4, 2]}),
                    Rapid.osmNode({id: 'd', loc: [1, 2]}),
                    Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd', 'a']})
                ]);
            graph = Rapid.actionReflect(['-'], projection)(graph, 0);
            expect(graph.entity('a').loc[0]).to.be.closeTo(0, 1e-6);
            expect(graph.entity('a').loc[1]).to.be.closeTo(0, 1e-6);
            expect(graph.entity('b').loc[0]).to.be.closeTo(4, 1e-6);
            expect(graph.entity('b').loc[1]).to.be.closeTo(0, 1e-6);
            expect(graph.entity('c').loc[0]).to.be.closeTo(4, 1e-6);
            expect(graph.entity('c').loc[1]).to.be.closeTo(2, 1e-6);
            expect(graph.entity('d').loc[0]).to.be.closeTo(1, 1e-6);
            expect(graph.entity('d').loc[1]).to.be.closeTo(2, 1e-6);
        });

        it('reflect long at t = 0.5', function() {
            var graph = new Rapid.Graph([
                    Rapid.osmNode({id: 'a', loc: [0, 0]}),
                    Rapid.osmNode({id: 'b', loc: [4, 0]}),
                    Rapid.osmNode({id: 'c', loc: [4, 2]}),
                    Rapid.osmNode({id: 'd', loc: [1, 2]}),
                    Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd', 'a']})
                ]);
            graph = Rapid.actionReflect(['-'], projection)(graph, 0.5);
            expect(graph.entity('a').loc[0]).to.be.closeTo(0, 1e-6);
            expect(graph.entity('a').loc[1]).to.be.closeTo(1, 1e-6);
            expect(graph.entity('b').loc[0]).to.be.closeTo(4, 1e-6);
            expect(graph.entity('b').loc[1]).to.be.closeTo(1, 1e-6);
            expect(graph.entity('c').loc[0]).to.be.closeTo(4, 1e-6);
            expect(graph.entity('c').loc[1]).to.be.closeTo(1, 1e-6);
            expect(graph.entity('d').loc[0]).to.be.closeTo(1, 1e-6);
            expect(graph.entity('d').loc[1]).to.be.closeTo(1, 1e-6);
        });

        it('reflect long at t = 1', function() {
            var graph = new Rapid.Graph([
                    Rapid.osmNode({id: 'a', loc: [0, 0]}),
                    Rapid.osmNode({id: 'b', loc: [4, 0]}),
                    Rapid.osmNode({id: 'c', loc: [4, 2]}),
                    Rapid.osmNode({id: 'd', loc: [1, 2]}),
                    Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd', 'a']})
                ]);
            graph = Rapid.actionReflect(['-'], projection)(graph, 1);
            expect(graph.entity('a').loc[0]).to.be.closeTo(0, 1e-6);
            expect(graph.entity('a').loc[1]).to.be.closeTo(2, 1e-6);
            expect(graph.entity('b').loc[0]).to.be.closeTo(4, 1e-6);
            expect(graph.entity('b').loc[1]).to.be.closeTo(2, 1e-6);
            expect(graph.entity('c').loc[0]).to.be.closeTo(4, 1e-6);
            expect(graph.entity('c').loc[1]).to.be.closeTo(0, 1e-6);
            expect(graph.entity('d').loc[0]).to.be.closeTo(1, 1e-6);
            expect(graph.entity('d').loc[1]).to.be.closeTo(0, 1e-6);
        });

        it('reflect short at t = 0', function() {
            var graph = new Rapid.Graph([
                    Rapid.osmNode({id: 'a', loc: [0, 0]}),
                    Rapid.osmNode({id: 'b', loc: [4, 0]}),
                    Rapid.osmNode({id: 'c', loc: [4, 2]}),
                    Rapid.osmNode({id: 'd', loc: [1, 2]}),
                    Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd', 'a']})
                ]);
            graph = Rapid.actionReflect(['-'], projection).useLongAxis(false)(graph, 0);
            expect(graph.entity('a').loc[0]).to.be.closeTo(0, 1e-6);
            expect(graph.entity('a').loc[1]).to.be.closeTo(0, 1e-6);
            expect(graph.entity('b').loc[0]).to.be.closeTo(4, 1e-6);
            expect(graph.entity('b').loc[1]).to.be.closeTo(0, 1e-6);
            expect(graph.entity('c').loc[0]).to.be.closeTo(4, 1e-6);
            expect(graph.entity('c').loc[1]).to.be.closeTo(2, 1e-6);
            expect(graph.entity('d').loc[0]).to.be.closeTo(1, 1e-6);
            expect(graph.entity('d').loc[1]).to.be.closeTo(2, 1e-6);
        });

        it('reflect short at t = 0.5', function() {
            var graph = new Rapid.Graph([
                    Rapid.osmNode({id: 'a', loc: [0, 0]}),
                    Rapid.osmNode({id: 'b', loc: [4, 0]}),
                    Rapid.osmNode({id: 'c', loc: [4, 2]}),
                    Rapid.osmNode({id: 'd', loc: [1, 2]}),
                    Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd', 'a']})
                ]);
            graph = Rapid.actionReflect(['-'], projection).useLongAxis(false)(graph, 0.5);
            expect(graph.entity('a').loc[0]).to.be.closeTo(2, 1e-6);
            expect(graph.entity('a').loc[1]).to.be.closeTo(0, 1e-6);
            expect(graph.entity('b').loc[0]).to.be.closeTo(2, 1e-6);
            expect(graph.entity('b').loc[1]).to.be.closeTo(0, 1e-6);
            expect(graph.entity('c').loc[0]).to.be.closeTo(2, 1e-6);
            expect(graph.entity('c').loc[1]).to.be.closeTo(2, 1e-6);
            expect(graph.entity('d').loc[0]).to.be.closeTo(2, 1e-6);
            expect(graph.entity('d').loc[1]).to.be.closeTo(2, 1e-6);
        });

        it('reflect short at t = 1', function() {
            var graph = new Rapid.Graph([
                    Rapid.osmNode({id: 'a', loc: [0, 0]}),
                    Rapid.osmNode({id: 'b', loc: [4, 0]}),
                    Rapid.osmNode({id: 'c', loc: [4, 2]}),
                    Rapid.osmNode({id: 'd', loc: [1, 2]}),
                    Rapid.osmWay({id: '-', nodes: ['a', 'b', 'c', 'd', 'a']})
                ]);
            graph = Rapid.actionReflect(['-'], projection).useLongAxis(false)(graph, 1);
            expect(graph.entity('a').loc[0]).to.be.closeTo(4, 1e-6);
            expect(graph.entity('a').loc[1]).to.be.closeTo(0, 1e-6);
            expect(graph.entity('b').loc[0]).to.be.closeTo(0, 1e-6);
            expect(graph.entity('b').loc[1]).to.be.closeTo(0, 1e-6);
            expect(graph.entity('c').loc[0]).to.be.closeTo(0, 1e-6);
            expect(graph.entity('c').loc[1]).to.be.closeTo(2, 1e-6);
            expect(graph.entity('d').loc[0]).to.be.closeTo(3, 1e-6);
            expect(graph.entity('d').loc[1]).to.be.closeTo(2, 1e-6);
        });

    });
});
