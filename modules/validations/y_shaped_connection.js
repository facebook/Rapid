import { geoAngle, geoSphericalDistance } from '../geo';
import { operationDelete } from '../operations/index';
import { t } from '../util/locale';
import { validationIssue, validationIssueFix } from '../core/validation';


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

    var type = 'y_shaped_connection';
    // THD means "threshold"
    var SHORT_EDGE_THD_METERS = 12;
    var NON_FLAT_ANGLE_THD_DEGREES = 5;

    var relatedHighways = {
        residential: true, service: true, track: true, unclassified: true,
        tertiary: true, secondary: true, primary: true, living_street: true,
        cycleway: true, trunk: true, motorway: true, road: true, raceway: true
    };


    function isTaggedAsRelatedHighway(entity) {
        return relatedHighways[entity.tags.highway];
    }

    function getRelatedHighwayParents(node, graph) {
        var parentWays = graph.parentWays(node);
        return parentWays.filter(function (way) {
            return isTaggedAsRelatedHighway(way);
        });
    }

    function createIssueAndFixForNode(node, context) {
        var deletable = !operationDelete([node.id], context).disabled();
        var fix = undefined;
        if (deletable) {
            fix = new validationIssueFix({
                icon: 'iD-operation-delete',
                title: t('issues.fix.delete_node_around_conn.title'),
                entityIds: [node.id],
                onClick: function() {
                    var id = this.entityIds[0];
                    var operation = operationDelete([id], context);
                    if (!operation.disabled()) {
                        operation();
                    }
                }
            });
        } else {
            fix = new validationIssueFix({
                icon: 'iD-operation-move',
                title: t('issues.fix.move_node_around_conn.title'),
                entityIds: [node.id]
            });
        }

        return new validationIssue({
            type: type,
            severity: 'warning',
            message: function() {
                return t('issues.y_shaped_connection.message');
            },
            reference: function(selection) {
                selection.selectAll('.issue-reference')
                    .data([0])
                    .enter()
                    .append('div')
                    .attr('class', 'issue-reference')
                    .text(t('issues.y_shaped_connection.reference'));
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
        var connNid = way.nodes[connNodeIdx];
        var connNode = graph.entity(connNid);
        var pways = getRelatedHighwayParents(connNode, graph);
        if (pways.length < 2) return false;

        // check if the edge between connNode and edgeNode is short
        var edgeNid = way.nodes[edgeNodeIdx];
        var edgeNode = graph.entity(edgeNid);
        var edgeLen = geoSphericalDistance(connNode.loc, edgeNode.loc);
        if (edgeLen > SHORT_EDGE_THD_METERS) return false;

        // check if connNode is a Y-shaped connection
        var prevEdgeGeoAngle = 0;
        var nextEdgeGeoAngle = 0;
        var angleBetweenEdges = 0;
        var otherNodeIdx = connNodeIdx < edgeNodeIdx ? connNodeIdx - 1 : connNodeIdx + 1;
        var otherNid = way.nodes[otherNodeIdx];
        var otherNode = graph.entity(otherNid);
        if (otherNodeIdx < edgeNodeIdx) {
            // node order along way: otherNode -> connNode -> edgeNode
            prevEdgeGeoAngle = geoAngle(otherNode, connNode, context.projection);
            nextEdgeGeoAngle = geoAngle(connNode, edgeNode, context.projection);
            angleBetweenEdges = Math.abs(nextEdgeGeoAngle - prevEdgeGeoAngle) / Math.PI * 180.0;
        } else {
            // node order along way: edgeNode -> connNode -> otherNode
            prevEdgeGeoAngle = geoAngle(edgeNode, connNode, context.projection);
            nextEdgeGeoAngle = geoAngle(connNode, otherNode, context.projection);
            angleBetweenEdges = Math.abs(nextEdgeGeoAngle - prevEdgeGeoAngle) / Math.PI * 180.0;
        }

        return angleBetweenEdges > NON_FLAT_ANGLE_THD_DEGREES;
    }


    var validation = function(entity, graph) {
        // Only flag issue on non-connection nodes on negative ways
        if (entity.type !== 'node') return [];
        var pways = getRelatedHighwayParents(entity, graph);
        if (pways.length !== 1 || !pways[0].id.startsWith('w-')) return [];

        // check if either neighbor node on its parent way is a connection node
        var issues = [];
        var way = pways[0];
        var idx = way.nodes.indexOf(entity.id);
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
