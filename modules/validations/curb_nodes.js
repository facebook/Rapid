import { geoLatToMeters, geoLonToMeters, geoMetersToLat, geoMetersToLon } from '@rapid-sdk/math';
import { actionAddMidpoint, actionChangeTags, actionSplit} from '../actions/index.js';
import { osmNode } from '../osm/node.js';
import { ValidationIssue, ValidationFix } from '../core/lib/index.js';


export function validationCurbNodes(context) {
  const type = 'curb_nodes';
  const editor = context.systems.editor;
  const l10n = context.systems.l10n;


  /**
   * checkCurbNodeCandidacy
   * This validation checks the given entity to see if it is a candidate to have curb nodes added to it
   * @param  {Entity}  entity - the Entity to validate
   * @param  {Graph}   graph  - the Graph we are validating
   * @return {Array}   Array of ValidationIssues detected
   */
  const validation = function checkCurbNodeCandidacy(entity, graph) {
    if (entity.type !== 'way' || entity.isDegenerate()) return [];
    return detectCurbCandidates(entity, graph);
  };
  const isCurbNode = (entity) => entity.type === 'node' && entity.tags?.barrier === 'kerb';
  const isCrossingWay = (tags) => tags.highway === 'footway' && tags.footway === 'crossing';

  const detectCurbCandidates = (way, graph) => {
    let issues = [];
    const wayID = way.id;
    if (!hasRoutableTags(way) || !isCrossingWay(way.tags)) return issues;
    const hasCurbs = hasCurbNodes(way, graph);
    if (!hasCurbs) {
      issues.push(new ValidationIssue(context, {
        type,
        subtype: 'missing_curb_nodes',
        severity: 'warning',
        message: () => way ? l10n.t('issues.curb_nodes.message', { feature: l10n.displayLabel(way, graph) }) : 'Way not found',
        reference: showReference,
        entityIds: [wayID],
        data: { crossingWayID: wayID },
        dynamicFixes: () => ['unspecified', 'flush', 'lowered', 'raised'].map(type => {
          const tags = { barrier: 'kerb', kerb: type };
          const iconID = getIconForCurbNode(tags);
          return new ValidationFix({
            icon: iconID,
            title: `Add ${type} Curb Nodes`,
            onClick: () => {
              const action = applyCurbNodeFix(wayID, editor.staging.graph, tags);
              editor.perform(action);
              editor.commit({
                annotation: `Added ${type} curb nodes at adjusted positions`,
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
    const routableTags = ['highway'];
    return way.isArea() ? false : routableTags.some(tag => way.tags[tag]);
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
      .text(l10n.t('issues.curb_nodes.reference'));
  }


  /**
   * hasCurbNodes
   * Checks if the given way already has curb nodes
   * @param  {Object} way - The way entity to check
   * @return {Boolean} True if curb nodes are present, false otherwise
   */
  function hasCurbNodes(way) {
    const graph = editor.staging.graph;
    return way.nodes.some(nodeID => {
      const node = graph.entity(nodeID);
      return isCurbNode(node);
    });
  }


  /**
   * applyCurbNodeFix
   * Applies fixes to add curb nodes to the specified way.
   * @param  {String} wayID - The ID of the way to fix.
   * @param  {Object} graph - The graph containing the way and node data.
   * @param  {Object} tags - The tags to assign to the new curb nodes.
   */
  function applyCurbNodeFix(wayID, graph, tags) {
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
      updateNodeToCurb(firstNode, tags, graph);
    } else {
      curbNodeAdditionForSingleNode(firstNode, way, graph, tags);
    }

    // Handle the last node
    if (lastNodeConnected) {
      updateNodeToCurb(lastNode, tags, graph);
    } else {
      curbNodeAdditionForSingleNode(lastNode, way, graph, tags);
    }
  }


  /**
   * curbNodeAdditionForSingleNode
   * Adds a single curb node to a specified way at the position of an existing node, splits the way, and updates tags.
   * This function is used when a node is not connected to a traffic island and needs a curb node addition.
   * @param  {Object} node - The existing node where the curb node will be added.
   * @param  {Object} way - The way entity that the node belongs to.
   * @param  {Object} graph - The graph containing the way and node data.
   * @param  {Object} tags - The tags to assign to the new curb node.
   */
  function curbNodeAdditionForSingleNode(node, way, graph, tags) {
    // Calculate the position for the new curb node
    const nodeIndex = way.nodes.indexOf(node.id);
    const adjacentNode = graph.entity(way.nodes[nodeIndex + 1] || way.nodes[nodeIndex - 1]);
    const newNodePosition = calculateNewNodePosition(node, adjacentNode, 1);

    // Create a new curb node
    const newCurbNode = osmNode({ loc: [newNodePosition.lon, newNodePosition.lat], tags, visible: true });

    // Add the new node to the graph
    editor.perform(actionAddMidpoint({ loc: newCurbNode.loc, edge: [node.id, adjacentNode.id] }, newCurbNode));

    // Perform the split
    const splitAction = actionSplit([newCurbNode.id]);
    graph = editor.perform(splitAction);
    const newWayIDs = splitAction.getCreatedWayIDs();

    // Ensure that the new ways are created correctly
    if (newWayIDs.length > 0) {
      // Change tags to indicate these are sidewalks
      const sidewalkTags = { highway: 'footway', footway: 'sidewalk' };
      newWayIDs.forEach(wayId => {
        editor.perform(actionChangeTags(wayId, sidewalkTags));
      });

      // Commit the changes to the graph
      editor.commit({
        annotation: 'Added curb node and updated way tags to sidewalks',
        selectedIDs: [node.id].concat(newWayIDs)
      });
    } else {
      console.error('No new ways created after split');
    }
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
   * updateNodeToCurb
   * Updates the given node to a curb with specified tags.
   * @param  {Object} node - The node to update.
   * @param  {Object} tags - The tags to assign to the node.
   * @param  {Object} graph - The graph containing the node data.
   */
  function updateNodeToCurb(node, tags, graph) {
    // Prepare the new tags for the node
    const newTags = {...node.tags, barrier: 'kerb', kerb: tags.kerb};

    // Perform the tag change using the editor's actionChangeTags method
    editor.perform(actionChangeTags(node.id, newTags));

    // Optionally, you can directly commit the change here, or you can handle the commit elsewhere
    editor.commit({
      annotation: `Modified node to ${tags.kerb} curb at the junction with a traffic island`,
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
   * getIconForCurbNode
   * Determines the appropriate icon for a curb node based on its tags
   * @param  {Object} tags - The tags of the curb node
   * @return {String} The ID of the icon to use
   */
  function getIconForCurbNode(tags) {
    let iconID = 'default-icon'; // Default icon
    if (tags.barrier === 'kerb' && tags.kerb === 'flush') {
        iconID = 'temaki-kerb-flush';
    } else if (tags.barrier === 'kerb' && tags.kerb === 'raised') {
        iconID = 'temaki-kerb-raised';
    } else if (tags.barrier === 'kerb' && tags.kerb === 'lowered') {
        iconID = 'temaki-kerb-lowered';
    } else if (tags.barrier === 'kerb' && tags.kerb === 'unspecified') {
        iconID = 'temaki-kerb-unspecified';
    }
    return iconID;
  }

  validation.type = type;

  return validation;
}
