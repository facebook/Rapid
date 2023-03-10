describe('actionNoop', function () {
    it('does nothing', function () {
        var graph = new Rapid.Graph(),
            action = Rapid.actionNoop(graph);
        expect(action(graph)).to.equal(graph);
    });
});
