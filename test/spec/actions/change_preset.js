describe('actionChangePreset', function() {
    var oldPreset = Rapid.presetPreset('old', {tags: {old: 'true'}});
    var newPreset = Rapid.presetPreset('new', {tags: {new: 'true'}});

    it('changes from one preset\'s tags to another\'s', function() {
        var entity = Rapid.osmNode({tags: {old: 'true'}});
        var graph = new Rapid.Graph([entity]);
        var action = Rapid.actionChangePreset(entity.id, oldPreset, newPreset);
        expect(action(graph).entity(entity.id).tags).to.eql({new: 'true'});
    });

    it('adds the tags of a new preset to an entity without an old preset', function() {
        var entity = Rapid.osmNode();
        var graph = new Rapid.Graph([entity]);
        var action = Rapid.actionChangePreset(entity.id, null, newPreset);
        expect(action(graph).entity(entity.id).tags).to.eql({new: 'true'});
    });

    it('removes the tags of an old preset from an entity without a new preset', function() {
        var entity = Rapid.osmNode({tags: {old: 'true'}});
        var graph = new Rapid.Graph([entity]);
        var action = Rapid.actionChangePreset(entity.id, oldPreset, null);
        expect(action(graph).entity(entity.id).tags).to.eql({});
    });
});
