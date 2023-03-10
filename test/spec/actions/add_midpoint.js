describe('actionAddMidpoint', function () {
    it('adds the node at the midpoint location', function () {
        var node = Rapid.osmNode(),
            a = Rapid.osmNode(),
            b = Rapid.osmNode(),
            midpoint = {loc: [1, 2], edge: [a.id, b.id]},
            graph = Rapid.actionAddMidpoint(midpoint, node)(new Rapid.Graph([a, b]));

        expect(graph.entity(node.id).loc).to.eql([1, 2]);
    });

    it('adds the node to a way that contains the given edge in forward order', function () {
        var node = Rapid.osmNode(),
            a = Rapid.osmNode(),
            b = Rapid.osmNode(),
            w1 = Rapid.osmWay(),
            w2 = Rapid.osmWay({nodes: [a.id, b.id]}),
            midpoint = {loc: [1, 2], edge: [a.id, b.id]},
            graph = Rapid.actionAddMidpoint(midpoint, node)(new Rapid.Graph([a, b, w1, w2]));

        expect(graph.entity(w1.id).nodes).to.eql([]);
        expect(graph.entity(w2.id).nodes).to.eql([a.id, node.id, b.id]);
    });

    it('adds the node to a way that contains the given edge in reverse order', function () {
        var node = Rapid.osmNode(),
            a = Rapid.osmNode(),
            b = Rapid.osmNode(),
            w1 = Rapid.osmWay(),
            w2 = Rapid.osmWay({nodes: [b.id, a.id]}),
            midpoint = {loc: [1, 2], edge: [a.id, b.id]},
            graph = Rapid.actionAddMidpoint(midpoint, node)(new Rapid.Graph([a, b, w1, w2]));

        expect(graph.entity(w1.id).nodes).to.eql([]);
        expect(graph.entity(w2.id).nodes).to.eql([b.id, node.id, a.id]);
    });

    it('turns an invalid double-back into a self-intersection', function () {
        // a====b (aba)
        // Expected result (converts to a valid loop):
        // a---b (acba)
        //  \ /
        //   c

        var a = Rapid.osmNode(),
            b = Rapid.osmNode(),
            c = Rapid.osmNode(),
            w = Rapid.osmWay({nodes: [a.id, b.id, a.id]}),
            midpoint = {loc: [1, 2], edge: [a.id, b.id]},
            graph = Rapid.actionAddMidpoint(midpoint, c)(new Rapid.Graph([a, b, w]));

        expect(graph.entity(w.id).nodes).to.eql([a.id, c.id, b.id, a.id]);
    });
});
