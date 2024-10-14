import {
  Extent, geoLatToMeters, geoLonToMeters, geoSphericalClosestPoint,
  geoSphericalDistance, geoMetersToLat, geoMetersToLon, geomLineIntersection,
  vecAngle, vecLength
} from '@rapid-sdk/math';

import { actionAddMidpoint, actionChangeTags, actionMergeNodes, actionSplit, actionSyncCrossingTags } from '../actions/index.js';
import { osmNode } from '../osm/node.js';
import {
  osmFlowingWaterwayTagValues, osmPathHighwayTagValues, osmRailwayTrackTagValues,
  osmRoutableAerowayTags, osmRoutableHighwayTagValues
} from '../osm/tags.js';
import { ValidationIssue, ValidationFix } from '../core/lib/index.js';


export function validationKerbNodes(context) {
  const type = 'kerb_nodes';
  const editor = context.systems.editor;
  const l10n = context.systems.l10n;

  /**
   * checkKerbNodeCandidacy
   * This validation checks the given entity to see if it is a candidate to have kerb nodes added to it
   * @param  {Entity}  entity - the Entity to validate
   * @param  {Graph}   graph  - the Graph we are validating
   * @return {Array}   Array of ValidationIssues detected
   */
  const validation = function checkKerbNodeCandidacy(entity, graph) {
    if (entity.type !== 'way' || entity.isDegenerate()) return [];
    return detectKerbCandidates(entity, graph);
  };
  const isKerbNode = (entity) => entity.type === 'node' && entity.tags?.barrier === 'kerb';
  const isCrossingWay = (tags) => tags.highway === 'footway' && tags.footway === 'crossing';

  const checkKerbNodeCandidacy = (entity, graph) => {
    if (entity.type !== 'way' || entity.isDegenerate()) return [];
    return detectKerbCandidates(entity, graph);
  };

  const detectKerbCandidates = (way, graph) => {
    let issues = [];
    const wayID = way.id;
    if (!hasRoutableTags(way) || !isCrossingWay(way.tags)) return issues;
    const hasKerbs = hasKerbNodes(way, graph);
    const intersectsPedestrianPathways = intersectsPedestrianPathway(way, graph);
    if (!hasKerbs && intersectsPedestrianPathways) {
      issues.push(new ValidationIssue(context, {
        type,
        subtype: 'missing_kerb_nodes',
        severity: 'warning',
        message: () => way ? l10n.t('issues.kerb_nodes.message', { feature: l10n.displayLabel(way, graph) }) : 'Way not found',
        reference: showReference,
        entityIds: [wayID],
        data: { crossingWayID: wayID },
        dynamicFixes: () => ['flush', 'lowered', 'raised'].map(type => new ValidationFix({
          title: `Add ${type} Kerb Nodes`,
          onClick: () => {
            // const positions = calculateNewNodePositions(wayID, editor.staging.graph);
            const tags = { barrier: 'kerb', kerb: type };
            const action = applyKerbNodeFix(wayID, editor.staging.graph, tags);
            editor.perform(action);
            editor.commit({
              annotation: 'Added kerb nodes at adjusted positions',
              selectedIDs: [wayID]
            });
          }
        }))
      }));
    }
    return issues;
  };


  function hasRoutableTags(way) {
    const routableTags = ['highway', 'railway', 'waterway'];
    return way.isArea() ? false : routableTags.some(tag => way.tags[tag]);
  }


  function intersectsPedestrianPathway(way, graph) {
    let intersectingWays = new Set();
    way.nodes.forEach(nodeId => {
      if (!nodeId) {
        console.error('Undefined nodeId found in way:', way.id);
        return;
      }
      const node = graph.entity(nodeId);
      if (!node) {
        console.error('Node not found in graph with ID:', nodeId);
        return;
      }
      const nodeWays = graph.parentWays(node);
      nodeWays.forEach(way => intersectingWays.add(way));
    });
    return Array.from(intersectingWays).some(intersectingWay => {
      const isPedestrian = isPedestrianPathway(intersectingWay);
      return isPedestrian;
    });
  }


  function isPedestrianPathway(way) {
    const pedestrianTags = ['sidewalk', 'crossing', 'path'];
    return pedestrianTags.includes(way.tags.footway) || pedestrianTags.includes(way.tags.highway);
  }


  function showReference(selection) {
    selection.selectAll('.issue-reference')
      .data([0])
      .enter()
      .append('div')
      .attr('class', 'issue-reference')
      .html(l10n.tHtml('issues.kerb_nodes.reference'));
  }


  /**
   * @param {*} way
   * @returns true if the way has kerb information in it already (either it is marked )
   */
  function hasKerbNodes(way) {
    const graph = editor.staging.graph;
    return way.nodes.some(nodeID => {
      const node = graph.entity(nodeID);
      return isKerbNode(node);
    });
  }


  // Function to calculate new node positions near the ends of a way
  // function calculateNewNodePositions(way, graph) {
  //   const nodes = graph.childNodes(way);
  //   if (nodes.length < 2) {
  //     console.error('Not enough nodes to calculate new positions');
  //     return;
  //   }
  //   // Get the first and second nodes for the start direction
  //   const firstNode = nodes[0];
  //   const secondNode = nodes[1];
  //   const firstNodePosition = calculatePositionOffset(firstNode, secondNode, 1, graph);
  //   // Get the last and second-to-last nodes for the end direction
  //   const lastNode = nodes[nodes.length - 1];
  //   const secondToLastNode = nodes[nodes.length - 2];
  //   const lastNodePosition = calculatePositionOffset(lastNode, secondToLastNode, 1, graph);
  //   return { firstNodePosition, lastNodePosition };
  // }


  // function calculatePositionOffset(startNode, endNode, distance) {
  //   if (!startNode || !endNode) {
  //     console.error('Invalid nodes for position calculation');
  //     return null;
  //   }

  //   const startLatMeters = geoLatToMeters(startNode.loc[1]);
  //   const startLonMeters = geoLonToMeters(startNode.loc[0], startNode.loc[1]);
  //   const endLatMeters = geoLatToMeters(endNode.loc[1]);
  //   const endLonMeters = geoLonToMeters(endNode.loc[0], endNode.loc[1]);

  //   const dxMeters = endLonMeters - startLonMeters;
  //   const dyMeters = endLatMeters - startLatMeters;
  //   const lengthMeters = Math.sqrt(dxMeters * dxMeters + dyMeters * dyMeters);
  //   const scale = distance / lengthMeters;

  //   const newXMeters = startLonMeters + dxMeters * scale;
  //   const newYMeters = startLatMeters + dyMeters * scale;

  //   return {
  //     lon: geoMetersToLon(newXMeters, geoMetersToLat(newYMeters)),
  //     lat: geoMetersToLat(newYMeters)
  //   };
  // }


  // function addKerbNodes(wayOrWayId, graph, tags) {
  //   console.log('addKerbNodes called with wayOrWayId:', wayOrWayId);
  //   let way = typeof wayOrWayId === 'string' ? graph.hasEntity(wayOrWayId) : wayOrWayId;
  //   if (!way) {
  //     console.error(`Way not found with ID: ${wayOrWayId}`);
  //     return;
  //   }
  //   console.log('Way:', way);
  //   const nodes = graph.childNodes(way);
  //   console.log(`Nodes retrieved in addKerbNodes: ${nodes.map(node => node.id).join(', ')}`);
  //   if (nodes.length < 2) {
  //     console.error(`Not enough nodes in the way to calculate positions: ${way.id}, Nodes Count: ${nodes.length}`);
  //     return;
  //   }
  //   nodes.forEach(node => {
  //     if (!node || !node.loc) {
  //       console.error('Node location data is missing or node is undefined:', node);
  //       return;
  //     }
  //   });

  //   const firstNode = nodes[0];
  //   const lastNode = nodes[nodes.length - 1];
  //   console.log(`First Node ID: ${firstNode.id}, Last Node ID: ${lastNode.id}`);

  //   if (!firstNode.loc || !lastNode.loc) {
  //     console.error('Node location data is missing:', { firstNode, lastNode });
  //     return;
  //   }

  //   const firstNodePosition = calculateNewPosition(firstNode, lastNode, 1);
  //   const lastNodePosition = calculateNewPosition(lastNode, firstNode, 1);
  //   console.log('Positions calculated:', { firstNodePosition, lastNodePosition });

  //   if (!firstNodePosition || !lastNodePosition) {
  //     console.error('Failed to calculate new positions');
  //     return;
  //   }

  //   const firstKerbNode = osmNode({ loc: firstNodePosition, tags });
  //   const lastKerbNode = osmNode({ loc: lastNodePosition, tags });

  //   graph = actionAddMidpoint({ loc: firstNodePosition, edge: [firstNode.id, nodes[1].id] }, firstKerbNode)(graph);
  //   graph = actionAddMidpoint({ loc: lastNodePosition, edge: [lastNode.id, nodes[nodes.length - 2].id] }, lastKerbNode)(graph);

  //   console.log('Kerb nodes added to the graph');
  //   return graph;
  // }


  function applyKerbNodeFix(wayID, graph, tags) {
    console.log('Entering applyKerbNodeFix', { wayID, tags });
    const way = graph.entity(wayID);
    if (!way) {
      console.error('Way not found:', wayID);
      return;
    }

    try {
      const firstNodePosition = calculatePosition(graph.entity(way.nodes[0]), graph.entity(way.nodes[1]), 1);
      const lastNodePosition = calculatePosition(graph.entity(way.nodes[way.nodes.length - 2]), graph.entity(way.nodes[way.nodes.length - 1]), 1);

      // Create new osmNode instances
      const firstKerbNode = osmNode({ loc: [firstNodePosition.lon, firstNodePosition.lat], tags });
      const lastKerbNode = osmNode({ loc: [lastNodePosition.lon, lastNodePosition.lat], tags });

      console.log('Before adding nodes:', way.nodes);
      graph = addNodesToWay(graph, wayID, firstKerbNode, lastKerbNode);
      console.log('After adding nodes:', graph.entity(wayID).nodes);

      console.log('Kerb nodes added to the graph');
    } catch (error) {
      console.error('Error during kerb node addition:', error);
    }

    console.log('Exiting applyKerbNodeFix');
  }


  function calculatePosition(startNode, endNode, distance) {
    if (!startNode || !endNode) {
        console.error('Start || end node is undefined');
        return null;
    }
    if (!startNode.loc || !endNode.loc) {
        console.error('Location data is missing for nodes');
        return null;
    }

    const startLatMeters = geoLatToMeters(startNode.loc[1]);
    const startLonMeters = geoLonToMeters(startNode.loc[0], startNode.loc[1]);
    const endLatMeters = geoLatToMeters(endNode.loc[1]);
    const endLonMeters = geoLonToMeters(endNode.loc[0], endNode.loc[1]);

    const dxMeters = endLonMeters - startLonMeters;
    const dyMeters = endLatMeters - startLatMeters;
    const lengthMeters = Math.sqrt(dxMeters * dxMeters + dyMeters * dyMeters);

    if (lengthMeters === 0) {
        console.error('Start and end nodes are at the same position');
        return null;
    }

    const scale = distance / lengthMeters;
    const newXMeters = startLonMeters + dxMeters * scale;
    const newYMeters = startLatMeters + dyMeters * scale;

    const newPosition = {
        lon: geoMetersToLon(newXMeters, geoMetersToLat(newYMeters)),
        lat: geoMetersToLat(newYMeters)
    };
    console.log('Calculat new position:', newPosition);
    return newPosition;
  }


  // function calculateNewPosition(startNode, endNode, distance) {
  //   if (!startNode || !endNode || !startNode.loc || !endNode.loc) {
  //     console.error('Invalid nodes for calculateNewPosition:', { startNode, endNode });
  //     return null;
  //   }

  //   let dx = endNode.loc[0] - startNode.loc[0];
  //   let dy = endNode.loc[1] - startNode.loc[1];
  //   let length = Math.sqrt(dx * dx + dy * dy);
  //   let scale = distance / length;

  //   return {
  //     lon: startNode.loc[0] + dx * scale,
  //     lat: startNode.loc[1] + dy * scale
  //   };
  // }


  /**
   * getAddKerbNodesAction
   * Creates and executes an action to add kerb nodes to a specified way.
   * @param {string} wayID - The ID of the way to add kerb nodes to.
   * @param {Object} tags - Tags to assign to the new kerb nodes.
   * @param {Object} location - The geographic location to add the new node.
   * @return {Function} An action function that adds kerb nodes when executed.
   */
  function getAddKerbNodesAction(wayID, positions, tags) {
    return function(graph) {
      if (!graph) {
        console.error('Graph is undefined');
        return;
      }

      const way = graph.hasEntity(wayID);
      if (!way) {
        console.error('Way not found:', wayID);
        return;
      }

      if (!positions.firstNodePosition || !positions.lastNodePosition) {
        console.error('Positions are not defined.');
        return;
      }

      const firstKerbNode = osmNode({ loc: [positions.firstNodePosition.lon, positions.firstNodePosition.lat], tags });
      const lastKerbNode = osmNode({ loc: [positions.lastNodePosition.lon, positions.lastNodePosition.lat], tags });

      graph = actionAddMidpoint({ loc: [positions.firstNodePosition.lon, positions.firstNodePosition.lat], edge: [way.nodes[0].id, way.nodes[1].id] }, firstKerbNode)(graph);
      graph = actionAddMidpoint({ loc: [positions.lastNodePosition.lon, positions.lastNodePosition.lat], edge: [way.nodes[way.nodes.length - 2].id, way.nodes[way.nodes.length - 1].id] }, lastKerbNode)(graph);

      return [firstKerbNode.id, lastKerbNode.id];
    };
  }


  function addNodesToWay(graph, wayID, firstNode, lastNode) {
    let way = graph.entity(wayID);
    if (!way) {
        console.error('Way not found:', wayID);
        return graph;
    }

    // Clone the node array
    let nodes = way.nodes.slice();

    // Insert the first new node after the first existing node
    nodes.splice(1, 0, firstNode.id);

    // Insert the last new node before the last existing node
    nodes.splice(nodes.length - 1, 0, lastNode.id);

    // Update the way with the new nodes list
    let updatedWay = way.update({nodes: nodes});
    graph = graph.replace(updatedWay);

    return graph;
  }


  /**
   * makeKerbNodesFix
   * Creates a fix action for adding kerb nodes.
   * @param {Object} tags - Tags to assign to the new kerb nodes.
   * @return {ValidationFix} - A fix action that can be executed by the user.
   */
  function makeKerbNodesFix(tags) {
    return new ValidationFix({
      title: 'Add Kerb Nodes',
      onClick: function() {
        const selectedIDs = context.selectedIDs();
        if (selectedIDs.length !== 1) {
          console.error('No way selected');
          return;
        }
        const selectedWayID = selectedIDs[0];
        console.log('Selected way ID:', selectedWayID);

        // Perform the action to add kerb nodes and commit the changes
        addKerbNodesAndCommit(editor.staging.graph, selectedWayID, tags);
      }
    });
  }


  /**
   * Adds kerb nodes to the specified way and commits the changes.
   * @param {Graph} graph - The current graph.
   * @param {string} wayID - The ID of the way to add kerb nodes to.
   * @param {Object} tags - Tags to assign to the new kerb nodes.
   */
  function addKerbNodesAndCommit(graph, wayID, tags) {
    const action = getAddKerbNodesAction(wayID, tags);
    console.log('Graph before adding nodes:', graph);
    const nodeIDs = action(graph); // Execute the action to modify the graph
    console.log('Graph after adding nodes:', graph);

    if (nodeIDs && nodeIDs.length > 0) {
      editor.perform(action); // Apply the action
      editor.commit({
        annotation: 'Added kerb nodes',
        selectedIDs: nodeIDs
      });
    } else {
      console.error('Failed to add kerb nodes');
    }
  }

  validation.type = type;

  return validation;
}
