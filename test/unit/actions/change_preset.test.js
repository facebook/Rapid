import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';

test('actionChangePreset', async t => {
  class MockContext {
    constructor()   { }
  }

  const context = new MockContext();
  const oldPreset = new Rapid.Preset(context, 'old', {tags: {old: 'true'}});
  const newPreset = new Rapid.Preset(context, 'new', {tags: {new: 'true'}});

  await t.test('changes from one preset\'s tags to another\'s', () => {
    const entity = Rapid.osmNode({tags: {old: 'true'}});
    const graph = new Rapid.Graph([entity]);
    const action = Rapid.actionChangePreset(entity.id, oldPreset, newPreset);
    const result = action(graph);

    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity(entity.id).tags, {new: 'true'});
  });

  await t.test('adds the tags of a new preset to an entity without an old preset', () => {
    const entity = Rapid.osmNode();
    const graph = new Rapid.Graph([entity]);
    const action = Rapid.actionChangePreset(entity.id, null, newPreset);
    const result = action(graph);

    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity(entity.id).tags, {new: 'true'});
  });

  await t.test('removes the tags of an old preset from an entity without a new preset', () => {
    const entity = Rapid.osmNode({tags: {old: 'true'}});
    const graph = new Rapid.Graph([entity]);
    const action = Rapid.actionChangePreset(entity.id, oldPreset, null);
    const result = action(graph);

    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity(entity.id).tags, {});
  });
});
