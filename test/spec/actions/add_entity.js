describe('actionAddEntity', function () {
    it('adds an entity to the graph', function () {
        var entity = Rapid.osmEntity(),
            graph = Rapid.actionAddEntity(entity)(new Rapid.Graph());
        expect(graph.entity(entity.id)).to.equal(entity);
    });
});
