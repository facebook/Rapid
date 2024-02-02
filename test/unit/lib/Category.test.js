import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';


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
    assert.ok(category.members instanceof Rapid.Collection);
    assert.equal(category.members.array[0], residential);
  });

  describe('#matchGeometry', () => {
    it('matches the type of an entity', () => {
      assert.equal(category.matchGeometry('line'), true);
      assert.equal(category.matchGeometry('point'), false);
    });
  });
});
