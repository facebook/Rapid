import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';
import { actionRapidAcceptFeature } from '../../../modules/actions/rapid_accept_feature.js';

describe('actionRapidAcceptFeature', () => {
  it('accepts an external node and adds it to the graph', () => {
    const extGraph = new Rapid.Graph();
    const extNode = new Rapid.osmNode({ id: 'n1', loc: [0, 0], tags: {} });
    extGraph.addEntity(extNode);

    const graph = new Rapid.Graph();
    const result = actionRapidAcceptFeature('n1', extGraph)(graph);

    assert.ok(result instanceof Rapid.Graph);
    if (result && result.entityCount) {
      assert.equal(result.entityCount(), 1);
      assert.deepEqual(result.entity('n1').loc, [0, 0]);
    }
  });

  it('accepts an external way and adds it to the graph', () => {
    const extGraph = new Rapid.Graph();
    const extWay = new Rapid.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags: {} });
    extGraph.addEntity(extWay);

    const graph = new Rapid.Graph();
    const result = actionRapidAcceptFeature('w1', extGraph)(graph);

    assert.ok(result instanceof Rapid.Graph);
    if (result && result.entityCount) {
      assert.equal(result.entityCount(), 1);
      assert.deepEqual(result.entity('w1').nodes, ['n1', 'n2']);
    }
  });

  it('accepts an external relation and adds it to the graph', t => {
    const extGraph = new Rapid.Graph();
    const extRelation = new Rapid.osmRelation({ id: 'r1', members: [], tags: {} });
    extGraph.addEntity(extRelation);

    const graph = new Rapid.Graph();
    const result = actionRapidAcceptFeature('r1', extGraph)(graph);

    assert.ok(result instanceof Rapid.Graph);
    if (result && result.entityCount) {
      assert.equal(result.entityCount(), 1);
      assert.deepEqual(result.entity('r1').members, []);
    }
  });
});