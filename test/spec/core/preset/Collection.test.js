describe('Collection', () => {
  class MockContext {
    constructor()   { }
  }

  const context = new MockContext();

  // Note: __TEST is added to these because the search uses localized
  //   preset.name() keyed on id, which would use the names from en.json.
  // Except for fallback presets which must have those names because of the logic in fallback()
  const p = {
    point: new Rapid.Preset(context, 'point',
      { name: 'Point', tags: {}, geometry: ['point'], matchScore: 0.1 }
    ),
    line: new Rapid.Preset(context, 'line',
      { name: 'Line', tags: {}, geometry: ['line'], matchScore: 0.1 }
    ),
    area: new Rapid.Preset(context, 'area',
      { name: 'Area', tags: { area: 'yes' }, geometry: ['area'], matchScore: 0.1 }
    ),
    grill: new Rapid.Preset(context, '__TEST/amenity/bbq',
      { name: 'Grill', tags: { amenity: 'bbq' }, geometry: ['point'], terms: [] }
    ),
    sandpit: new Rapid.Preset(context, '__TEST/amenity/grit_bin',
      { name: 'Sandpit', tags: { amenity: 'grit_bin' }, geometry: ['point'], terms: [] }
    ),
    residential: new Rapid.Preset(context, '__TEST/highway/residential',
      { name: 'Residential Area', tags: { highway: 'residential' }, geometry: ['point', 'area'], terms: [] }
    ),
    grass1: new Rapid.Preset(context, '__TEST/landuse/grass1',
      { name: 'Grass', tags: { landuse: 'grass' }, geometry: ['point', 'area'], terms: [] }
    ),
    grass2: new Rapid.Preset(context, '__TEST/landuse/grass2',
      { name: 'Ğṝȁß', tags: { landuse: 'ğṝȁß' }, geometry: ['point', 'area'], terms: [] }
    ),
    park: new Rapid.Preset(context, '__TEST/leisure/park',
      { name: 'Park', tags: { leisure: 'park' }, geometry: ['point', 'area'], terms: [ 'grass' ], matchScore: 0.5 }
    ),
    parking: new Rapid.Preset(context, '__TEST/amenity/parking',
      { name: 'Parking', tags: { amenity: 'parking' }, geometry: ['point', 'area'], terms: [ 'cars' ] }
    ),
    soccer: new Rapid.Preset(context, '__TEST/leisure/pitch/soccer',
      { name: 'Soccer Field', tags: { leisure: 'pitch', sport: 'soccer' }, geometry: ['point', 'area'], terms: ['fußball'] }
    ),
    football: new Rapid.Preset(context, '__TEST/leisure/pitch/american_football',
      { name: 'Football Field', tags: { leisure: 'pitch', sport: 'american_football' }, geometry: ['point', 'area'], terms: ['gridiron'] }
    )
  };


  const c = new Rapid.Collection(context, [
    p.point, p.line, p.area, p.grill, p.sandpit, p.residential,
    p.grass1, p.grass2, p.park, p.parking, p.soccer, p.football
  ]);

  describe('#item', () => {
    it('fetches a preset by id', () => {
      expect(c.item('__TEST/highway/residential')).to.equal(p.residential);
    });
  });

  describe('#index', () => {
    it('returns preset position in the collection', () => {
      expect(c.index('point')).to.equal(0);
    });
    it('return -1 when given id for preset not in the collection', () => {
      expect(c.index('foobar')).to.equal(-1);
    });
  });

  describe('#matchGeometry', () => {
    it('returns a new collection only containing presets matching a geometry', () => {
      expect(c.matchGeometry('area').array).to.include.members(
        [p.area, p.residential, p.park, p.soccer, p.football]
      );
    });
  });

  describe('#search', () => {
    it('matches leading name', () => {
      const result = c.search('resid', 'area').array;
      expect(result.indexOf(p.residential)).to.eql(0);  // 1. 'Residential' (by name)
    });

    it('returns alternate matches in correct order', () => {
      const result = c.search('gri', 'point').matchGeometry('point').array;
      expect(result.indexOf(p.grill), 'Grill').to.eql(0);            // 1. 'Grill' (leading name)
      expect(result.indexOf(p.football), 'Football').to.eql(1);      // 2. 'Football' (leading term 'gridiron')
      expect(result.indexOf(p.sandpit), 'Sandpit').to.eql(2);        // 3. 'Sandpit' (leading tag value 'grit_bin')
      expect(result.indexOf(p.grass1), 'Grass').to.be.within(3,5);   // 4. 'Grass' (similar name)
      expect(result.indexOf(p.grass2), 'Ğṝȁß').to.be.within(3,5);    // 5. 'Ğṝȁß' (similar name)
      expect(result.indexOf(p.park), 'Park').to.be.within(3,5);      // 6. 'Park' (similar term 'grass')
    });

    it('sorts preset with matchScore penalty below others', () => {
      const result = c.search('par', 'point').matchGeometry('point').array;
      expect(result.indexOf(p.parking), 'Parking').to.eql(0);   // 1. 'Parking' (default matchScore)
      expect(result.indexOf(p.park), 'Park').to.eql(1);         // 2. 'Park' (low matchScore)
    });

    it('ignores matchScore penalty for exact name match', () => {
      const result = c.search('park', 'point').matchGeometry('point').array;
      expect(result.indexOf(p.park), 'Park').to.eql(0);         // 1. 'Park' (low matchScore)
      expect(result.indexOf(p.parking), 'Parking').to.eql(1);   // 2. 'Parking' (default matchScore)
    });

    it('considers diacritics on exact matches', () => {
      const result = c.search('ğṝȁ', 'point').matchGeometry('point').array;
      expect(result.indexOf(p.grass2), 'Ğṝȁß').to.eql(0);    // 1. 'Ğṝȁß'  (leading name)
      expect(result.indexOf(p.grass1), 'Grass').to.eql(1);   // 2. 'Grass' (similar name)
    });

    it('replaces diacritics on fuzzy matches', () => {
      const result = c.search('graß', 'point').matchGeometry('point').array;
      expect(result.indexOf(p.grass1), 'Grass').to.be.within(0,1);   // 1. 'Grass' (similar name)
      expect(result.indexOf(p.grass2), 'Ğṝȁß').to.be.within(0,1);    // 2. 'Ğṝȁß'  (similar name)
    });

    it('includes the appropriate fallback preset', () => {
      expect(c.search('foo', 'point').array, 'point').to.include(p.point);
      expect(c.search('foo', 'line').array, 'line').to.include(p.line);
      expect(c.search('foo', 'area').array, 'area').to.include(p.area);
    });

    it('excludes presets with searchable: false', () => {
      const excluded = new Rapid.Preset(context, 'excluded', {
        name: 'excluded',
        tags: { amenity: 'excluded' },
        geometry: ['point'],
        searchable: false
      });
      const collection = new Rapid.Collection(context, [excluded, p.point]);
      expect(collection.search('excluded', 'point').array).not.to.include(excluded);
    });
  });
});
