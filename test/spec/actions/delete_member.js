describe('actionDeleteMember', function () {
    it('removes the member at the specified index', function () {
        var a      = Rapid.osmNode({id: 'a'}),
            b      = Rapid.osmNode({id: 'b'}),
            r      = Rapid.osmRelation({members: [{id: 'a'}, {id: 'b'}]}),
            action = Rapid.actionDeleteMember(r.id, 0),
            graph  = action(new Rapid.Graph([a, b, r]));
        expect(graph.entity(r.id).members).to.eql([{id: 'b'}]);
    });

    it('deletes relations that become degenerate', function () {
        var a      = Rapid.osmNode({id: 'a'}),
            r      = Rapid.osmRelation({id: 'r', members: [{id: 'a'}]}),
            action = Rapid.actionDeleteMember(r.id, 0),
            graph  = action(new Rapid.Graph([a, r]));
        expect(graph.hasEntity('r')).to.be.undefined;
    });
});
