describe('iD.actionNoop', function () {
    it('does nothing', function () {
        var graph = new iD.Graph(),
            action = iD.actionNoop(graph);
        expect(action(graph)).to.equal(graph);
    });
});
