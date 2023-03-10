describe('actionDeleteMultiple', function () {
    it('deletes multiple entities of heterogeneous types', function () {
        var n      = Rapid.osmNode(),
            w      = Rapid.osmWay(),
            r      = Rapid.osmRelation(),
            action = Rapid.actionDeleteMultiple([n.id, w.id, r.id]),
            graph  = action(new Rapid.Graph([n, w, r]));
        expect(graph.hasEntity(n.id)).to.be.undefined;
        expect(graph.hasEntity(w.id)).to.be.undefined;
        expect(graph.hasEntity(r.id)).to.be.undefined;
    });

    it('deletes a way and one of its nodes', function () {
        var n      = Rapid.osmNode(),
            w      = Rapid.osmWay({nodes: [n.id]}),
            action = Rapid.actionDeleteMultiple([w.id, n.id]),
            graph  = action(new Rapid.Graph([n, w]));
        expect(graph.hasEntity(w.id)).to.be.undefined;
        expect(graph.hasEntity(n.id)).to.be.undefined;
    });

    // This was moved to operationDelete.  We should test operations and move this test there.
    // describe('#disabled', function () {
    //     it('returns the result of the first action that is disabled', function () {
    //         var node     = Rapid.osmNode(),
    //             relation = Rapid.osmRelation({members: [{id: 'w'}]}),
    //             graph    = new Rapid.Graph([node, relation]),
    //             action   = Rapid.actionDeleteMultiple([node.id, relation.id]);
    //         expect(action.disabled(graph)).to.equal('incomplete_relation');
    //     });
    // });
});
