import {
  Extent, geoLatToMeters, geoLonToMeters, geoSphericalClosestPoint,
  geoSphericalDistance, geoMetersToLat, geoMetersToLon, geomLineIntersection,
  vecAngle, vecLength
} from '@rapid-sdk/math';

import { actionAddMidpoint, actionChangeTags, actionSplit} from '../actions/index.js';
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
        dynamicFixes: () => ['flush', 'lowered', 'raised'].map(type => {
          const tags = { barrier: 'kerb', kerb: type };
          const iconID = getIconForKerbNode(tags); // Get the appropriate icon based on the tags
          return new ValidationFix({
            icon: iconID, // Use the dynamically selected icon
            title: `Add ${type} Kerb Nodes`,
            onClick: () => {
              const action = applyKerbNodeFix(wayID, editor.staging.graph, tags);
              editor.perform(action);
              editor.commit({
                annotation: `Added ${type} kerb nodes at adjusted positions`,
                selectedIDs: [wayID]
              });
            }
          });
        })
      }));
    }
    return issues;
  };


  /**
   * hasRoutableTags
   * Checks if the given way has tags that make it routable
   * @param  {Object} way - The way entity to check
   * @return {Boolean} True if the way has routable tags, false otherwise
   */
  function hasRoutableTags(way) {
    const routableTags = ['highway', 'railway', 'waterway'];
    return way.isArea() ? false : routableTags.some(tag => way.tags[tag]);
  }


  /**
   * intersectsPedestrianPathway
   * Determines if the given way intersects with pedestrian pathways
   * @param  {Object} way - The way entity to check
   * @param  {Object} graph - The graph containing the way and node data
   * @return {Boolean} True if the way intersects pedestrian pathways, false otherwise
   */
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


  /**
   * isPedestrianPathway
   * Checks if the given way is a pedestrian pathway based on its tags
   * @param  {Object} way - The way entity to check
   * @return {Boolean} True if the way is a pedestrian pathway, false otherwise
   */
  function isPedestrianPathway(way) {
    const pedestrianTags = ['sidewalk', 'crossing', 'path'];
    return pedestrianTags.includes(way.tags.footway) || pedestrianTags.includes(way.tags.highway);
  }


  /**
   * showReference
   * Displays a reference for the issue in the UI
   * @param  {Object} selection - The UI selection to append the reference to
   */
  function showReference(selection) {
    selection.selectAll('.issue-reference')
      .data([0])
      .enter()
      .append('div')
      .attr('class', 'issue-reference')
      .html(l10n.tHtml('issues.kerb_nodes.reference'));
  }


  /**
   * hasKerbNodes
   * Checks if the given way already has kerb nodes
   * @param  {Object} way - The way entity to check
   * @return {Boolean} True if kerb nodes are present, false otherwise
   */
  function hasKerbNodes(way) {
    const graph = editor.staging.graph;
    return way.nodes.some(nodeID => {
      const node = graph.entity(nodeID);
      return isKerbNode(node);
    });
  }


  /**
   * applyKerbNodeFix
   * Applies a fix to add kerb nodes to the specified way
   * @param  {String} wayID - The ID of the way to fix
   * @param  {Object} graph - The graph containing the way and node data
   * @param  {Object} tags - The tags to assign to the new kerb nodes
   */
  function applyKerbNodeFix(wayID, graph, tags) {
    const way = graph.hasEntity(wayID);
    if (!way) {
      console.error('Way not found:', wayID);
      return;
    }

    // Calculate positions for the new kerb nodes
    const firstNodePosition = calculateNewNodePosition(graph.entity(way.nodes[0]), graph.entity(way.nodes[1]), 1);
    const lastNodePosition = calculateNewNodePosition(graph.entity(way.nodes[way.nodes.length - 1]), graph.entity(way.nodes[way.nodes.length - 2]), 1);

    // Create new kerb nodes
    const firstKerbNode = osmNode({ loc: [firstNodePosition.lon, firstNodePosition.lat], tags, visible: true });
    const lastKerbNode = osmNode({ loc: [lastNodePosition.lon, lastNodePosition.lat], tags, visible: true });

    // Add new nodes to the graph at the midpoint of the specified segments
    editor.perform(actionAddMidpoint({ loc: firstKerbNode.loc, edge: [way.nodes[0], way.nodes[1]] }, firstKerbNode));
    editor.perform(actionAddMidpoint({ loc: lastKerbNode.loc, edge: [way.nodes[way.nodes.length - 2], way.nodes[way.nodes.length - 1]] }, lastKerbNode));

    // Perform the split
    const splitAction = actionSplit([firstKerbNode.id, lastKerbNode.id]);
    graph = editor.perform(splitAction);
    const newWayIDs = splitAction.getCreatedWayIDs();

    // Change tags to indicate these are sidewalks
    const sidewalkTags = { highway: 'footway', footway: 'sidewalk' };
    newWayIDs.forEach(wayId => {
        editor.perform(actionChangeTags(wayId, sidewalkTags));
    });

    // Commit the changes to the graph
    editor.commit({
      annotation: 'Added kerb nodes and updated way tags to sidewalks',
      selectedIDs: [way.id].concat(newWayIDs)
    });
  }


  /**
   * calculateNewNodePosition
   * Calculates the position for a new node based on the start and end nodes
   * @param  {Object} startNode - The starting node
   * @param  {Object} endNode - The ending node
   * @param  {Number} distance - The distance from the start node to place the new node
   * @param  {Boolean} isLast - Flag to indicate if this is the last node (affects calculation direction)
   * @return {Object|null} The calculated position or null if an error occurred
   */
  function calculateNewNodePosition(startNode, endNode, distance, isLast = false) {
    if (!startNode || !endNode) {
      console.error('Start or end node is undefined');
      return null;
    }
    if (!startNode.loc || !endNode.loc) {
      console.error('Location data is missing for nodes', {startNode, endNode});
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
    const directionMultiplier = isLast ? -1 : 1;
    const newXMeters = startLonMeters + dxMeters * scale * directionMultiplier;
    const newYMeters = startLatMeters + dyMeters * scale * directionMultiplier;

    const newPosition = {
      lon: geoMetersToLon(newXMeters, geoMetersToLat(newYMeters)),
      lat: geoMetersToLat(newYMeters)
    };

    return newPosition;
  }


  /**
   * getIconForKerbNode
   * Determines the appropriate icon for a kerb node based on its tags
   * @param  {Object} tags - The tags of the kerb node
   * @return {String} The ID of the icon to use
   */
  function getIconForKerbNode(tags) {
    let iconID = 'default-icon'; // Default icon
    if (tags.barrier === 'kerb' && tags.kerb === 'flush') {
        iconID = 'temaki-kerb-flush'; // Example icon for flush kerbs
    } else if (tags.barrier === 'kerb' && tags.kerb === 'raised') {
        iconID = 'temaki-kerb-raised'; // Example icon for raised kerbs
    } else if (tags.barrier === 'kerb' && tags.kerb === 'lowered') {
        iconID = 'temaki-kerb-lowered'; // Example icon for lowered kerbs
    }
    return iconID;
  }

  validation.type = type;

  return validation;
}
