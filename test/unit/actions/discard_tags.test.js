import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';

test.todo('actionDiscardTags', async t => {
  const discardTags = { created_by: true };

  await t.test('defaults to empty discardTags', t => {
    const way = Rapid.osmWay({ id: 'w1', tags: { created_by: 'Potlatch' } });
    const base = new Rapid.Graph();
    const head = base.replace(way);
    const action = Rapid.actionDiscardTags(new Rapid.Difference(base, head));  // no discardTags
    const result = action(head);
    assert.ok(result instanceof Rapid.Graph);
    assert.equal(result.entity('w1'), way);
  });

  await t.test('discards obsolete tags from modified entities', t => {
    const way = Rapid.osmWay({ id: 'w1', tags: { created_by: 'Potlatch' } });
    const base = new Rapid.Graph([way]);
    const head = base.replace(way.update({ tags: { created_by: 'Potlatch', foo: 'bar' } }));
    const action = Rapid.actionDiscardTags(new Rapid.Difference(base, head), discardTags);
    const result = action(head);
    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity('w1').tags, {foo: 'bar'});
  });

  await t.test('discards obsolete tags from created entities', t => {
    const way = Rapid.osmWay({ id: 'w1', tags: { created_by: 'Potlatch' } });
    const base = new Rapid.Graph();
    const head = base.replace(way);
    const action = Rapid.actionDiscardTags(new Rapid.Difference(base, head), discardTags);
    const result = action(head);
    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity('w1').tags, {});
  });

  await t.test('doesn\'t modify entities without obsolete tags', t => {
    const way = Rapid.osmWay({ id: 'w1' });
    const base = new Rapid.Graph();
    const head = base.replace(way);
    const action = Rapid.actionDiscardTags(new Rapid.Difference(base, head), discardTags);
    const result = action(head);
    assert.ok(result instanceof Rapid.Graph);
    assert.equal(result.entity('w1'), way);
  });

  await t.test('discards tags with empty values', t => {
    const way = Rapid.osmWay({ id: 'w1', tags: { lmnop: '' } });
    const base = new Rapid.Graph();
    const head = base.replace(way);
    const action = Rapid.actionDiscardTags(new Rapid.Difference(base, head), discardTags);
    const result = action(head);
    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity('w1').tags, {});
  });

});
