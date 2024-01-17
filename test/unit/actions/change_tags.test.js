import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';

const it = function() {};  // remove
const expect = function() {};  // remove

test.todo('actionChangeTags', async t => {
    it('changes an entity\'s tags', function () {
        var entity = Rapid.osmEntity(),
            tags   = {foo: 'bar'},
            graph  = Rapid.actionChangeTags(entity.id, tags)(new Rapid.Graph([entity]));
        expect(graph.entity(entity.id).tags).to.eql(tags);
    });
});
