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
        assert.ok(graph.hasEntity(node.id));
        assert.ok(graph.hasEntity(way.id));
    });


    it('accepts a way with duplicate nodes', () => {
        const node1 = Rapid.osmNode({ id: 'a', loc: [0, 0] });
        const node2 = Rapid.osmNode({ id: 'b', loc: [1, 1], tags: { dupe: 'a' } });
        const way = Rapid.osmWay({ id: 'w', nodes: [node1.id, node2.id] });
        const graph = Rapid.actionRapidAcceptFeature(way.id, new Rapid.Graph([node1, node2, way]))(new Rapid.Graph());
        assert.ok(graph.hasEntity(way.id));
    });


    it('accepts a relation with nested relations', () => {
        const node = Rapid.osmNode({ id: 'a', loc: [0, 0] });
        const way = Rapid.osmWay({ id: 'w', nodes: [node.id] });
        const relation1 = Rapid.osmRelation({ id: 'r1', members: [{ id: way.id }] });
        const relation2 = Rapid.osmRelation({ id: 'r2', members: [{ id: relation1.id }] });
        const graph = Rapid.actionRapidAcceptFeature(relation2.id, new Rapid.Graph([node, way, relation1, relation2]))(new Rapid.Graph());
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


    describe('auto-connect endpoints', () => {
        // Helper: build an OSM graph containing the given entities, and a Tree indexing them
        function buildOsmScene(osmEntities) {
            const osmGraph = new Rapid.Graph(osmEntities);
            const tree = new Rapid.Tree(osmGraph);
            tree.rebase(osmEntities);
            return { osmGraph, tree };
        }

        // Shared fixture: east-west residential highway [0,0] -> [1,0]
        function makeHighway(tags) {
            const hwyN1 = Rapid.osmNode({ id: 'n1', loc: [0, 0] });
            const hwyN2 = Rapid.osmNode({ id: 'n2', loc: [1, 0] });
            const highway = Rapid.osmWay({ id: 'w1', nodes: ['n1', 'n2'],
                tags: Object.assign({ highway: 'residential' }, tags) });
            return [hwyN1, hwyN2, highway];
        }

        // Helper: build a TomTom external graph with a 2-node way
        // First node at [0.5, 0.5], second node at the given loc
        function makeExtGraph(endpointLoc, wayTags) {
            const extN1 = Rapid.osmNode({ id: 'e1', loc: [0.5, 0.5] });
            const extN2 = Rapid.osmNode({ id: 'e2', loc: endpointLoc });
            const extWay = Rapid.osmWay({ id: 'ew1', nodes: ['e1', 'e2'],
                tags: Object.assign({ highway: 'tertiary' }, wayTags) });
            return new Rapid.Graph([extN1, extN2, extWay]);
        }

        // Helper: build ext graph where nodes have custom tags
        function makeExtGraphWithNodeTags(endpointLoc, nodeTags, wayTags) {
            const extN1 = Rapid.osmNode({ id: 'e1', loc: [0.5, 0.5] });
            const extN2 = Rapid.osmNode({ id: 'e2', loc: endpointLoc, tags: nodeTags });
            const extWay = Rapid.osmWay({ id: 'ew1', nodes: ['e1', 'e2'],
                tags: Object.assign({ highway: 'tertiary' }, wayTags) });
            return new Rapid.Graph([extN1, extN2, extWay]);
        }


        it('auto-connects endpoint to nearby highway segment', () => {
            const { osmGraph, tree } = buildOsmScene(makeHighway());
            const extGraph = makeExtGraph([0.5, 0.00003]);  // ~3m from highway

            const result = Rapid.actionRapidAcceptFeature('ew1', extGraph, tree)(osmGraph);

            const acceptedWay = result.entity('ew1');
            const endNode = result.entity(acceptedWay.nodes[acceptedWay.nodes.length - 1]);
            assert.ok(Math.abs(endNode.loc[1]) < 0.0001, 'endpoint should be snapped to highway latitude');

            const updatedHighway = result.entity('w1');
            assert.ok(updatedHighway.nodes.length === 3, 'highway should have 3 nodes after splice');
            assert.ok(updatedHighway.nodes.includes(endNode.id), 'highway should include the snapped node');
        });


        it('merges endpoint with nearby existing node', () => {
            const hwyN1 = Rapid.osmNode({ id: 'n1', loc: [0, 0] });
            const hwyN2 = Rapid.osmNode({ id: 'n2', loc: [0.5, 0] });
            const hwyN3 = Rapid.osmNode({ id: 'n3', loc: [1, 0] });
            const highway = Rapid.osmWay({ id: 'w1', nodes: ['n1', 'n2', 'n3'], tags: { highway: 'residential' } });
            const { osmGraph, tree } = buildOsmScene([hwyN1, hwyN2, hwyN3, highway]);

            const extGraph = makeExtGraph([0.5, 0.000005]);  // ~0.5m from n2

            const result = Rapid.actionRapidAcceptFeature('ew1', extGraph, tree)(osmGraph);

            const acceptedWay = result.entity('ew1');
            assert.equal(acceptedWay.nodes[acceptedWay.nodes.length - 1], 'n2',
                'endpoint should be merged with existing highway node');
            assert.ok(!result.hasEntity('e2'), 'orphaned original node should be removed');
        });


        it('preserves shared endpoint when accepting connected Rapid ways', () => {
            const tree = new Rapid.Tree(new Rapid.Graph());

            const smallN1 = Rapid.osmNode({ id: 'n-27', loc: [0, 0] });
            const sharedNode = Rapid.osmNode({ id: 'n-28', loc: [1, 0] });
            const smallWay = Rapid.osmWay({ id: 'w-4', nodes: ['n-27', 'n-28'], tags: { highway: 'residential' } });
            const smallExtGraph = new Rapid.Graph([smallN1, sharedNode, smallWay]);

            let graph = Rapid.actionRapidAcceptFeature('w-4', smallExtGraph, tree)(new Rapid.Graph());
            assert.ok(graph.hasEntity('n-28'), 'shared endpoint should exist after accepting first way');

            const largeN2 = Rapid.osmNode({ id: 'n-29', loc: [2, 0] });
            const largeWay = Rapid.osmWay({ id: 'w-5', nodes: ['n-28', 'n-29'], tags: { highway: 'tertiary' } });
            const largeExtGraph = new Rapid.Graph([sharedNode, largeN2, largeWay]);

            graph = Rapid.actionRapidAcceptFeature('w-5', largeExtGraph, tree)(graph);

            assert.ok(graph.hasEntity('n-28'), 'shared endpoint should not be removed by self-merge');
            assert.deepEqual(graph.childNodes(graph.entity('w-4')).map(node => node.id), ['n-27', 'n-28']);
            assert.deepEqual(graph.childNodes(graph.entity('w-5')).map(node => node.id), ['n-28', 'n-29']);
        });


        it('merges instead of creating duplicate when projection lands on existing node', () => {
            const { osmGraph, tree } = buildOsmScene(makeHighway());

            // Endpoint near n1 but off-axis — projection clamps to n1's location
            const extN1 = Rapid.osmNode({ id: 'e1', loc: [-0.5, 0.5] });
            const extN2 = Rapid.osmNode({ id: 'e2', loc: [-0.00001, 0.00003] });
            const extWay = Rapid.osmWay({ id: 'ew1', nodes: ['e1', 'e2'], tags: { highway: 'tertiary' } });
            const extGraph = new Rapid.Graph([extN1, extN2, extWay]);

            const result = Rapid.actionRapidAcceptFeature('ew1', extGraph, tree)(osmGraph);

            const acceptedWay = result.entity('ew1');
            assert.equal(acceptedWay.nodes[acceptedWay.nodes.length - 1], 'n1',
                'endpoint should be merged with nearby highway node, not duplicated');
            const updatedHighway = result.entity('w1');
            assert.equal(updatedHighway.nodes.length, 2, 'highway should still have 2 nodes (no duplicate)');
        });


        it('does not connect when distance exceeds threshold', () => {
            const { osmGraph, tree } = buildOsmScene(makeHighway());
            const extGraph = makeExtGraph([0.5, 0.0002]);  // ~22m away

            const result = Rapid.actionRapidAcceptFeature('ew1', extGraph, tree)(osmGraph);

            const updatedHighway = result.entity('w1');
            assert.equal(updatedHighway.nodes.length, 2, 'highway should still have 2 nodes');
            const acceptedWay = result.entity('ew1');
            const endNode = result.entity(acceptedWay.nodes[acceptedWay.nodes.length - 1]);
            assert.ok(Math.abs(endNode.loc[1] - 0.0002) < 0.0001, 'endpoint should not be moved');
        });


        it('does not connect across different layers', () => {
            const { osmGraph, tree } = buildOsmScene(makeHighway({ bridge: 'yes', layer: '1' }));
            const extGraph = makeExtGraph([0.5, 0.00003]);  // ~3m from bridge

            const result = Rapid.actionRapidAcceptFeature('ew1', extGraph, tree)(osmGraph);

            const updatedHighway = result.entity('w1');
            assert.equal(updatedHighway.nodes.length, 2, 'highway should still have 2 nodes');
        });


        it('preserves existing conn tag behavior', () => {
            const { osmGraph, tree } = buildOsmScene(makeHighway());
            const extGraph = makeExtGraphWithNodeTags(
                [0.5, 0.00003], { conn: 'w1,n1,n2' }
            );

            const result = Rapid.actionRapidAcceptFeature('ew1', extGraph, tree)(osmGraph);

            const acceptedWay = result.entity('ew1');
            assert.ok(acceptedWay, 'way should be accepted');
            const endNode = result.entity(acceptedWay.nodes[acceptedWay.nodes.length - 1]);
            assert.ok(!endNode.tags.conn, 'conn tag should be removed');
        });


        it('skips auto-connect when tree is null', () => {
            const osmGraph = new Rapid.Graph(makeHighway());
            const extGraph = makeExtGraph([0.5, 0.00003]);

            const result = Rapid.actionRapidAcceptFeature('ew1', extGraph)(osmGraph);

            assert.ok(result.hasEntity('ew1'), 'way should be accepted');
            const updatedHighway = result.entity('w1');
            assert.equal(updatedHighway.nodes.length, 2, 'highway should remain unchanged');
        });


        it('connects both endpoints independently', () => {
            const hwyN1 = Rapid.osmNode({ id: 'n1', loc: [0, 0] });
            const hwyN2 = Rapid.osmNode({ id: 'n2', loc: [1, 0] });
            const highway1 = Rapid.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags: { highway: 'residential' } });
            const hwyN3 = Rapid.osmNode({ id: 'n3', loc: [0, 1] });
            const hwyN4 = Rapid.osmNode({ id: 'n4', loc: [1, 1] });
            const highway2 = Rapid.osmWay({ id: 'w2', nodes: ['n3', 'n4'], tags: { highway: 'residential' } });
            const { osmGraph, tree } = buildOsmScene([hwyN1, hwyN2, highway1, hwyN3, hwyN4, highway2]);

            const extN1 = Rapid.osmNode({ id: 'e1', loc: [0.5, 0.00003] });   // ~3m from highway1
            const extN2 = Rapid.osmNode({ id: 'e2', loc: [0.5, 0.99997] });   // ~3m from highway2
            const extWay = Rapid.osmWay({ id: 'ew1', nodes: ['e1', 'e2'], tags: { highway: 'tertiary' } });
            const extGraph = new Rapid.Graph([extN1, extN2, extWay]);

            const result = Rapid.actionRapidAcceptFeature('ew1', extGraph, tree)(osmGraph);

            assert.equal(result.entity('w1').nodes.length, 3, 'highway1 should have 3 nodes after splice');
            assert.equal(result.entity('w2').nodes.length, 3, 'highway2 should have 3 nodes after splice');
        });


        it('inherits highway tag from connected way when accepted way has highway=road', () => {
            const { osmGraph, tree } = buildOsmScene(makeHighway());
            const extGraph = makeExtGraph([0.5, 0.00003], { highway: 'road' });

            const result = Rapid.actionRapidAcceptFeature('ew1', extGraph, tree)(osmGraph);

            const acceptedWay = result.entity('ew1');
            assert.equal(acceptedWay.tags.highway, 'residential',
                'highway tag should be inherited from connected way');
        });


        it('does not inherit highway tag when accepted way has a specific classification', () => {
            const { osmGraph, tree } = buildOsmScene(makeHighway());
            const extGraph = makeExtGraph([0.5, 0.00003]);  // default: highway=tertiary

            const result = Rapid.actionRapidAcceptFeature('ew1', extGraph, tree)(osmGraph);

            const acceptedWay = result.entity('ew1');
            assert.equal(acceptedWay.tags.highway, 'tertiary',
                'highway tag should not be overwritten when it is already specific');
        });
    });
});
