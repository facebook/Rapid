import { geoLatToMeters, geoLonToMeters, geoMetersToLat, geoMetersToLon } from '@rapid-sdk/math';
import { actionAddMidpoint, actionChangeTags, actionSplit} from '../actions/index.js';
import { osmNode } from '../osm/node.js';
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
   * Applies fixes to add kerb nodes to the specified way.
   * @param  {String} wayID - The ID of the way to fix.
   * @param  {Object} graph - The graph containing the way and node data.
   * @param  {Object} tags - The tags to assign to the new kerb nodes.
   */
  function applyKerbNodeFix(wayID, graph, tags) {
    const way = graph.hasEntity(wayID);
    if (!way) {
      console.error('Way not found:', wayID);
      return;
    }

    const firstNode = graph.entity(way.nodes[0]);
    const lastNode = graph.entity(way.nodes[way.nodes.length - 1]);

    const firstNodeConnected = isConnectedToRefugeIsland(firstNode, graph);
    const lastNodeConnected = isConnectedToRefugeIsland(lastNode, graph);

    // Handle the first node
    if (firstNodeConnected) {
      updateNodeToKerb(firstNode, tags, graph);
    } else {
      kerbNodeAdditionForSingleNode(firstNode, way, graph, tags);
    }

    // Handle the last node
    if (lastNodeConnected) {
      updateNodeToKerb(lastNode, tags, graph);
    } else {
      kerbNodeAdditionForSingleNode(lastNode, way, graph, tags);
    }
  }


  /**
   * kerbNodeAdditionForSingleNode
   * Adds a single kerb node to a specified way at the position of an existing node, splits the way, and updates tags.
   * This function is used when a node is not connected to a traffic island and needs a kerb node addition.
   * @param  {Object} node - The existing node where the kerb node will be added.
   * @param  {Object} way - The way entity that the node belongs to.
   * @param  {Object} graph - The graph containing the way and node data.
   * @param  {Object} tags - The tags to assign to the new kerb node.
   */
  function kerbNodeAdditionForSingleNode(node, way, graph, tags) {
    // Calculate the position for the new kerb node
    const nodeIndex = way.nodes.indexOf(node.id);
    const adjacentNode = graph.entity(way.nodes[nodeIndex + 1] || way.nodes[nodeIndex - 1]);
    const newNodePosition = calculateNewNodePosition(node, adjacentNode, 1);

    // Create a new kerb node
    const newKerbNode = osmNode({ loc: [newNodePosition.lon, newNodePosition.lat], tags, visible: true });

    // Add the new node to the graph at the midpoint of the specified segment
    editor.perform(actionAddMidpoint({ loc: newKerbNode.loc, edge: [node.id, adjacentNode.id] }, newKerbNode));

    // Perform the split
    const splitAction = actionSplit([newKerbNode.id]);
    graph = editor.perform(splitAction);
    const newWayIDs = splitAction.getCreatedWayIDs();

    // Change tags to indicate these are sidewalks
    const sidewalkTags = { highway: 'footway', footway: 'sidewalk' };
    newWayIDs.forEach(wayId => {
        editor.perform(actionChangeTags(wayId, sidewalkTags));
    });

    // Commit the changes to the graph
    editor.commit({
      annotation: 'Added kerb node and updated way tags to sidewalks',
      selectedIDs: [node.id].concat(newWayIDs)
    });
  }


  /**
   * isConnectedToRefugeIsland
   * Checks if the given node is connected to a refuge island.
   * @param  {Object} node - The node to check.
   * @param  {Object} graph - The graph containing the node and way data.
   * @return {Boolean} True if the node is connected to a refuge island, false otherwise.
   */
  function isConnectedToRefugeIsland(node, graph) {
    const connectedWays = graph.parentWays(node);
    const connectedToRefuge = connectedWays.some(way => isRefugeIsland(way));
    return connectedToRefuge;
  }


  /**
   * updateNodeToKerb
   * Updates the given node to a kerb with specified tags.
   * @param  {Object} node - The node to update.
   * @param  {Object} tags - The tags to assign to the node.
   * @param  {Object} graph - The graph containing the node data.
   */
  function updateNodeToKerb(node, tags, graph) {
    // Prepare the new tags for the node
    const newTags = {...node.tags, barrier: 'kerb', kerb: tags.kerb};

    // Perform the tag change using the editor's actionChangeTags method
    editor.perform(actionChangeTags(node.id, newTags));

    // Optionally, you can directly commit the change here, or you can handle the commit elsewhere
    editor.commit({
      annotation: `Modified node to ${tags.kerb} kerb at the junction with a traffic island`,
      selectedIDs: [node.id]
    });
  }


  /**
   * isRefugeIsland
   * Checks if the given way is a refuge island based on its tags.
   * @param  {Object} way - The way entity to check.
   * @return {Boolean} True if the way is a refuge island, false otherwise.
   */
  function isRefugeIsland(way) {
    const isTrafficIsland = way.tags.footway === 'traffic_island';
    return isTrafficIsland;
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
      return null;
    }
    if (!startNode.loc || !endNode.loc) {
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
