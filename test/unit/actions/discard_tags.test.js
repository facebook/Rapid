import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';

const it = function() {};  // remove
const expect = function() {};  // remove

test.todo('actionDiscardTags', async t => {
    var discardTags = { created_by: true };

    it('discards obsolete tags from modified entities', function() {
        var way = Rapid.osmWay({ id: 'w1', tags: { created_by: 'Potlatch' } });
        var base = new Rapid.Graph([way]);
        var head = base.replace(way.update({ tags: { created_by: 'Potlatch', foo: 'bar' } }));
        var action = Rapid.actionDiscardTags(new Rapid.Difference(base, head), discardTags);
        expect(action(head).entity(way.id).tags).to.eql({foo: 'bar'});
    });

    it('discards obsolete tags from created entities', function() {
        var way = Rapid.osmWay({ tags: { created_by: 'Potlatch' } });
        var base = new Rapid.Graph();
        var head = base.replace(way);
        var action = Rapid.actionDiscardTags(new Rapid.Difference(base, head), discardTags);
        expect(action(head).entity(way.id).tags).to.eql({});
    });

    it('doesn\'t modify entities without obsolete tags', function() {
        var way = Rapid.osmWay();
        var base = new Rapid.Graph();
        var head = base.replace(way);
        var action = Rapid.actionDiscardTags(new Rapid.Difference(base, head), discardTags);
        expect(action(head).entity(way.id)).to.equal(way);
    });

    it('discards tags with empty values', function() {
        var way = Rapid.osmWay({ tags: { lmnop: '' } });
        var base = new Rapid.Graph();
        var head = base.replace(way);
        var action = Rapid.actionDiscardTags(new Rapid.Difference(base, head), discardTags);
        expect(action(head).entity(way.id).tags).to.eql({});
    });
});
