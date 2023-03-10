describe('osmRemoveLifecyclePrefix',  function () {
    it('removes the lifecycle prefix from a tag key',  function () {
        expect(Rapid.osmRemoveLifecyclePrefix('was:natural')).to.equal('natural');
        expect(Rapid.osmRemoveLifecyclePrefix('destroyed:seamark:type')).to.equal('seamark:type');
    });

    it('ignores invalid lifecycle prefixes', function () {
        expect(Rapid.osmRemoveLifecyclePrefix('ex:leisure')).to.equal('ex:leisure');
    });
});


describe('osmTagSuggestingArea', function () {
    beforeEach(function () {
        Rapid.osmSetAreaKeys({ leisure: {} });
    });

    it('handles features with a lifecycle prefixes', function () {
        expect(Rapid.osmTagSuggestingArea({ leisure: 'stadium' })).to.eql({ leisure: 'stadium' });
        expect(Rapid.osmTagSuggestingArea({ 'disused:leisure': 'stadium' })).to.eql({ 'disused:leisure': 'stadium' });
        expect(Rapid.osmTagSuggestingArea({ 'ex:leisure': 'stadium' })).to.be.null;
    });
});
