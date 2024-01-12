describe('actionMove', function() {
    var projection = new sdk.Projection().scale(250 / Math.PI);

    // This was moved to operationMove.  We should test operations and move this test there.
    // describe('#disabled', function() {
    //     it('returns falsy by default', function() {
    //         var node  = Rapid.osmNode({loc: [0, 0]}),
    //             action = Rapid.actionMove([node.id], [0, 0], projection),
    //             graph = new Rapid.Graph([node]);
    //         expect(action.disabled(graph)).not.to.be.ok;
    //     });

    //     it('returns \'incomplete_relation\' for an incomplete relation', function() {
    //         var relation = Rapid.osmRelation({members: [{id: 1}]}),
    //             action = Rapid.actionMove([relation.id], [0, 0], projection),
    //             graph = new Rapid.Graph([relation]);
    //         expect(action.disabled(graph)).to.equal('incomplete_relation');
    //     });

    //     it('returns falsy for a complete relation', function() {
    //         var node  = Rapid.osmNode({loc: [0, 0]}),
    //             relation = Rapid.osmRelation({members: [{id: node.id}]}),
    //             action = Rapid.actionMove([relation.id], [0, 0], projection),
    //             graph = new Rapid.Graph([node, relation]);
    //         expect(action.disabled(graph)).not.to.be.ok;
    //     });
    // });

    it('moves all nodes in a way by the given amount', function() {
        var node1  = Rapid.osmNode({loc: [0, 0]}),
            node2  = Rapid.osmNode({loc: [5, 10]}),
            way    = Rapid.osmWay({nodes: [node1.id, node2.id]}),
            delta  = [2, 3],
            graph  = Rapid.actionMove([way.id], delta, projection)(new Rapid.Graph([node1, node2, way])),
            loc1   = graph.entity(node1.id).loc,
            loc2   = graph.entity(node2.id).loc;
        expect(loc1[0]).to.be.closeTo( 1.440, 0.001);
        expect(loc1[1]).to.be.closeTo(-2.159, 0.001);
        expect(loc2[0]).to.be.closeTo( 6.440, 0.001);
        expect(loc2[1]).to.be.closeTo( 7.866, 0.001);
    });

    it('moves repeated nodes only once', function() {
        var node   = Rapid.osmNode({loc: [0, 0]}),
            way    = Rapid.osmWay({nodes: [node.id, node.id]}),
            delta  = [2, 3],
            graph  = Rapid.actionMove([way.id], delta, projection)(new Rapid.Graph([node, way])),
            loc    = graph.entity(node.id).loc;
        expect(loc[0]).to.be.closeTo( 1.440, 0.001);
        expect(loc[1]).to.be.closeTo(-2.159, 0.001);
    });

    it('moves multiple ways', function() {
        var node   = Rapid.osmNode({loc: [0, 0]}),
            way1   = Rapid.osmWay({nodes: [node.id]}),
            way2   = Rapid.osmWay({nodes: [node.id]}),
            delta  = [2, 3],
            graph  = Rapid.actionMove([way1.id, way2.id], delta, projection)(new Rapid.Graph([node, way1, way2])),
            loc    = graph.entity(node.id).loc;
        expect(loc[0]).to.be.closeTo( 1.440, 0.001);
        expect(loc[1]).to.be.closeTo(-2.159, 0.001);
    });

    it('moves leaf nodes of a relation', function() {
        var node     = Rapid.osmNode({loc: [0, 0]}),
            way      = Rapid.osmWay({nodes: [node.id]}),
            relation = Rapid.osmRelation({members: [{id: way.id}]}),
            delta    = [2, 3],
            graph    = Rapid.actionMove([relation.id], delta, projection)(new Rapid.Graph([node, way, relation])),
            loc      = graph.entity(node.id).loc;
        expect(loc[0]).to.be.closeTo( 1.440, 0.001);
        expect(loc[1]).to.be.closeTo(-2.159, 0.001);
    });
});
