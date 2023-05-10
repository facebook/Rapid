describe('actionChangePreset', () => {
  class MockContext {
    constructor()   { }
  }

  const context = new MockContext();
  const oldPreset = new Rapid.Preset(context, 'old', {tags: {old: 'true'}});
  const newPreset = new Rapid.Preset(context, 'new', {tags: {new: 'true'}});

  it('changes from one preset\'s tags to another\'s', () => {
    const entity = Rapid.osmNode({tags: {old: 'true'}});
    const graph = new Rapid.Graph([entity]);
    const action = Rapid.actionChangePreset(entity.id, oldPreset, newPreset);
    expect(action(graph).entity(entity.id).tags).to.eql({new: 'true'});
  });

  it('adds the tags of a new preset to an entity without an old preset', () => {
    const entity = Rapid.osmNode();
    const graph = new Rapid.Graph([entity]);
    const action = Rapid.actionChangePreset(entity.id, null, newPreset);
    expect(action(graph).entity(entity.id).tags).to.eql({new: 'true'});
  });

  it('removes the tags of an old preset from an entity without a new preset', () => {
    const entity = Rapid.osmNode({tags: {old: 'true'}});
    const graph = new Rapid.Graph([entity]);
    const action = Rapid.actionChangePreset(entity.id, oldPreset, null);
    expect(action(graph).entity(entity.id).tags).to.eql({});
  });
});
