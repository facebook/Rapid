describe('Preset', () => {
  let _context;

  class MockContext {
    constructor()  { }
  }

  before(() => {
    _context = new MockContext();
  });


  describe('#fields', () => {
    it('has no fields by default', () => {
      const preset = new Rapid.Preset(_context, 'test', {});
      expect(preset.fields()).to.eql([]);
    });
  });

  describe('#moreFields', () => {
    it('has no moreFields by default', () => {
      const preset = new Rapid.Preset(_context, 'test', {});
      expect(preset.moreFields()).to.eql([]);
    });
  });

  describe('#matchGeometry', () => {
    it('returns false if it doesn\'t match', () => {
      const preset = new Rapid.Preset(_context, 'test', { geometry: ['line'] });
      expect(preset.matchGeometry('point')).to.be.false;
    });

    it('returns true if it does match', () => {
      const preset = new Rapid.Preset(_context, 'test', { geometry: ['point', 'line'] });
      expect(preset.matchGeometry('point')).to.be.true;
    });
  });

  describe('#matchAllGeometry', () => {
    it('returns false if they don\'t all match', () => {
      const preset = new Rapid.Preset(_context, 'test', { geometry: ['line'] });
      expect(preset.matchAllGeometry(['point','line'])).to.be.false;
    });

    it('returns true if they do all match', () => {
      const preset = new Rapid.Preset(_context, 'test', { geometry: ['point', 'line'] });
      expect(preset.matchAllGeometry(['point','line'])).to.be.true;
    });
  });

  describe('#matchScore', () => {
    it('returns -1 if preset does not match tags', () => {
      const preset = new Rapid.Preset(_context, 'test', { tags: { foo: 'bar' } });
      const entity = Rapid.osmWay({ tags: { highway: 'motorway' } });
      expect(preset.matchScore(entity.tags)).to.equal(-1);
    });

    it('returns the value of the matchScore property when matched', () => {
      const preset = new Rapid.Preset(_context, 'test', { tags: { highway: 'motorway' }, matchScore: 0.2 });
      const entity = Rapid.osmWay({ tags: { highway: 'motorway' } });
      expect(preset.matchScore(entity.tags)).to.equal(0.2);
    });

    it('defaults to the number of matched tags', () => {
      let preset = new Rapid.Preset(_context, 'test', { tags: { highway: 'residential' } });
      let entity = Rapid.osmWay({ tags: { highway: 'residential' } });
      expect(preset.matchScore(entity.tags)).to.equal(1);

      preset = new Rapid.Preset(_context, 'test', { tags: { highway: 'service', service: 'alley' } });
      entity = Rapid.osmWay({ tags: { highway: 'service', service: 'alley' } });
      expect(preset.matchScore(entity.tags)).to.equal(2);
    });

    it('counts * as a match for any value with score 0.5', () => {
      const preset = new Rapid.Preset(_context, 'test', { tags: { building: '*' } });
      const entity = Rapid.osmWay({ tags: { building: 'yep' } });
      expect(preset.matchScore(entity.tags)).to.equal(0.5);
    });

    it('boosts matchScore for additional matches in addTags', () => {
      const presetSupercenter = new Rapid.Preset(_context, 'shop/supermarket/walmart_supercenter', {
        tags: { 'brand:wikidata': 'Q483551', 'shop': 'supermarket' },
        addTags: { 'name': 'Walmart Supercenter'  }
      });
      const presetMarket = new Rapid.Preset(_context, 'shop/supermarket/walmart_market', {
        tags: { 'brand:wikidata': 'Q483551', 'shop': 'supermarket' },
        addTags: { 'name': 'Walmart Neighborhood Market'  }
      });

      const supercenter = Rapid.osmWay({ tags: {
        'brand:wikidata': 'Q483551',
        'shop': 'supermarket',
        'name': 'Walmart Supercenter'
      } });
      const market = Rapid.osmWay({ tags: {
        'brand:wikidata': 'Q483551',
        'shop': 'supermarket',
        'name': 'Walmart Neighborhood Market'
      } });

      expect(presetSupercenter.matchScore(supercenter.tags))
        .to.be.greaterThan(presetMarket.matchScore(supercenter.tags));

      expect(presetMarket.matchScore(market.tags))
        .to.be.greaterThan(presetSupercenter.matchScore(market.tags));
      });
    });

  describe('isFallback', () => {
    it('returns true if preset has no tags', () => {
      const preset = new Rapid.Preset(_context, 'point', { tags: {} });
      expect(preset.isFallback()).to.be.true;
    });

    it('returns true if preset has a single \'area\' tag', () => {
      const preset = new Rapid.Preset(_context, 'area', { tags: { area: 'yes' } });
      expect(preset.isFallback()).to.be.true;
    });

    it('returns false if preset has a single non-\'area\' tag', () => {
      const preset = new Rapid.Preset(_context, 'building', { tags: { building: 'yes' } });
      expect(preset.isFallback()).to.be.false;
    });

    it('returns false if preset has multiple tags', () => {
      const preset = new Rapid.Preset(_context, 'building', { tags: { area: 'yes', building: 'yes' } });
      expect(preset.isFallback()).to.be.false;
    });
  });

  describe('#setTags', () => {
    let _savedAreaKeys;

    before(() => {
      _savedAreaKeys = Rapid.osmAreaKeys;
      Rapid.osmSetAreaKeys({ building: {}, natural: {} });
    });

    after(() => {
      Rapid.osmSetAreaKeys(_savedAreaKeys);
    });

    it('adds match tags', () => {
      const preset = new Rapid.Preset(_context, 'test', { tags: { highway: 'residential' } });
      expect(preset.setTags({}, 'line')).to.eql({ highway: 'residential' });
    });

    it('adds wildcard tags with value \'yes\'', () => {
      const preset = new Rapid.Preset(_context, 'test', { tags: { natural: '*' } });
      expect(preset.setTags({}, 'area')).to.eql({ natural: 'yes' });
    });

    it('prefers to add tags of addTags property', () => {
      const preset = new Rapid.Preset(_context, 'test', { tags: { building: '*' }, addTags: { building: 'ok' } });
      expect(preset.setTags({}, 'area')).to.eql({ building: 'ok' });
    });

    it('adds default tags of fields with matching geometry', () => {
      const field = new Rapid.Field(_context, 'field', { key: 'building', geometry: 'area', default: 'yes' });
      const preset = new Rapid.Preset(_context, 'test', { fields: ['field'] }, { field: field });
      expect(preset.setTags({}, 'area')).to.eql({ area: 'yes', building: 'yes' });
    });

    it('adds no default tags of fields with non-matching geometry', () => {
      const field = new Rapid.Field(_context, 'field', { key: 'building', geometry: 'area', default: 'yes' });
      const preset = new Rapid.Preset(_context, 'test', { fields: ['field'] }, { field: field });
      expect(preset.setTags({}, 'point')).to.eql({});
    });

    describe('for a preset with no tag in areaKeys', () => {
      const preset = new Rapid.Preset(_context, 'test', { geometry: ['line', 'area'], tags: { name: 'testname', highway: 'pedestrian' } });

      it('doesn\'t add area=yes to non-areas', () => {
        expect(preset.setTags({}, 'line')).to.eql({ name: 'testname', highway: 'pedestrian' });
      });

      it('adds area=yes to areas', () => {
        expect(preset.setTags({}, 'area')).to.eql({ name: 'testname', highway: 'pedestrian', area: 'yes' });
      });
    });

    describe('for a preset with a tag in areaKeys', () => {
      it('doesn\'t add area=yes automatically', () => {
        const preset = new Rapid.Preset(_context, 'test', { geometry: ['area'], tags: { name: 'testname', building: 'yes' } });
        expect(preset.setTags({}, 'area')).to.eql({ name: 'testname', building: 'yes' });
      });

      it('does add area=yes if asked to', () => {
        const preset = new Rapid.Preset(_context, 'test', { geometry: ['area'], tags: { name: 'testname', area: 'yes' } });
        expect(preset.setTags({}, 'area')).to.eql({ name: 'testname', area: 'yes' });
      });
    });
  });

  describe('#unsetTags', () => {
    it('removes tags that match preset tags', () => {
      const preset = new Rapid.Preset(_context, 'test', { tags: { highway: 'residential' } });
      expect(preset.unsetTags({ highway: 'residential' }, 'area')).to.eql({});
    });

    it('removes tags that match field default tags', () => {
      const field = new Rapid.Field(_context, 'field', { key: 'building', geometry: 'area', default: 'yes' });
      const preset = new Rapid.Preset(_context, 'test', { fields: ['field'] }, { field: field });
      expect(preset.unsetTags({ building: 'yes' }, 'area')).to.eql({});
    });

    it('removes area=yes', () => {
      const preset = new Rapid.Preset(_context, 'test', { tags: { highway: 'pedestrian' } });
      expect(preset.unsetTags({ highway: 'pedestrian', area: 'yes' }, 'area')).to.eql({});
    });

    it('preserves tags that do not match field default tags', () => {
      const field = new Rapid.Field(_context, 'field', { key: 'building', geometry: 'area', default: 'yes' });
      const preset = new Rapid.Preset(_context, 'test', { fields: ['field'] }, { field: field });
      expect(preset.unsetTags({ building: 'yep' }, 'area')).to.eql({ building: 'yep' });
    });

    it('preserves tags that are not listed in removeTags', () => {
      const preset = new Rapid.Preset(_context, 'test', { tags: { a: 'b' }, removeTags: {} });
      expect(preset.unsetTags({ a: 'b' }, 'area')).to.eql({ a: 'b' });
    });

    it('uses tags from addTags if removeTags is not defined', () => {
      const preset = new Rapid.Preset(_context, 'test', { tags: { a: 'b' }, addTags: { remove: 'me' } });
      expect(preset.unsetTags({ a: 'b', remove: 'me' }, 'area')).to.eql({ a: 'b' });
    });
  });

});
