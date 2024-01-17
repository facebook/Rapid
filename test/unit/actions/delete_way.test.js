import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';

const it = function() {};  // remove
const expect = function() {};  // remove

test.todo('actionDeleteWay', async t => {
    it('removes the way from the graph', function() {
        var way    = Rapid.osmWay(),
            action = Rapid.actionDeleteWay(way.id),
            graph  = new Rapid.Graph([way]).update(action);
        expect(graph.hasEntity(way.id)).to.be.undefined;
    });

    it('removes a way from parent relations', function() {
        var way      = Rapid.osmWay(),
            relation = Rapid.osmRelation({members: [{ id: way.id }, { id: 'w-2' }]}),
            action   = Rapid.actionDeleteWay(way.id),
            graph    = new Rapid.Graph([way, relation]).update(action),
            ids      = graph.entity(relation.id).members.map(function (m) { return m.id; });
        expect(ids).not.to.contain(way.id);
    });

    it('deletes member nodes not referenced by another parent', function() {
        var node   = Rapid.osmNode(),
            way    = Rapid.osmWay({nodes: [node.id]}),
            action = Rapid.actionDeleteWay(way.id),
            graph  = new Rapid.Graph([node, way]).update(action);
        expect(graph.hasEntity(node.id)).to.be.undefined;
    });

    it('does not delete member nodes referenced by another parent', function() {
        var node   = Rapid.osmNode(),
            way1   = Rapid.osmWay({nodes: [node.id]}),
            way2   = Rapid.osmWay({nodes: [node.id]}),
            action = Rapid.actionDeleteWay(way1.id),
            graph  = new Rapid.Graph([node, way1, way2]).update(action);
        expect(graph.hasEntity(node.id)).not.to.be.undefined;
    });

    it('deletes multiple member nodes', function() {
        var a      = Rapid.osmNode(),
            b      = Rapid.osmNode(),
            way    = Rapid.osmWay({nodes: [a.id, b.id]}),
            action = Rapid.actionDeleteWay(way.id),
            graph  = new Rapid.Graph([a, b, way]).update(action);
        expect(graph.hasEntity(a.id)).to.be.undefined;
        expect(graph.hasEntity(b.id)).to.be.undefined;
    });

    it('deletes a circular way\'s start/end node', function() {
        var a      = Rapid.osmNode(),
            b      = Rapid.osmNode(),
            c      = Rapid.osmNode(),
            way    = Rapid.osmWay({nodes: [a.id, b.id, c.id, a.id]}),
            action = Rapid.actionDeleteWay(way.id),
            graph  = new Rapid.Graph([a, b, c, way]).update(action);
        expect(graph.hasEntity(a.id)).to.be.undefined;
        expect(graph.hasEntity(b.id)).to.be.undefined;
        expect(graph.hasEntity(c.id)).to.be.undefined;
    });

    it('does not delete member nodes with interesting tags', function() {
        var node   = Rapid.osmNode({tags: {highway: 'traffic_signals'}}),
            way    = Rapid.osmWay({nodes: [node.id]}),
            action = Rapid.actionDeleteWay(way.id),
            graph  = new Rapid.Graph([node, way]).update(action);
        expect(graph.hasEntity(node.id)).not.to.be.undefined;
    });

    it('deletes parent relations that become empty', function () {
        var way      = Rapid.osmWay(),
            relation = Rapid.osmRelation({members: [{ id: way.id }]}),
            action   = Rapid.actionDeleteWay(way.id),
            graph    = new Rapid.Graph([way, relation]).update(action);
        expect(graph.hasEntity(relation.id)).to.be.undefined;
    });

    // This was moved to operationDelete.  We should test operations and move this test there.
    // it('#disabled', function () {
    //     it('returns \'part_of_relation\' for members of route and boundary relations', function () {
    //         var a        = Rapid.osmWay({id: 'a'}),
    //             b        = Rapid.osmWay({id: 'b'}),
    //             route    = Rapid.osmRelation({members: [{id: 'a'}], tags: {type: 'route'}}),
    //             boundary = Rapid.osmRelation({members: [{id: 'b'}], tags: {type: 'boundary'}}),
    //             graph    = new Rapid.Graph([a, b, route, boundary]);
    //         expect(Rapid.actionDeleteWay('a').disabled(graph)).to.equal('part_of_relation');
    //         expect(Rapid.actionDeleteWay('b').disabled(graph)).to.equal('part_of_relation');
    //     });

    //     it('returns \'part_of_relation\' for outer members of multipolygons', function () {
    //         var way      = Rapid.osmWay({id: 'w'}),
    //             relation = Rapid.osmRelation({members: [{id: 'w', role: 'outer'}], tags: {type: 'multipolygon'}}),
    //             graph    = new Rapid.Graph([way, relation]),
    //             action   = Rapid.actionDeleteWay(way.id);
    //         expect(action.disabled(graph)).to.equal('part_of_relation');
    //     });

    //     it('returns falsy for inner members of multipolygons', function () {
    //         var way      = Rapid.osmWay({id: 'w'}),
    //             relation = Rapid.osmRelation({members: [{id: 'w', role: 'inner'}], tags: {type: 'multipolygon'}}),
    //             graph    = new Rapid.Graph([way, relation]),
    //             action   = Rapid.actionDeleteWay(way.id);
    //         expect(action.disabled(graph)).not.ok;
    //     });
    // });
});
