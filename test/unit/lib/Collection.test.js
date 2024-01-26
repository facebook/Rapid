import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';


describe('Collection', () => {

  class MockLocalizationSystem {
    constructor() { }
    initAsync()   { return Promise.resolve(); }
    t(id)         { return id; }
    tHtml(id)     { return id; }
  }

  class MockContext {
    constructor()  {
      this.systems = {
        l10n:  new MockLocalizationSystem(this)
      };
    }
  }

  const context = new MockContext();

  const p = {
    grill: new Rapid.Preset(context, 'amenity/bbq',
      { name: 'Grill', tags: { amenity: 'bbq' }, geometry: ['point'], terms: [] }
    ),
    sandpit: new Rapid.Preset(context, 'amenity/grit_bin',
      { name: 'Sandpit', tags: { amenity: 'grit_bin' }, geometry: ['point'], terms: [] }
    ),
    residential: new Rapid.Preset(context, 'highway/residential',
      { name: 'Residential Area', tags: { highway: 'residential' }, geometry: ['point', 'area'], terms: [] }
    ),
    grass1: new Rapid.Preset(context, 'landuse/grass1',
      { name: 'Grass', tags: { landuse: 'grass' }, geometry: ['point', 'area'], terms: [] }
    ),
    grass2: new Rapid.Preset(context, 'landuse/grass2',
      { name: 'Ğṝȁß', tags: { landuse: 'ğṝȁß' }, geometry: ['point', 'area'], terms: [] }
    ),
    park: new Rapid.Preset(context, 'leisure/park',
      { name: 'Park', tags: { leisure: 'park' }, geometry: ['point', 'area'], terms: [ 'grass' ], matchScore: 0.5 }
    ),
    parking: new Rapid.Preset(context, 'amenity/parking',
      { name: 'Parking', tags: { amenity: 'parking' }, geometry: ['point', 'area'], terms: [ 'cars' ] }
    ),
    soccer: new Rapid.Preset(context, 'leisure/pitch/soccer',
      { name: 'Soccer Field', tags: { leisure: 'pitch', sport: 'soccer' }, geometry: ['point', 'area'], terms: ['fußball'] }
    ),
    football: new Rapid.Preset(context, 'leisure/pitch/american_football',
      { name: 'Football Field', tags: { leisure: 'pitch', sport: 'american_football' }, geometry: ['point', 'area'], terms: ['gridiron'] }
    ),
    excluded: new Rapid.Preset(context, 'amenity/excluded',
      { name: 'Excluded', tags: { amenity: 'excluded' }, geometry: ['point'], terms: [], searchable: false }
    )
  };

  const collection = new Rapid.Collection(context, [
    p.grill, p.sandpit, p.residential, p.grass1, p.grass2,
    p.park, p.parking, p.soccer, p.football, p.excluded
  ]);

  describe('#item', () => {
    it('fetches a preset by id', () => {
      assert.equal(collection.item('highway/residential'), p.residential);
    });
  });

  describe('#index', () => {
    it('return -1 when given id for preset not in the collection', () => {
      assert.equal(collection.index('foobar'), -1);
    });
  });

  describe('#matchGeometry', () => {
    it('returns a new collection only containing presets matching a geometry', () => {
      const arr = collection.matchGeometry('area').array;
      assert.ok(arr.includes(p.residential));
      assert.ok(arr.includes(p.park));
      assert.ok(arr.includes(p.soccer));
      assert.ok(arr.includes(p.football));
    });
  });

  describe.skip('#search', () => {
//// TODO fix - these are all messed up
    it('matches leading name', () => {
      const result = collection.search('resid', 'area').array;
      assert.equal(result.indexOf(p.residential), 0);  // 1. 'Residential' (by name)
    });

    it.skip('returns alternate matches in correct order', () => {
////      const result = collection.search('gri', 'point').matchGeometry('point').array;

//// as of today it is returning
//['amenity/grit_bin',
// 'amenity/bbq',
// 'leisure/park',
// 'landuse/grass1',
// 'landuse/grass2',
// 'amenity/parking',
// 'highway/residential',
// 'leisure/pitch/soccer',
// 'leisure/pitch/american_football'
// ]
//
//      expect(result.indexOf(p.grill), 'Grill').to.eql(0);            // 1. 'Grill' (leading name)
//      expect(result.indexOf(p.football), 'Football').to.eql(1);      // 2. 'Football' (leading term 'gridiron')
//      expect(result.indexOf(p.sandpit), 'Sandpit').to.eql(2);        // 3. 'Sandpit' (leading tag value 'grit_bin')
//      expect(result.indexOf(p.grass1), 'Grass').to.be.within(3,5);   // 4. 'Grass' (similar name)
//      expect(result.indexOf(p.grass2), 'Ğṝȁß').to.be.within(3,5);    // 5. 'Ğṝȁß' (similar name)
//      expect(result.indexOf(p.park), 'Park').to.be.within(3,5);      // 6. 'Park' (similar term 'grass')
    });

    it('sorts preset with matchScore penalty below others', () => {
      const result = collection.search('par', 'point').array;
      assert.equal(result.indexOf(p.parking), 0, 'Parking');   // 1. 'Parking' (default matchScore)
      assert.equal(result.indexOf(p.park), 1, 'Park');         // 2. 'Park' (low matchScore)
    });

    it('ignores matchScore penalty for exact name match', () => {
      const result = collection.search('park', 'point').array;
      assert.equal(result.indexOf(p.park), 0, 'Park');         // 1. 'Park' (low matchScore)
      assert.equal(result.indexOf(p.parking), 1, 'Parking');   // 2. 'Parking' (default matchScore)
    });

    it('considers diacritics on exact matches', () => {
      const result = collection.search('ğṝȁ', 'point').array;
      assert.equal(result.indexOf(p.grass2), 0, 'Ğṝȁß');    // 1. 'Ğṝȁß'  (leading name)
      assert.equal(result.indexOf(p.grass1), 1, 'Grass');   // 2. 'Grass' (similar name)
    });

    it('replaces diacritics on fuzzy matches', () => {
      const result = collection.search('graß', 'point').array;
      assert.ok(result.indexOf(p.grass1) < 2, 'Grass');   // 1. 'Grass' (similar name)
      assert.ok(result.indexOf(p.grass2) < 2, 'Ğṝȁß');    // 2. 'Ğṝȁß'  (similar name)
    });

    // it('includes the appropriate fallback preset', () => {
    //   assert.ok(collection.search('foo', 'point').array.includes(p.point), 'point');
    //   assert.ok(collection.search('foo', 'line').array.includes(p.line), 'line');
    //   assert.ok(collection.search('foo', 'area').array.includes(p.area), 'area');
    // });

    it('excludes presets with searchable: false', () => {
      const result = collection.search('excluded', 'point').array;
      assert.ok(!result.includes(p.excluded));
    });
  });
});
