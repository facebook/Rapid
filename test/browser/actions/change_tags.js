describe('actionChangeTags', function () {
    it('changes an entity\'s tags', function () {
        var entity = Rapid.osmEntity(),
            tags   = {foo: 'bar'},
            graph  = Rapid.actionChangeTags(entity.id, tags)(new Rapid.Graph([entity]));
        expect(graph.entity(entity.id).tags).to.eql(tags);
    });
});
