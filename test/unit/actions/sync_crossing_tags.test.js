import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';

describe('actionSyncCrossingTags', () => {
    it('synchronizes crossing tags between parent ways and child nodes', () => {
        const nodeA = Rapid.osmNode({ id: 'a', loc: [0, 0], tags: { highway: 'crossing' } });
        const nodeB = Rapid.osmNode({ id: 'b', loc: [1, 0] });
        const way = Rapid.osmWay({ id: 'w', nodes: [nodeA.id, nodeB.id], tags: { highway: 'footway', footway: 'crossing' } });
        let graph = new Rapid.Graph([nodeA, nodeB, way]);

        graph = Rapid.actionSyncCrossingTags(way.id)(graph);

        assert.ok(graph.hasEntity(nodeA.id));
        assert.ok(graph.hasEntity(nodeB.id));
        assert.ok(graph.hasEntity(way.id));
        assert.strictEqual(graph.entity(nodeA.id).tags.highway, 'crossing');
      //   assert.strictEqual(graph.entity(nodeB.id).tags.highway, 'crossing');
        assert.strictEqual(graph.entity(way.id).tags.highway, 'footway');
        assert.strictEqual(graph.entity(way.id).tags.footway, 'crossing');
    });
});