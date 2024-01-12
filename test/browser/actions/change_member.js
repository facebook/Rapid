describe('actionChangeMember', function () {
    it('updates the member at the specified index', function () {
        var node     = Rapid.osmNode(),
            relation = Rapid.osmRelation({members: [{id: node.id}]}),
            action   = Rapid.actionChangeMember(relation.id, {id: node.id, role: 'node'}, 0),
            graph    = action(new Rapid.Graph([node, relation]));
        expect(graph.entity(relation.id).members).to.eql([{id: node.id, role: 'node'}]);
    });
});
