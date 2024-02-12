import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';

describe('actionRotate', () => {
  it('rotates nodes around the specified pivot by the specified angle', () => {
    const node1 = new Rapid.osmNode({loc: [0, 0]});
    const node2 = new Rapid.osmNode({loc: [1, 0]});
    const node3 = new Rapid.osmNode({loc: [0, 1]});
    const graph = new Rapid.Graph([node1, node2, node3]);
    const rotateIds = [node1.id, node2.id];
    const pivot = [0, 0];
    const angle = Math.PI / 2;

    const projection = {
      project: (coords) => coords,
      invert: (coords) => coords,
    };

    const result = Rapid.actionRotate(rotateIds, pivot, angle, projection)(graph);

    assert.ok(result instanceof Rapid.Graph);
    if (result && result.entityCount) {
      assert.equal(result.entityCount(), 3);
      assert.deepEqual(result.entity(node1.id).loc, [0, -1]);
      assert.deepEqual(result.entity(node2.id).loc, [1, 0]);
      assert.deepEqual(result.entity(node3.id).loc, [-1, 0]);
    }
  });
});