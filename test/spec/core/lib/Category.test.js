describe('Category', () => {

  class MockContext {
    constructor()   { }
  }

  const context = new MockContext();
  const residential = new Rapid.Preset(context, 'highway/residential', { tags: { highway: 'residential' }, geometry: ['line'] });
  const allPresets = { 'highway/residential': residential };

  const categoryData = {
    'geometry': 'line',
    'icon': 'highway',
    'name': 'roads',
    'members': [ 'highway/residential' ]
  };
  const category = new Rapid.Category(context, 'road', categoryData, allPresets);

  it('maps members names to preset instances', () => {
    expect(category.members).to.be.an.instanceof(Rapid.Collection);
    expect(category.members.array[0]).to.eql(residential);
  });

  describe('#matchGeometry', () => {
    it('matches the type of an entity', () => {
      expect(category.matchGeometry('line')).to.be.true;
      expect(category.matchGeometry('point')).to.be.false;
    });
  });
});
