describe('Category', () => {
  let _context;
  let _allPresets;
  let _residential;

  const category = {
    'geometry': 'line',
    'icon': 'highway',
    'name': 'roads',
    'members': [ 'highway/residential' ]
  };

  class MockContext {
    constructor()   { }
  }

  before(() => {
    _context = new MockContext();
    _residential = new Rapid.Preset(_context, 'highway/residential', { tags: { highway: 'residential' }, geometry: ['line'] });
    _allPresets = { 'highway/residential': _residential };
  });


  it('maps members names to preset instances', () => {
    const c = new Rapid.Category(_context, 'road', category, _allPresets);
    expect(c.members).to.be.an.instanceof(Rapid.Collection);
    expect(c.members.array[0]).to.eql(_residential);
  });

  describe('#matchGeometry', () => {
    it('matches the type of an entity', () => {
      const c = new Rapid.Category(_context, 'road', category, _allPresets);
      expect(c.matchGeometry('line')).to.be.true;
      expect(c.matchGeometry('point')).to.be.false;
    });
  });
});
