import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';


describe('actionDiscardTags', () => {
  const discardTags = { created_by: true };

  it('defaults to empty discardTags', () => {
    const way = Rapid.osmWay({ id: 'w1', tags: { created_by: 'Potlatch' } });
    const base = new Rapid.Graph();
    const head = base.replace(way);
    const action = Rapid.actionDiscardTags(new Rapid.Difference(base, head));  // no discardTags
    const result = action(head);
    assert.ok(result instanceof Rapid.Graph);
    assert.equal(result.entity('w1'), way);
  });

  it('discards obsolete tags from modified entities', () => {
    const way = Rapid.osmWay({ id: 'w1', tags: { created_by: 'Potlatch' } });
    const base = new Rapid.Graph([way]);
    const head = base.replace(way.update({ tags: { created_by: 'Potlatch', foo: 'bar' } }));
    const action = Rapid.actionDiscardTags(new Rapid.Difference(base, head), discardTags);
    const result = action(head);
    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity('w1').tags, {foo: 'bar'});
  });

  it('discards obsolete tags from created entities', () => {
    const way = Rapid.osmWay({ id: 'w1', tags: { created_by: 'Potlatch' } });
    const base = new Rapid.Graph();
    const head = base.replace(way);
    const action = Rapid.actionDiscardTags(new Rapid.Difference(base, head), discardTags);
    const result = action(head);
    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity('w1').tags, {});
  });

  it('doesn\'t modify entities without obsolete tags', () => {
    const way = Rapid.osmWay({ id: 'w1' });
    const base = new Rapid.Graph();
    const head = base.replace(way);
    const action = Rapid.actionDiscardTags(new Rapid.Difference(base, head), discardTags);
    const result = action(head);
    assert.ok(result instanceof Rapid.Graph);
    assert.equal(result.entity('w1'), way);
  });

  it('discards tags with empty values', () => {
    const way = Rapid.osmWay({ id: 'w1', tags: { lmnop: '' } });
    const base = new Rapid.Graph();
    const head = base.replace(way);
    const action = Rapid.actionDiscardTags(new Rapid.Difference(base, head), discardTags);
    const result = action(head);
    assert.ok(result instanceof Rapid.Graph);
    assert.deepEqual(result.entity('w1').tags, {});
  });

});
