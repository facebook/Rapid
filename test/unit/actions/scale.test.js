import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';


// Mock viewport
const viewport = {
  project: (loc) => loc,
  unproject: (loc) => loc
};

describe('actionScale', () => {
  it('scales nodes around a pivot point', () => {
    const nodeA = Rapid.osmNode({ id: 'a', loc: [0, 0] });
    const nodeB = Rapid.osmNode({ id: 'b', loc: [1, 0] });
    const graph = new Rapid.Graph([nodeA, nodeB]);

    // Pivot point and scale factor
    const pivot = [0, 0];
    const scaleFactor = 2;
    const newGraph = Rapid.actionScale([nodeA.id, nodeB.id], pivot, scaleFactor, viewport)(graph);

    assert.ok(newGraph.hasEntity(nodeA.id));
    assert.ok(newGraph.hasEntity(nodeB.id));
    assert.deepStrictEqual(newGraph.entity(nodeA.id).loc, [0, 0]);
    assert.deepStrictEqual(newGraph.entity(nodeB.id).loc, [2, 0]);
  });
});
