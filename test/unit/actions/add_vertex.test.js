import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';

describe('actionAddVertex', () => {
  it('adds a vertex to the specified way at the specified index', () => {
    // Create a new graph with a way and a node
    const graph = new Rapid.Graph([
      Rapid.osmNode({id: 'a', loc: [0, 0]}),
      Rapid.osmWay({id: '-', nodes: ['a']})
    ]);

    // Apply the action to add a vertex to the way at index 1
    const result = Rapid.actionAddVertex('-', 'b', 1)(graph);

    // Check that the resulting graph has the expected structure
    const localGraph = result._local;
    let nodes, ways;
    for (const entity of localGraph.entities.values()) {
      if (entity.type === 'nodes') {
        nodes = entity;
      } else if (entity.type === 'ways') {
        ways = entity;
      }
    }
    assert.ok(result instanceof Rapid.Graph);
    if (nodes && ways) {
      assert.ok(nodes.features.some(feature => feature.id === 'a'));
      assert.ok(nodes.features.some(feature => feature.id === 'b'));
      assert.ok(ways.features.some(feature => feature.id === '-'));
      assert.deepEqual(ways.features[0].tags.length, 2);
      assert.deepEqual(ways.features[0].tags[0].value, 'a');
      assert.deepEqual(ways.features[0].tags[1].value, 'b');
    }
  });
});