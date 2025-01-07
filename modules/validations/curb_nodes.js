import { geoLatToMeters, geoLonToMeters, geoMetersToLat, geoMetersToLon } from '@rapid-sdk/math';

import { ValidationIssue, ValidationFix } from '../core/lib/index.js';
import { actionAddMidpoint, actionChangeTags, actionSplit} from '../actions/index.js';
import { osmNode } from '../osm/node.js';
import { uiIcon } from '../ui/icon.js';


export function validationCurbNodes(context) {
  const type = 'curb_nodes';
  const editor = context.systems.editor;
  const l10n = context.systems.l10n;


  /**
   * checkCurbNodeCandidacy
   * This validation checks the given entity to see if it is a candidate to have curb nodes added to it
   * @param  {Entity}  entity - the Entity to validate
   * @param  {Graph}   graph - the Graph we are validating
   * @return {Array<ValidationIssue>}  validation results
   */
  const validation = function checkCurbNodeCandidacy(entity, graph) {
    if (entity.type !== 'way' || entity.isDegenerate()) return [];
    return detectCurbCandidates(entity, graph);
  };


  /**
   * isCrossingWay
   * Checks if the given tags describe a crossing way
   * @param  {Object}   tags - The tags to check
   * @return {Boolean}  True if the way has crossing tags, false otherwise
   */
  const isCrossingWay = (tags) => {
    return (tags.highway === 'footway' && tags.footway === 'crossing') ||
      (tags.highway === 'cycleway' && tags.cycleway === 'crossing');
  };


  /**
   * detectCurbCandidates
   * @param  {Way}    way - the Way to validate
   * @param  {Graph}  graph - the Graph we are validating
   * @return {Array<ValidationIssue>}  validation results
   */
  const detectCurbCandidates = (way, graph) => {
    let issues = [];
    const wayID = way.id;
    if (!hasRoutableTags(way) || !isCrossingWay(way.tags)) return issues;

    // Check all nodes in the way for curb tags
    for (const nodeId of way.nodes) {
      const node = graph.entity(nodeId);
      if (hasCurbTag(node)) {
        // If any node has a curb tag, skip this way as a candidate
        return issues;
      }
    }
    // If no curb nodes are found, suggest adding curbs
    issues.push(new ValidationIssue(context, {
      type,
      subtype: 'missing_curb_nodes',
      severity: 'suggestion',
      message: () => way ? l10n.t('issues.curb_nodes.message', { feature: l10n.displayLabel(way, graph) }) : 'Way not found',
      reference: showReference,
      entityIds: [wayID],
      data: { crossingWayID: wayID },
      dynamicFixes: () => ['unspecified', 'flush', 'lowered', 'raised'].map(type => {
        const tags = { barrier: 'kerb', kerb: type };
        const iconID = getIconForCurbNode(tags);
        return new ValidationFix({
          icon: iconID,
          title: l10n.t('issues.curb_nodes.fix.add_curb_nodes', { type: type }),
          onClick: () => {
            performCurbNodeFixes(wayID, tags);
            editor.commit({
              annotation: l10n.t('issues.curb_nodes.annotation.added_curb_nodes', { type: type }),
              selectedIDs: [wayID]
            });
          }
        });
      })
    }));
    return issues;
  };


  /**
   * hasRoutableTags
   * Checks if the given way has tags that make it routable
   * @param  {Way}      way - The way entity to check
   * @return {Boolean}  True if the way has routable tags, false otherwise
   */
  function hasRoutableTags(way) {
    const routableTags = ['highway', 'cycleway'];
    return way.isArea() ? false : routableTags.some(tag => way.tags[tag]);
  }


  /**
   * showReference
   * Displays a reference for the issue in the UI
   * @param  {d3-selection} $selection - The UI selection to append the reference to
   */
  function showReference($selection) {
    const $$reference = $selection.selectAll('.issue-reference')
      .data([0])
      .enter()
      .append('div')
      .attr('class', 'issue-reference');

    $$reference
      .append('span')
      .text(l10n.t('issues.curb_nodes.reference.text'));

    $$reference
      .append('br');

    const $$link = $$reference
      .append('a')
      .attr('href', l10n.t('issues.curb_nodes.reference.link_url'))
      .attr('target', '_blank')
      .attr('title', l10n.t('issues.curb_nodes.reference.link_alt_text'))
      .call(uiIcon('#rapid-icon-out-link', 'inline'));

    $$link
      .append('span')
      .text(l10n.t('issues.curb_nodes.reference.link_text'));
  }


  /**
   * hasCurbTag
   * Checks if the given node has a curb
   * @param  {Node}     node  - The node entity to check
   * @return {Boolean}  true if the node has some tags that would indicate a curb, false otherwise
   */
  function hasCurbTag(node) {
    const tags = node.tags;
    return !!tags.kerb || tags.barrier === 'kerb';
  }


  /**
   * performCurbNodeFixes
   * Either make the endpoints curb nodes, or insert curb nodes around there.
   * @param  {string}  wayID - The ID of the way to modify.
   * @param  {Object}  tags - The tags to assign to the new curb nodes.
   */
  function performCurbNodeFixes(wayID, tags) {
    const graph = editor.staging.graph;
    const way = graph.hasEntity(wayID);
    if (!way) {
      console.error('Way not found:', wayID);  // eslint-disable-line no-console
      return;
    }

    const firstNode = graph.entity(way.nodes.at(0));
    const lastNode = graph.entity(way.nodes.at(-1));
    const firstConnections = graph.parentWays(firstNode).filter(parent => parent.id !== wayID);
    const lastConnections = graph.parentWays(lastNode).filter(parent => parent.id !== wayID);
    const firstConnectsToRefugeIsland = firstConnections.some(parent => isRefugeIsland(parent));
    const lastConnectsToRefugeIsland = lastConnections.some(parent => isRefugeIsland(parent));

    // Handle the first node
    if (!firstConnections.length || firstConnectsToRefugeIsland) {
      updateNodeToCurb(firstNode, tags, graph);
    } else {
      insertCurbNode(firstNode, way, graph, tags);
    }

    // Handle the last node
    if (!lastConnections.length || lastConnectsToRefugeIsland) {
      updateNodeToCurb(lastNode, tags, graph);
    } else {
      insertCurbNode(lastNode, way, graph, tags);
    }
  }


  /**
   * insertCurbNode
   * Adds a single curb node to a specified way at the position of an existing node, splits the way, and updates tags.
   * This function is used when a node is not connected to a traffic island and needs a curb node addition.
   * @param  {Node}    node - The existing node where the curb node will be added.
   * @param  {Way}     way - The way entity that the node belongs to.
   * @param  {Graph}   graph - The graph containing the way and node data.
   * @param  {Object}  tags - The tags to assign to the new curb node.
   */
  function insertCurbNode(node, way, graph, curbTags) {
    if (hasCurbTag(node)) return;  // Exit if curb already exists

    // Calculate the position for the new curb node
    const nodeIndex = way.nodes.indexOf(node.id);
    const adjacentNode = graph.entity(way.nodes[nodeIndex + 1] || way.nodes[nodeIndex - 1]);
    const newNodePosition = calculateNewNodePosition(node, adjacentNode, 1);

    // Find connected ways and select the appropriate tags
    const connectedWays = graph.parentWays(node);
    let connectedWayTags = null;
    for (const connectedWay of connectedWays) {
      if (connectedWay.id !== way.id && !isCrossingWay(connectedWay.tags)) {
        connectedWayTags = connectedWay.tags;
        break;
      }
    }
    // Check if connectedWayTags is null and set default to "sidewalk"
    if (connectedWayTags === null) {
      connectedWayTags = { highway: 'footway' };
    }
    // Create a new curb node with the specified curb tags
    const newCurbNode = osmNode({ loc: [newNodePosition.lon, newNodePosition.lat], tags: curbTags, visible: true });
    // Add the new node to the graph
    editor.perform(actionAddMidpoint({ loc: newCurbNode.loc, edge: [node.id, adjacentNode.id] }, newCurbNode));

    // Perform the split
    const splitAction = actionSplit([newCurbNode.id]);
    editor.perform(splitAction);

    const newWayIDs = splitAction.getCreatedWayIDs();
    if (newWayIDs.length > 0) {
      for (const wayID of newWayIDs) {
        editor.perform(actionChangeTags(wayID, connectedWayTags));
      }
    } else {
      console.error('No new ways created after split');  // eslint-disable-line no-console
    }
  }


  /**
   * updateNodeToCurb
   * Updates the given node to a curb with specified tags.
   * @param  {Node}    node - The node to update.
   * @param  {Object}  tags - The tags to assign to the node.
   * @param  {Graph}   graph - The graph containing the node data.
   */
  function updateNodeToCurb(node, tags, graph) {
    const newTags = { ...node.tags, barrier: 'kerb', kerb: tags.kerb };
    editor.perform(actionChangeTags(node.id, newTags));
  }


  /**
   * isRefugeIsland
   * Checks if the given way is a refuge island based on its tags.
   * @param  {Way}      way - The way entity to check.
   * @return {Boolean}  True if the way is a refuge island, false otherwise.
   */
  function isRefugeIsland(way) {
    const isTrafficIsland = way.tags.footway === 'traffic_island';
    return isTrafficIsland;
  }


  /**
   * calculateNewNodePosition
   * Calculates the position for a new node based on the start and end nodes
   * @param  {Node}     startNode - The starting node
   * @param  {Node}     endNode - The ending node
   * @param  {number}   distance - The distance from the start node to place the new node
   * @param  {boolean}  isLast - Flag to indicate if this is the last node (affects calculation direction)
   * @return {Object|null} The calculated position or null if an error occurred
   */
  function calculateNewNodePosition(startNode, endNode, distance, isLast = false) {
    if (!startNode || !endNode) return null;
    if (!startNode.loc || !endNode.loc) return null;

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
   * @param  {Object}  tags - The tags of the curb node
   * @return {string}  The ID of the icon to use
   */
  function getIconForCurbNode(tags) {
    let iconID = 'default-icon';
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
