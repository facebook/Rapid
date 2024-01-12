describe('actionStraightenNodes', function () {
    var projection = {
        project: function (val) { return val; },
        invert: function (val) { return val; }
    };

    it('straightens points', function() {
        var graph = new Rapid.Graph([
            Rapid.osmNode({ id: 'a', loc: [0, -1] }),
            Rapid.osmNode({ id: 'b', loc: [5, 1], tags: { foo: 'bar' } }),
            Rapid.osmNode({ id: 'c', loc: [10, -1] }),  // untagged
            Rapid.osmNode({ id: 'd', loc: [15, 1] })
        ]);

        graph = Rapid.actionStraightenNodes(['a','b','c','d'], projection)(graph);
        expect(graph.entity('a').loc[0]).to.be.closeTo(0, 1e-6);
        expect(graph.entity('a').loc[1]).to.be.closeTo(0, 1e-6);
        expect(graph.entity('b').loc[0]).to.be.closeTo(5, 1e-6);
        expect(graph.entity('b').loc[1]).to.be.closeTo(0, 1e-6);
        expect(graph.entity('c').loc[0]).to.be.closeTo(10, 1e-6);  // doesn't delete untagged
        expect(graph.entity('c').loc[1]).to.be.closeTo(0, 1e-6);   // doesn't delete untagged
        expect(graph.entity('d').loc[0]).to.be.closeTo(15, 1e-6);
        expect(graph.entity('d').loc[1]).to.be.closeTo(0, 1e-6);
    });


    describe('transitions', function () {
        it('is transitionable', function() {
            expect(Rapid.actionStraightenNodes().transitionable).to.be.true;
        });

        it('straighten at t = 0', function() {
            var graph = new Rapid.Graph([
                Rapid.osmNode({ id: 'a', loc: [0, -1] }),
                Rapid.osmNode({ id: 'b', loc: [5, 1], tags: { foo: 'bar' } }),
                Rapid.osmNode({ id: 'c', loc: [10, -1] }),  // untagged
                Rapid.osmNode({ id: 'd', loc: [15, 1] })
            ]);

            graph = Rapid.actionStraightenNodes(['a','b','c','d'], projection)(graph, 0);
            expect(graph.entity('a').loc[0]).to.be.closeTo(0, 1e-6);
            expect(graph.entity('a').loc[1]).to.be.closeTo(-1, 1e-6);
            expect(graph.entity('b').loc[0]).to.be.closeTo(5, 1e-6);
            expect(graph.entity('b').loc[1]).to.be.closeTo(1, 1e-6);
            expect(graph.entity('c').loc[0]).to.be.closeTo(10, 1e-6);   // doesn't delete untagged
            expect(graph.entity('c').loc[1]).to.be.closeTo(-1, 1e-6);   // doesn't delete untagged
            expect(graph.entity('d').loc[0]).to.be.closeTo(15, 1e-6);
            expect(graph.entity('d').loc[1]).to.be.closeTo(1, 1e-6);
        });

        it('straighten at t = 0.5', function() {
            var graph = new Rapid.Graph([
                Rapid.osmNode({ id: 'a', loc: [0, -1] }),
                Rapid.osmNode({ id: 'b', loc: [5, 1], tags: { foo: 'bar' } }),
                Rapid.osmNode({ id: 'c', loc: [10, -1] }),  // untagged
                Rapid.osmNode({ id: 'd', loc: [15, 1] })
            ]);

            graph = Rapid.actionStraightenNodes(['a','b','c','d'], projection)(graph, 0.5);
            expect(graph.entity('a').loc[0]).to.be.closeTo(0, 1e-6);
            expect(graph.entity('a').loc[1]).to.be.closeTo(-0.5, 1e-6);
            expect(graph.entity('b').loc[0]).to.be.closeTo(5, 1e-6);
            expect(graph.entity('b').loc[1]).to.be.closeTo(0.5, 1e-6);
            expect(graph.entity('c').loc[0]).to.be.closeTo(10, 1e-6);   // doesn't delete untagged
            expect(graph.entity('c').loc[1]).to.be.closeTo(-0.5, 1e-6);   // doesn't delete untagged
            expect(graph.entity('d').loc[0]).to.be.closeTo(15, 1e-6);
            expect(graph.entity('d').loc[1]).to.be.closeTo(0.5, 1e-6);
        });

        it('straighten at t = 1', function() {
            var graph = new Rapid.Graph([
                Rapid.osmNode({ id: 'a', loc: [0, -1] }),
                Rapid.osmNode({ id: 'b', loc: [5, 1], tags: { foo: 'bar' } }),
                Rapid.osmNode({ id: 'c', loc: [10, -1] }),  // untagged
                Rapid.osmNode({ id: 'd', loc: [15, 1] })
            ]);

            graph = Rapid.actionStraightenNodes(['a','b','c','d'], projection)(graph, 1);
            expect(graph.entity('a').loc[0]).to.be.closeTo(0, 1e-6);
            expect(graph.entity('a').loc[1]).to.be.closeTo(0, 1e-6);
            expect(graph.entity('b').loc[0]).to.be.closeTo(5, 1e-6);
            expect(graph.entity('b').loc[1]).to.be.closeTo(0, 1e-6);
            expect(graph.entity('c').loc[0]).to.be.closeTo(10, 1e-6);   // doesn't delete untagged
            expect(graph.entity('c').loc[1]).to.be.closeTo(0, 1e-6);   // doesn't delete untagged
            expect(graph.entity('d').loc[0]).to.be.closeTo(15, 1e-6);
            expect(graph.entity('d').loc[1]).to.be.closeTo(0, 1e-6);
        });
    });

});
