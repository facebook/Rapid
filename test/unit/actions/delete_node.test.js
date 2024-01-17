import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';

const it = function() {};  // remove
const expect = function() {};  // remove

test.todo('actionDeleteNode', async t => {
    it('removes the node from the graph', function () {
        var node   = Rapid.osmNode(),
            action = Rapid.actionDeleteNode(node.id),
            graph  = action(new Rapid.Graph([node]));
        expect(graph.hasEntity(node.id)).to.be.undefined;
    });

    it('removes the node from parent ways', function () {
        var node1  = Rapid.osmNode(),
            node2  = Rapid.osmNode(),
            node3  = Rapid.osmNode(),
            way    = Rapid.osmWay({nodes: [node1.id, node2.id, node3.id]}),
            action = Rapid.actionDeleteNode(node1.id),
            graph  = action(new Rapid.Graph([node1, node2, node3, way]));
        expect(graph.entity(way.id).nodes).to.eql([node2.id, node3.id]);
    });

    it('removes the node from parent relations', function () {
        var node1    = Rapid.osmNode(),
            node2    = Rapid.osmNode(),
            relation = Rapid.osmRelation({members: [{ id: node1.id }, { id: node2.id }]}),
            action   = Rapid.actionDeleteNode(node1.id),
            graph    = action(new Rapid.Graph([node1, node2, relation]));
        expect(graph.entity(relation.id).members).to.eql([{ id: node2.id }]);
    });

    it('deletes parent ways that would otherwise have less than two nodes', function () {
        var node1  = Rapid.osmNode(),
            node2  = Rapid.osmNode(),
            way    = Rapid.osmWay({nodes: [node1.id, node2.id]}),
            action = Rapid.actionDeleteNode(node1.id),
            graph  = action(new Rapid.Graph([node1, node2, way]));
        expect(graph.hasEntity(way.id)).to.be.undefined;
    });

    it('deletes degenerate circular ways', function () {
        var node1  = Rapid.osmNode(),
            node2  = Rapid.osmNode(),
            way    = Rapid.osmWay({nodes: [node1.id, node2.id, node1.id]}),
            action = Rapid.actionDeleteNode(node2.id),
            graph  = action(new Rapid.Graph([node1, node2, way]));
        expect(graph.hasEntity(way.id)).to.be.undefined;
    });

    it('deletes parent relations that become empty', function () {
        var node1    = Rapid.osmNode(),
            relation = Rapid.osmRelation({members: [{ id: node1.id }]}),
            action   = Rapid.actionDeleteNode(node1.id),
            graph    = action(new Rapid.Graph([node1, relation]));
        expect(graph.hasEntity(relation.id)).to.be.undefined;
    });
});
