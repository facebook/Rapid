import { geoSphericalDistance, vecAngle } from '@rapid-sdk/math';

import { operationDelete } from '../operations/index.js';
import { ValidationIssue, ValidationFix } from '../core/lib/index.js';


export function validationYShapedConnection(context) {
  /* We want to catch and warn about the following "shapes of connections"
   * that may appear in ML-generated roads:
   * (1) Two short edges around a connection node, causing a "Y-shaped" connection
   *     ________ _______
   *             V
   *             |
   *             |
   *             |
   * (2) One short edges around a connection node. The connection is not exactly
   * "Y-shaped", but still a little too detailed.
   *               _______
   *  ___________ /
   *             |
   *             |
   *             |
   * The potential fix is to remove the non-connection nodes causing the short edges,
   * so that the shape of the connection becomes more like a "T".
   *
   * This validation will flag issues on those excessive non-connection nodes around
   * Y-shaped connections and suggest deletion or move as possible fixes.
   */

  const type = 'y_shaped_connection';
  const l10n = context.systems.l10n;

  const SHORT_EDGE_THD_METERS = 12;       // (THD means "threshold")
  const NON_FLAT_ANGLE_THD_DEGREES = 5;
  const relatedHighways = new Set([
    'residential', 'service', 'track', 'unclassified',
    'tertiary', 'secondary', 'primary', 'living_street',
    'cycleway', 'trunk', 'motorway', 'road', 'raceway'
  ]);


  function getRelatedHighwayParents(node, graph) {
    const parentWays = graph.parentWays(node);
    return parentWays.filter(way => relatedHighways.has(way.tags.highway));
  }

  function createIssueAndFixForNode(node, context) {
    const deletable = !operationDelete(context, [node.id]).disabled();
    let fix;
    if (deletable) {
      fix = new ValidationFix({
        icon: 'rapid-operation-delete',
        title: l10n.t('issues.fix.delete_node_around_conn.title'),
        entityIds: [node.id],
        onClick: function() {
          const id = this.entityIds[0];
          const operation = operationDelete(context, [id]);
          if (!operation.disabled()) {
            operation();
          }
        }
      });
    } else {
      fix = new ValidationFix({
        icon: 'rapid-operation-move',
        title: l10n.t('issues.fix.move_node_around_conn.title'),
        entityIds: [node.id]
      });
    }

    return new ValidationIssue(context, {
      type: type,
      severity: 'warning',
      message: () => {
        return l10n.t('issues.y_shaped_connection.message');
      },
      reference: selection => {
        selection.selectAll('.issue-reference')
          .data([0])
          .enter()
          .append('div')
          .attr('class', 'issue-reference')
          .text(l10n.t('issues.y_shaped_connection.reference'));
      },
      entityIds: [node.id],
      fixes: [fix]
    });
  }


  // Check
  // (1) if the edge between connNodeIdx and edgeNodeIdx is a short edge
  // (2) if the node at connNodeIdx is a Y-shaped connection
  // return true only if both (1) and (2) hold.
  function isShortEdgeAndYShapedConnection(graph, way, connNodeIdx, edgeNodeIdx) {
    // conditions for connNode to be a possible Y-shaped connection:
    // (1) it is a connection node with edges on both side
    // (2) at least one edge is short
    // (3) the angle between the two edges are not close to 180 degrees

    if (connNodeIdx <= 0 || connNodeIdx >= way.nodes.length - 1) return false;

    // make sure the node at connNodeIdx is really a connection node
    const connNid = way.nodes[connNodeIdx];
    const connNode = graph.entity(connNid);
    const pways = getRelatedHighwayParents(connNode, graph);
    if (pways.length < 2) return false;

    // check if the edge between connNode and edgeNode is short
    const edgeNid = way.nodes[edgeNodeIdx];
    const edgeNode = graph.entity(edgeNid);
    const edgeLen = geoSphericalDistance(connNode.loc, edgeNode.loc);
    if (edgeLen > SHORT_EDGE_THD_METERS) return false;

    // check if connNode is a Y-shaped connection
    const otherNodeIdx = connNodeIdx < edgeNodeIdx ? connNodeIdx - 1 : connNodeIdx + 1;
    const otherNid = way.nodes[otherNodeIdx];
    const otherNode = graph.entity(otherNid);
    const other = context.viewport.project(otherNode.loc);
    const conn = context.viewport.project(connNode.loc);
    const edge = context.viewport.project(edgeNode.loc);
    let prevEdgeAngle = 0;
    let nextEdgeAngle = 0;
    let angleBetweenEdges = 0;

    if (otherNodeIdx < edgeNodeIdx) {
      // node order along way: otherNode -> connNode -> edgeNode
      prevEdgeAngle = vecAngle(other, conn);
      nextEdgeAngle = vecAngle(conn, edge);
      angleBetweenEdges = Math.abs(nextEdgeAngle - prevEdgeAngle) / Math.PI * 180.0;
    } else {
      // node order along way: edgeNode -> connNode -> otherNode
      prevEdgeAngle = vecAngle(edge, conn);
      nextEdgeAngle = vecAngle(conn, other);
      angleBetweenEdges = Math.abs(nextEdgeAngle - prevEdgeAngle) / Math.PI * 180.0;
    }

    return angleBetweenEdges > NON_FLAT_ANGLE_THD_DEGREES;
  }


  let validation = function(entity, graph) {
    // Only flag issue on non-connection nodes on negative ways
    if (entity.type !== 'node') return [];
    const pways = getRelatedHighwayParents(entity, graph);
    if (pways.length !== 1 || !pways[0].id.startsWith('w-')) return [];

    // check if either neighbor node on its parent way is a connection node
    let issues = [];
    const way = pways[0];
    const idx = way.nodes.indexOf(entity.id);
    if (idx <= 0) return issues;
    if (isShortEdgeAndYShapedConnection(graph, way, idx - 1, idx) ||
      isShortEdgeAndYShapedConnection(graph, way, idx + 1, idx)) {
      issues.push(createIssueAndFixForNode(entity, context));
    }
    return issues;
  };


  validation.type = type;

  return validation;
}
