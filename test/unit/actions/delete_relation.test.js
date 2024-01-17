import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';

const it = function() {};  // remove
const expect = function() {};  // remove

test.todo('actionDeleteRelation', async t => {
    it('removes the relation from the graph', function () {
        var relation = Rapid.osmRelation(),
            action   = Rapid.actionDeleteRelation(relation.id),
            graph    = action(new Rapid.Graph([relation]));
        expect(graph.hasEntity(relation.id)).to.be.undefined;
    });

    it('removes the relation from parent relations', function () {
        var a      = Rapid.osmRelation(),
            b      = Rapid.osmRelation(),
            parent = Rapid.osmRelation({members: [{ id: a.id }, { id: b.id }]}),
            action = Rapid.actionDeleteRelation(a.id),
            graph  = action(new Rapid.Graph([a, b, parent]));
        expect(graph.entity(parent.id).members).to.eql([{ id: b.id }]);
    });

    it('deletes member nodes not referenced by another parent', function() {
        var node     = Rapid.osmNode(),
            relation = Rapid.osmRelation({members: [{id: node.id}]}),
            action   = Rapid.actionDeleteRelation(relation.id),
            graph    = action(new Rapid.Graph([node, relation]));
        expect(graph.hasEntity(node.id)).to.be.undefined;
    });

    it('does not delete member nodes referenced by another parent', function() {
        var node     = Rapid.osmNode(),
            way      = Rapid.osmWay({nodes: [node.id]}),
            relation = Rapid.osmRelation({members: [{id: node.id}]}),
            action   = Rapid.actionDeleteRelation(relation.id),
            graph    = action(new Rapid.Graph([node, way, relation]));
        expect(graph.hasEntity(node.id)).not.to.be.undefined;
    });

    it('does not delete member nodes with interesting tags', function() {
        var node     = Rapid.osmNode({tags: {highway: 'traffic_signals'}}),
            relation = Rapid.osmRelation({members: [{id: node.id}]}),
            action   = Rapid.actionDeleteRelation(relation.id),
            graph    = action(new Rapid.Graph([node, relation]));
        expect(graph.hasEntity(node.id)).not.to.be.undefined;
    });

    it('deletes member ways not referenced by another parent', function() {
        var way      = Rapid.osmWay(),
            relation = Rapid.osmRelation({members: [{id: way.id}]}),
            action   = Rapid.actionDeleteRelation(relation.id),
            graph    = action(new Rapid.Graph([way, relation]));
        expect(graph.hasEntity(way.id)).to.be.undefined;
    });

    it('does not delete member ways referenced by another parent', function() {
        var way       = Rapid.osmWay(),
            relation1 = Rapid.osmRelation({members: [{id: way.id}]}),
            relation2 = Rapid.osmRelation({members: [{id: way.id}]}),
            action    = Rapid.actionDeleteRelation(relation1.id),
            graph     = action(new Rapid.Graph([way, relation1, relation2]));
        expect(graph.hasEntity(way.id)).not.to.be.undefined;
    });

    it('does not delete member ways with interesting tags', function() {
        var way      = Rapid.osmNode({tags: {highway: 'residential'}}),
            relation = Rapid.osmRelation({members: [{id: way.id}]}),
            action   = Rapid.actionDeleteRelation(relation.id),
            graph    = action(new Rapid.Graph([way, relation]));
        expect(graph.hasEntity(way.id)).not.to.be.undefined;
    });

    it('deletes nodes of deleted member ways', function() {
        var node     = Rapid.osmNode(),
            way      = Rapid.osmWay({nodes: [node.id]}),
            relation = Rapid.osmRelation({members: [{id: way.id}]}),
            action   = Rapid.actionDeleteRelation(relation.id),
            graph    = action(new Rapid.Graph([node, way, relation]));
        expect(graph.hasEntity(node.id)).to.be.undefined;
    });

    it('deletes parent relations that become empty', function () {
        var child  = Rapid.osmRelation(),
            parent = Rapid.osmRelation({members: [{ id: child.id }]}),
            action = Rapid.actionDeleteRelation(child.id),
            graph  = action(new Rapid.Graph([child, parent]));
        expect(graph.hasEntity(parent.id)).to.be.undefined;
    });

    // This was moved to operationDelete.  We should test operations and move this test there.
    // it('#disabled', function() {
    //     it('returns \'incomplete_relation\' if the relation is incomplete', function() {
    //         var relation = Rapid.osmRelation({members: [{id: 'w'}]}),
    //             graph    = new Rapid.Graph([relation]),
    //             action   = Rapid.actionDeleteRelation(relation.id);
    //         expect(action.disabled(graph)).to.equal('incomplete_relation');
    //     });
    // });
});
