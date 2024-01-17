import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';

const it = function() {};  // remove
const expect = function() {};  // remove

test.todo('actionChangeMember', async t => {
    it('updates the member at the specified index', function () {
        var node     = Rapid.osmNode(),
            relation = Rapid.osmRelation({members: [{id: node.id}]}),
            action   = Rapid.actionChangeMember(relation.id, {id: node.id, role: 'node'}, 0),
            graph    = action(new Rapid.Graph([node, relation]));
        expect(graph.entity(relation.id).members).to.eql([{id: node.id, role: 'node'}]);
    });
});
