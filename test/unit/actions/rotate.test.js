import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';


// This discrepancy is due to the precision of JavaScript's floating-point arithmetic.
// The value 6.123233995736766e-17 is extremely close to 0, but it's not exactly 0 due to the limitations
// of floating-point precision.
// Helper function to check if two numbers are approximately equal
function approxEqual(a, b, epsilon = 1e-6) {
  return Math.abs(a - b) < epsilon;
}

// Mock viewport
const viewport = {
  project: (loc) => loc,
  unproject: (loc) => loc
};


describe('actionRotate', () => {
  it('rotates nodes around a pivot point', () => {
    // Define your nodes and graph
    const nodeA = Rapid.osmNode({ id: 'a', loc: [0, 0] });
    const nodeB = Rapid.osmNode({ id: 'b', loc: [1, 0] });
    const graph = new Rapid.Graph([nodeA, nodeB]);
    const pivot = [0, 0];
    const angle = Math.PI / 2;  // 90 degrees in radians

    const newGraph = Rapid.actionRotate([nodeA.id, nodeB.id], pivot, angle, viewport)(graph);

    assert.ok(newGraph.hasEntity(nodeA.id));
    assert.ok(newGraph.hasEntity(nodeB.id));
    assert.ok(approxEqual(newGraph.entity(nodeA.id).loc[0], 0));
    assert.ok(approxEqual(newGraph.entity(nodeA.id).loc[1], 0));
    assert.ok(approxEqual(newGraph.entity(nodeB.id).loc[0], 0));
    assert.ok(approxEqual(newGraph.entity(nodeB.id).loc[1], 1));
  });
});
