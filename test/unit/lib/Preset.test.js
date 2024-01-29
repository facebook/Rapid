import { after, before, describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';


describe('Preset', () => {

  class MockContext {
    constructor()  { }
  }

  const context = new MockContext();

  describe('#fields', () => {
    it('has no fields by default', () => {
      const preset = new Rapid.Preset(context, 'test', {});
      assert.deepEqual(preset.fields(), []);
    });
  });


  describe('#moreFields', () => {
    it('has no moreFields by default', () => {
      const preset = new Rapid.Preset(context, 'test', {});
      assert.deepEqual(preset.moreFields(), []);
    });
  });


  describe('#matchGeometry', () => {
    it('returns false if it doesn\'t match', () => {
      const preset = new Rapid.Preset(context, 'test', { geometry: ['line'] });
      assert.equal(preset.matchGeometry('point'), false);
    });

    it('returns true if it does match', () => {
      const preset = new Rapid.Preset(context, 'test', { geometry: ['point', 'line'] });
      assert.equal(preset.matchGeometry('point'), true);
    });
  });


  describe('#matchAllGeometry', () => {
    it('returns false if they don\'t all match', () => {
      const preset = new Rapid.Preset(context, 'test', { geometry: ['line'] });
      assert.equal(preset.matchAllGeometry(['point', 'line']), false);
    });

    it('returns true if they do all match', () => {
      const preset = new Rapid.Preset(context, 'test', { geometry: ['point', 'line'] });
      assert.equal(preset.matchAllGeometry(['point', 'line']), true);
    });
  });


  describe('#matchScore', () => {
    it('returns -1 if preset does not match tags', () => {
      const preset = new Rapid.Preset(context, 'test', { tags: { foo: 'bar' } });
      const entity = Rapid.osmWay({ tags: { highway: 'motorway' } });
      assert.equal(preset.matchScore(entity.tags), -1);
    });

    it('returns the value of the matchScore property when matched', () => {
      const preset = new Rapid.Preset(context, 'test', { tags: { highway: 'motorway' }, matchScore: 0.2 });
      const entity = Rapid.osmWay({ tags: { highway: 'motorway' } });
      assert.equal(preset.matchScore(entity.tags), 0.2);
    });

    it('defaults to the number of matched tags', () => {
      let preset = new Rapid.Preset(context, 'test', { tags: { highway: 'residential' } });
      let entity = Rapid.osmWay({ tags: { highway: 'residential' } });
      assert.equal(preset.matchScore(entity.tags), 1);

      preset = new Rapid.Preset(context, 'test', { tags: { highway: 'service', service: 'alley' } });
      entity = Rapid.osmWay({ tags: { highway: 'service', service: 'alley' } });
      assert.equal(preset.matchScore(entity.tags), 2);
    });

    it('counts * as a match for any value with score 0.5', () => {
      const preset = new Rapid.Preset(context, 'test', { tags: { building: '*' } });
      const entity = Rapid.osmWay({ tags: { building: 'yep' } });
      assert.equal(preset.matchScore(entity.tags), 0.5);
    });

    it('boosts matchScore for additional matches in addTags', () => {
      const presetSupercenter = new Rapid.Preset(context, 'shop/supermarket/walmart_supercenter', {
        tags: { 'brand:wikidata': 'Q483551', 'shop': 'supermarket' },
        addTags: { 'name': 'Walmart Supercenter'  }
      });
      const presetMarket = new Rapid.Preset(context, 'shop/supermarket/walmart_market', {
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

      const centerMatchCenter = presetSupercenter.matchScore(supercenter.tags);
      const centerMatchMarket = presetMarket.matchScore(supercenter.tags);
      assert.ok(centerMatchCenter > centerMatchMarket);

      const marketMatchCenter = presetSupercenter.matchScore(market.tags);
      const marketMatchMarket = presetMarket.matchScore(market.tags);
      assert.ok(marketMatchMarket > marketMatchCenter);
    });
  });


  describe('isFallback', () => {
    it('returns true if preset has no tags', () => {
      const preset = new Rapid.Preset(context, 'point', { tags: {} });
      assert.equal(preset.isFallback(), true);
    });

    it('returns true if preset has a single \'area\' tag', () => {
      const preset = new Rapid.Preset(context, 'area', { tags: { area: 'yes' } });
      assert.equal(preset.isFallback(), true);
    });

    it('returns false if preset has a single non-\'area\' tag', () => {
      const preset = new Rapid.Preset(context, 'building', { tags: { building: 'yes' } });
      assert.equal(preset.isFallback(), false);
    });

    it('returns false if preset has multiple tags', () => {
      const preset = new Rapid.Preset(context, 'building', { tags: { area: 'yes', building: 'yes' } });
      assert.equal(preset.isFallback(), false);
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
      const preset = new Rapid.Preset(context, 'test', { tags: { highway: 'residential' } });
      assert.deepEqual(preset.setTags({}, 'line'), { highway: 'residential' });
    });

    it('adds wildcard tags with value \'yes\'', () => {
      const preset = new Rapid.Preset(context, 'test', { tags: { natural: '*' } });
      assert.deepEqual(preset.setTags({}, 'area'), { natural: 'yes' });
    });

    it('prefers to add tags of addTags property', () => {
      const preset = new Rapid.Preset(context, 'test', { tags: { building: '*' }, addTags: { building: 'ok' } });
      assert.deepEqual(preset.setTags({}, 'area'), { building: 'ok' });
    });

    it('adds default tags of fields with matching geometry', () => {
      const field = new Rapid.Field(context, 'field', { key: 'building', geometry: 'area', default: 'yes' });
      const preset = new Rapid.Preset(context, 'test', { fields: ['field'] }, { field: field });
      assert.deepEqual(preset.setTags({}, 'area'), { area: 'yes', building: 'yes' });
    });

    it('adds no default tags of fields with non-matching geometry', () => {
      const field = new Rapid.Field(context, 'field', { key: 'building', geometry: 'area', default: 'yes' });
      const preset = new Rapid.Preset(context, 'test', { fields: ['field'] }, { field: field });
      assert.deepEqual(preset.setTags({}, 'point'), {});
    });


    describe('for a preset with no tag in areaKeys', () => {
      const preset = new Rapid.Preset(context, 'test', { geometry: ['line', 'area'], tags: { name: 'testname', highway: 'pedestrian' } });

      it('doesn\'t add area=yes to non-areas', () => {
        assert.deepEqual(preset.setTags({}, 'line'), { name: 'testname', highway: 'pedestrian' });
      });

      it('adds area=yes to areas', () => {
        assert.deepEqual(preset.setTags({}, 'area'), { name: 'testname', highway: 'pedestrian', area: 'yes' });
      });
    });


    describe('for a preset with a tag in areaKeys', () => {
      it('doesn\'t add area=yes automatically', () => {
        const preset = new Rapid.Preset(context, 'test', { geometry: ['area'], tags: { name: 'testname', building: 'yes' } });
        assert.deepEqual(preset.setTags({}, 'area'), { name: 'testname', building: 'yes' });
      });

      it('does add area=yes if asked to', () => {
        const preset = new Rapid.Preset(context, 'test', { geometry: ['area'], tags: { name: 'testname', area: 'yes' } });
        assert.deepEqual(preset.setTags({}, 'area'), { name: 'testname', area: 'yes' });
      });
    });
  });


  describe('#unsetTags', () => {
    it('removes tags that match preset tags', () => {
      const preset = new Rapid.Preset(context, 'test', { tags: { highway: 'residential' } });
      assert.deepEqual(preset.unsetTags({ highway: 'residential' }, 'area'), {});
    });

    it('removes tags that match field default tags', () => {
      const field = new Rapid.Field(context, 'field', { key: 'building', geometry: 'area', default: 'yes' });
      const preset = new Rapid.Preset(context, 'test', { fields: ['field'] }, { field: field });
      assert.deepEqual(preset.unsetTags({ building: 'yes' }, 'area'), {});
    });

    it('removes area=yes', () => {
      const preset = new Rapid.Preset(context, 'test', { tags: { highway: 'pedestrian' } });
      assert.deepEqual(preset.unsetTags({ highway: 'pedestrian', area: 'yes' }, 'area'), {});
    });

    it('preserves tags that do not match field default tags', () => {
      const field = new Rapid.Field(context, 'field', { key: 'building', geometry: 'area', default: 'yes' });
      const preset = new Rapid.Preset(context, 'test', { fields: ['field'] }, { field: field });
      assert.deepEqual(preset.unsetTags({ building: 'yep' }, 'area'), { building: 'yep' });
    });

    it('preserves tags that are not listed in removeTags', () => {
      const preset = new Rapid.Preset(context, 'test', { tags: { a: 'b' }, removeTags: {} });
      assert.deepEqual(preset.unsetTags({ a: 'b' }, 'area'), { a: 'b' });
    });

    it('uses tags from addTags if removeTags is not defined', () => {
      const preset = new Rapid.Preset(context, 'test', { tags: { a: 'b' }, addTags: { remove: 'me' } });
      assert.deepEqual(preset.unsetTags({ a: 'b', remove: 'me' }, 'area'), { a: 'b' });
    });
  });

});
