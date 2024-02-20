import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';

describe('actionRapidAcceptFeature', () => {
    it('accepts a node', () => {
        const node = Rapid.osmNode({ id: 'a', loc: [0, 0] });
        const graph = Rapid.actionRapidAcceptFeature(node.id, new Rapid.Graph([node]))(new Rapid.Graph());

        assert.ok(graph.hasEntity(node.id));
    });


    it('accepts a way', () => {
        const node1 = Rapid.osmNode({ id: 'a', loc: [0, 0] });
        const node2 = Rapid.osmNode({ id: 'b', loc: [1, 1] });
        const way = Rapid.osmWay({ id: 'w', nodes: [node1.id, node2.id] });
        const graph = Rapid.actionRapidAcceptFeature(way.id, new Rapid.Graph([node1, node2, way]))(new Rapid.Graph());

        assert.ok(graph.hasEntity(way.id));
    });


    it('accepts a relation', () => {
        const node = Rapid.osmNode({ id: 'a', loc: [0, 0] });
        const way = Rapid.osmWay({ id: 'w', nodes: [node.id] });
        const relation = Rapid.osmRelation({ id: 'r', members: [{ id: way.id }] });
        const graph = Rapid.actionRapidAcceptFeature(relation.id, new Rapid.Graph([node, way, relation]))(new Rapid.Graph());

        assert.ok(graph.hasEntity(relation.id));
    });


    it('accepts a node with connection tags', () => {
        const node = Rapid.osmNode({ id: 'a', loc: [0, 0], tags: { conn: 'w1,n1,n2' } });
        const way = Rapid.osmWay({ id: 'w1', nodes: ['n1', 'n2'] });
        const node1 = Rapid.osmNode({ id: 'n1', loc: [0, 1] });
        const node2 = Rapid.osmNode({ id: 'n2', loc: [1, 1] });
        const extGraph = new Rapid.Graph([node, way, node1, node2]);
        const graph = Rapid.actionRapidAcceptFeature(node.id, extGraph)(new Rapid.Graph([way, node1, node2]));
        // Replace with your actual assertions
        assert.ok(graph.hasEntity(node.id));
        assert.ok(graph.hasEntity(way.id));
    });


    it('accepts a way with duplicate nodes', () => {
        const node1 = Rapid.osmNode({ id: 'a', loc: [0, 0] });
        const node2 = Rapid.osmNode({ id: 'b', loc: [1, 1], tags: { dupe: 'a' } });
        const way = Rapid.osmWay({ id: 'w', nodes: [node1.id, node2.id] });
        const graph = Rapid.actionRapidAcceptFeature(way.id, new Rapid.Graph([node1, node2, way]))(new Rapid.Graph());
        // Replace with your actual assertions
        assert.ok(graph.hasEntity(way.id));
    });


    it('accepts a relation with nested relations', () => {
        const node = Rapid.osmNode({ id: 'a', loc: [0, 0] });
        const way = Rapid.osmWay({ id: 'w', nodes: [node.id] });
        const relation1 = Rapid.osmRelation({ id: 'r1', members: [{ id: way.id }] });
        const relation2 = Rapid.osmRelation({ id: 'r2', members: [{ id: relation1.id }] });
        const graph = Rapid.actionRapidAcceptFeature(relation2.id, new Rapid.Graph([node, way, relation1, relation2]))(new Rapid.Graph());
        // Replace with your actual assertions
        assert.ok(graph.hasEntity(relation2.id));
    });


    it('accepts a node with changed location', () => {
        const node = Rapid.osmNode({ id: 'a', loc: [0, 0] });
        const graph = new Rapid.Graph([node]);
        const newNode = Rapid.osmNode({ id: 'a', loc: [1, 1] });
        const newGraph = Rapid.actionRapidAcceptFeature(newNode.id, new Rapid.Graph([newNode]))(graph);
        assert.ok(newGraph.hasEntity(newNode.id));
        assert.deepStrictEqual(newGraph.entity(newNode.id).loc, [1, 1]);
    });


    it('accepts an entity of type node', () => {
        const node = Rapid.osmNode({ id: 'a', loc: [0, 0] });
        const graph = Rapid.actionRapidAcceptFeature(node.id, new Rapid.Graph([node]))(new Rapid.Graph());
        assert.ok(graph.hasEntity(node.id));
    });
});