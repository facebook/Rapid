import { afterEach, beforeEach, describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Rapid from '../../../modules/headless.js';


describe('actionExtract', () => {
  let graph;

  // mock viewport
  const viewport = {
    project: (coord) => coord,
    unproject: (coord) => coord
  };

  beforeEach(() => {
    graph = new Rapid.Graph();
  });

  afterEach(() => {
    graph = null;
  });


  it('extracts a node from the graph', () => {
    // Graph: n1
    const node = Rapid.osmNode({ id: 'n1', loc: [0, 0] });
    graph = graph.replace(node);
    const action = Rapid.actionExtract('n1', viewport);
    graph = action(graph);
    const extractedNodeID = action.getExtractedNodeID();
    const extractedNode = graph.entity(extractedNodeID);
    assert.strictEqual(extractedNode.loc[0], 0);
    assert.strictEqual(extractedNode.loc[1], 0);
  });

  it('extracts a way from the graph', () => {
    // Graph: n1 -- n2
    const node1 = Rapid.osmNode({ id: 'n1', loc: [0, 0] });
    const node2 = Rapid.osmNode({ id: 'n2', loc: [1, 1] });
    const way = Rapid.osmWay({ id: 'w1', nodes: ['n1', 'n2'] });
    graph = graph.replace(node1).replace(node2).replace(way);
    const action = Rapid.actionExtract('w1', viewport);
    graph = action(graph);
    const extractedNodeID = action.getExtractedNodeID();
    const extractedNode = graph.entity(extractedNodeID);
    assert.strictEqual(extractedNode.loc[0], 0.5);
    assert.strictEqual(extractedNode.loc[1], 0.5);
  });

  it('extracts a node from a relation', () => {
    // Graph: (n1, n2)
    const node1 = Rapid.osmNode({ id: 'n1', loc: [0, 0] });
    const node2 = Rapid.osmNode({ id: 'n2', loc: [1, 1] });
    const relation = Rapid.osmRelation({ id: 'r1', members: [{ id: 'n1', type: 'node' }, { id: 'n2', type: 'node' }] });
    graph = graph.replace(node1).replace(node2).replace(relation);

    const action = Rapid.actionExtract('n1', viewport);
    graph = action(graph);

    const extractedNodeID = action.getExtractedNodeID();
    const extractedNode = graph.entity(extractedNodeID);

    assert.strictEqual(extractedNode.loc[0], 0);
    assert.strictEqual(extractedNode.loc[1], 0);
  });

  it('extracts a node from a LineString', () => {
    const node1 = Rapid.osmNode({ id: 'n1', loc: [0, 0] });
    const node2 = Rapid.osmNode({ id: 'n2', loc: [1, 1] });
    const way = Rapid.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags: { 'building': 'yes' } });
    graph = graph.replace(node1).replace(node2).replace(way);
    const action = Rapid.actionExtract('w1', viewport);
    graph = action(graph);
    const extractedNodeID = action.getExtractedNodeID();
    const extractedNode = graph.entity(extractedNodeID);
    assert.strictEqual(extractedNode.loc[0], 0.5);
    assert.strictEqual(extractedNode.loc[1], 0.5);
  });

  it('extracts a node from a closed way', () => {
    // Graph: n1 -- n2 -- n3 -- n4 -- n1 (closed way)
    const node1 = Rapid.osmNode({ id: 'n1', loc: [0, 0] });
    const node2 = Rapid.osmNode({ id: 'n2', loc: [1, 0] });
    const node3 = Rapid.osmNode({ id: 'n3', loc: [1, 1] });
    const node4 = Rapid.osmNode({ id: 'n4', loc: [0, 1] });
    const way = Rapid.osmWay({ id: 'w1', nodes: ['n1', 'n2', 'n3', 'n4', 'n1'] });
    graph = graph.replace(node1).replace(node2).replace(node3).replace(node4).replace(way);

    const action = Rapid.actionExtract('n1', viewport);
    graph = action(graph);

    const extractedNodeID = action.getExtractedNodeID();
    const extractedNode = graph.entity(extractedNodeID);

    assert.strictEqual(extractedNode.loc[0], 0);
    assert.strictEqual(extractedNode.loc[1], 0);
  });

  it('extracts a node from a way with no points', () => {
    // Graph: w1 (way with no nodes)
    const way = Rapid.osmWay({ id: 'w1', nodes: [] });
    graph = graph.replace(way);
    const action = Rapid.actionExtract('w1', viewport);
    const result = action(graph);
    // Assert that the graph is unchanged
    assert.strictEqual(result, graph);
  });

  it('extracts a node from a way with one point', () => {
    // Graph: n1 -- w1 (way with one node)
    const node = Rapid.osmNode({ id: 'n1', loc: [0, 0] });
    const way = Rapid.osmWay({ id: 'w1', nodes: ['n1'] });
    graph = graph.replace(node).replace(way);
    const action = Rapid.actionExtract('w1', viewport);
    graph = action(graph);
    const extractedNodeID = action.getExtractedNodeID();
    const extractedNode = graph.entity(extractedNodeID);
    assert.strictEqual(extractedNode.loc[0], 0);
    assert.strictEqual(extractedNode.loc[1], 0);
  });

  it('extracts a node from a way with two points', () => {
    // Graph: n1 -- n2
    const node1 = Rapid.osmNode({ id: 'n1', loc: [0, 0] });
    const node2 = Rapid.osmNode({ id: 'n2', loc: [1, 1] });
    const way = Rapid.osmWay({ id: 'w1', nodes: ['n1', 'n2'] });
    graph = graph.replace(node1).replace(node2).replace(way);
    const action = Rapid.actionExtract('w1', viewport);
    graph = action(graph);
    const extractedNodeID = action.getExtractedNodeID();
    const extractedNode = graph.entity(extractedNodeID);
    assert.strictEqual(extractedNode.loc[0], 0.5);
    assert.strictEqual(extractedNode.loc[1], 0.5);
  });

  it('extracts a node from a way with indoor tag', () => {
    // Graph: n1 -- n2 (way with indoor tag)
    const node1 = Rapid.osmNode({ id: 'n1', loc: [0, 0] });
    const node2 = Rapid.osmNode({ id: 'n2', loc: [1, 1] });
    const way = Rapid.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags: { indoor: 'corridor' } });
    graph = graph.replace(node1).replace(node2).replace(way);
    const action = Rapid.actionExtract('w1', viewport);
    graph = action(graph);
    const extractedNodeID = action.getExtractedNodeID();
    const extractedNode = graph.entity(extractedNodeID);
    assert.strictEqual(extractedNode.loc[0], 0.5);
    assert.strictEqual(extractedNode.loc[1], 0.5);
  });

  it('extracts a node from a way with building tag', () => {
    // Graph: n1 -- n2 (way with building tag)
    const node1 = Rapid.osmNode({ id: 'n1', loc: [0, 0] });
    const node2 = Rapid.osmNode({ id: 'n2', loc: [1, 1] });
    const way = Rapid.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags: { building: 'yes', height: '10' } });
    graph = graph.replace(node1).replace(node2).replace(way);
    const action = Rapid.actionExtract('w1', viewport);
    graph = action(graph);
    const extractedNodeID = action.getExtractedNodeID();
    const extractedNode = graph.entity(extractedNodeID);
    assert.strictEqual(extractedNode.loc[0], 0.5);
    assert.strictEqual(extractedNode.loc[1], 0.5);
  });

  it('extracts a node from a way with source tag', () => {
    // Graph: n1 -- n2 (way with source tag)
    const node1 = Rapid.osmNode({ id: 'n1', loc: [0, 0] });
    const node2 = Rapid.osmNode({ id: 'n2', loc: [1, 1] });
    const way = Rapid.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags: { source: 'test_source' } });
    graph = graph.replace(node1).replace(node2).replace(way);
    const action = Rapid.actionExtract('w1', viewport);
    graph = action(graph);
    const extractedNodeID = action.getExtractedNodeID();
    const extractedNode = graph.entity(extractedNodeID);
    assert.strictEqual(extractedNode.loc[0], 0.5);
    assert.strictEqual(extractedNode.loc[1], 0.5);
  });

  it('extracts a node from a way with wheelchair tag', () => {
    // Graph: n1 -- n2 (way with wheelchair tag)
    const node1 = Rapid.osmNode({ id: 'n1', loc: [0, 0] });
    const node2 = Rapid.osmNode({ id: 'n2', loc: [1, 1] });
    const way = Rapid.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags: { wheelchair: 'yes' } });
    graph = graph.replace(node1).replace(node2).replace(way);
    const action = Rapid.actionExtract('w1', viewport);
    graph = action(graph);
    const extractedNodeID = action.getExtractedNodeID();
    const extractedNode = graph.entity(extractedNodeID);
    assert.strictEqual(extractedNode.loc[0], 0.5);
    assert.strictEqual(extractedNode.loc[1], 0.5);
  });

  it('extracts a node from a way with addr:housenumber tag', () => {
    // Graph: n1 -- n2 (way with addr:housenumber tag)
    const node1 = Rapid.osmNode({ id: 'n1', loc: [0, 0] });
    const node2 = Rapid.osmNode({ id: 'n2', loc: [1, 1] });
    const way = Rapid.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags: { 'addr:housenumber': '123' } });
    graph = graph.replace(node1).replace(node2).replace(way);
    const action = Rapid.actionExtract('w1', viewport);
    graph = action(graph);
    const extractedNodeID = action.getExtractedNodeID();
    const extractedNode = graph.entity(extractedNodeID);
    assert.strictEqual(extractedNode.loc[0], 0.5);
    assert.strictEqual(extractedNode.loc[1], 0.5);
  });

  it('extracts a node from a way with area tag', () => {
    // Graph: n1 -- n2 (way with area tag)
    const node1 = Rapid.osmNode({ id: 'n1', loc: [0, 0] });
    const node2 = Rapid.osmNode({ id: 'n2', loc: [1, 1] });
    const way = Rapid.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags: { area: 'yes' } });
    graph = graph.replace(node1).replace(node2).replace(way);
    const action = Rapid.actionExtract('w1', viewport);
    graph = action(graph);
    const extractedNodeID = action.getExtractedNodeID();
    const extractedNode = graph.entity(extractedNodeID);
    assert.strictEqual(extractedNode.loc[0], 0.5);
    assert.strictEqual(extractedNode.loc[1], 0.5);
  });

  it('extracts a node from a way with level tag', () => {
    // Graph: n1 -- n2 (way with level tag)
    const node1 = Rapid.osmNode({ id: 'n1', loc: [0, 0] });
    const node2 = Rapid.osmNode({ id: 'n2', loc: [1, 1] });
    const way = Rapid.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags: { level: '1' } });
    graph = graph.replace(node1).replace(node2).replace(way);
    const action = Rapid.actionExtract('w1', viewport);
    graph = action(graph);
    const extractedNodeID = action.getExtractedNodeID();
    const extractedNode = graph.entity(extractedNodeID);
    assert.strictEqual(extractedNode.loc[0], 0.5);
    assert.strictEqual(extractedNode.loc[1], 0.5);
  });

  it('extracts a node from a way with addr:postcode tag', () => {
    // Graph: n1 -- n2 (way with addr:postcode tag)
    const node1 = Rapid.osmNode({ id: 'n1', loc: [0, 0] });
    const node2 = Rapid.osmNode({ id: 'n2', loc: [1, 1] });
    const way = Rapid.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags: { 'addr:postcode': '12345' } });
    graph = graph.replace(node1).replace(node2).replace(way);
    const action = Rapid.actionExtract('w1', viewport);
    graph = action(graph);
    const extractedNodeID = action.getExtractedNodeID();
    const extractedNode = graph.entity(extractedNodeID);
    assert.strictEqual(extractedNode.loc[0], 0.5);
    assert.strictEqual(extractedNode.loc[1], 0.5);
  });

  it('extracts a node from a way with addr:city tag', () => {
    // Graph: n1 -- n2 (way with addr:city tag)
    const node1 = Rapid.osmNode({ id: 'n1', loc: [0, 0] });
    const node2 = Rapid.osmNode({ id: 'n2', loc: [1, 1] });
    const way = Rapid.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags: { 'addr:city': 'Test City' } });
    graph = graph.replace(node1).replace(node2).replace(way);
    const action = Rapid.actionExtract('w1', viewport);
    graph = action(graph);
    const extractedNodeID = action.getExtractedNodeID();
    const extractedNode = graph.entity(extractedNodeID);
    assert.strictEqual(extractedNode.loc[0], 0.5);
    assert.strictEqual(extractedNode.loc[1], 0.5);
  });

  it('extracts a node from a way with more than two points', () => {
    // Graph: n1 -- n2 -- n3
    const node1 = Rapid.osmNode({ id: 'n1', loc: [0, 0] });
    const node2 = Rapid.osmNode({ id: 'n2', loc: [1, 0] });
    const node3 = Rapid.osmNode({ id: 'n3', loc: [1, 1] });
    const way = Rapid.osmWay({ id: 'w1', nodes: ['n1', 'n2', 'n3'] });
    graph = graph.replace(node1).replace(node2).replace(node3).replace(way);
    const action = Rapid.actionExtract('w1', viewport);
    graph = action(graph);
    const extractedNodeID = action.getExtractedNodeID();
    const extractedNode = graph.entity(extractedNodeID);
    assert.strictEqual(extractedNode.loc[0], 0.6666666666666666);
    assert.strictEqual(extractedNode.loc[1], 0.3333333333333333);
  });

  it('extracts a node from a way with Polygon geometry', () => {
    // Graph: n1 -- n2 -- n3 -- n1 (closed way)
    const node1 = Rapid.osmNode({ id: 'n1', loc: [0, 0] });
    const node2 = Rapid.osmNode({ id: 'n2', loc: [1, 0] });
    const node3 = Rapid.osmNode({ id: 'n3', loc: [1, 1] });
    let way = Rapid.osmWay({ id: 'w1', nodes: ['n1', 'n2', 'n3', 'n1'] });

    // Mock asGeoJSON to return a GeoJSON object with type property set to 'Polygon'
    way.asGeoJSON = () => ({ type: 'Polygon', coordinates: [[node1.loc, node2.loc, node3.loc, node1.loc]] });

    graph = graph.replace(node1).replace(node2).replace(node3).replace(way);
    const action = Rapid.actionExtract('w1', viewport);
    graph = action(graph);
    const extractedNodeID = action.getExtractedNodeID();
    const extractedNode = graph.entity(extractedNodeID);
    assert.strictEqual(extractedNode.loc[0], 0.6666666666666666);
    assert.strictEqual(extractedNode.loc[1], 0.3333333333333333);
  });

  it('handles a way with non-finite centroid', () => {
    // Graph: n1 -- n2
    const node1 = Rapid.osmNode({ id: 'n1', loc: [0, 0] });
    const node2 = Rapid.osmNode({ id: 'n2', loc: [1, 1] });
    const way = Rapid.osmWay({ id: 'w1', nodes: ['n1', 'n2'] });
    graph = graph.replace(node1).replace(node2).replace(way);

    // Mock viewport.project to return non-finite values
    const originalProject = viewport.project;
    viewport.project = () => [Infinity, Infinity];

    const action = Rapid.actionExtract('w1', viewport);
    graph = action(graph);

    // Restore the original viewport.project function
    viewport.project = originalProject;

    const extractedNodeID = action.getExtractedNodeID();
    const extractedNode = graph.entity(extractedNodeID);

    // The extracted node  be at the center of the entity's extent
    assert.strictEqual(extractedNode.loc[0], 0.5);
    assert.strictEqual(extractedNode.loc[1], 0.5);
  });
});
