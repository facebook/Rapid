import { geoAngle, geoSphericalDistance } from '../geo';
import { modeSelect } from '../modes';
import { operationDelete } from '../operations/index';
import { t } from '../util/locale';
import { validationIssue, validationIssueFix } from '../core/validator';


export function validationYShapedConnection() {
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

    function createFixForNode(node, context) {
        var deletable = !operationDelete([node.id], context).disabled();
        if (deletable) {
            return new validationIssueFix({
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
            return new validationIssueFix({
                icon: 'iD-operation-move',
                title: t('issues.fix.move_node_around_conn.title'),
                entityIds: [node.id],
                onClick: function() {
                    context.enter(modeSelect(context, [this.entityIds[0]]));
                }
            });
        }
    }

    function findIssuesOnWay(way, node, context) {
        // conditions for input node to be a possible Y-shaped connection:
        // (1) it has edges on both side
        // (2) at least one edge is short
        // (3) the angle between the two edges are not close to 180 degrees
        var issues = [];
        var graph = context.graph();
        var nids = way.nodes;
        var i = nids.indexOf(node.id);
        if (i > 0 && i < nids.length - 1) {
            var prev = graph.entity(nids[i - 1]);
            var next = graph.entity(nids[i + 1]);
            var prevPways = getRelatedHighwayParents(prev, graph);
            var nextPways = getRelatedHighwayParents(next, graph);
            // cheap check first
            if (prevPways.length >= 2 && nextPways.length >= 2) return issues;
            var prevEdgeLen = geoSphericalDistance(node.loc, prev.loc),
                nextEdgeLen = geoSphericalDistance(node.loc, next.loc);
            if (prevEdgeLen >= SHORT_EDGE_THD_METERS && nextEdgeLen >= SHORT_EDGE_THD_METERS) return issues;
            var prevEdgeGeoAngle = geoAngle(prev, node, context.projection);
            var nextEdgeGeoAngle = geoAngle(node, next, context.projection);
            var angleBetweenEdges = Math.abs(nextEdgeGeoAngle - prevEdgeGeoAngle) / Math.PI * 180.0;
            var fixes = [];
            if (prevPways.length < 2 && prevEdgeLen < SHORT_EDGE_THD_METERS &&
                angleBetweenEdges > NON_FLAT_ANGLE_THD_DEGREES) {
                fixes.push(createFixForNode(prev, context));
            }
            if (nextPways.length < 2 && nextEdgeLen < SHORT_EDGE_THD_METERS &&
                angleBetweenEdges > NON_FLAT_ANGLE_THD_DEGREES) {
                fixes.push(createFixForNode(next, context));
            }
            if (fixes.length > 0) {
                issues.push(
                    new validationIssue({
                        type: type,
                        severity: 'warning',
                        message: t('issues.y_shaped_connection.message'),
                        tooltip: t('issues.y_shaped_connection.tip'),
                        entities: [node],
                        fixes: fixes
                    })
                );
            }
        }

        return issues;
    }


    var validation = function(entity, context) {
        // only do check on connection node
        if (entity.type !== 'node') return [];
        var pways = getRelatedHighwayParents(entity, context.graph());
        if (pways.length < 2) return [];

        // see if this is a "Y-shaped" connection caused by short edges on any ML road
        for (var i = 0; i < pways.length; i++) {
            var way = pways[i];
            // TODO: switch to using __fbid__
            if (!way.id.startsWith('w-')) continue;
            var issues = findIssuesOnWay(way, entity, context);
            if (issues.length > 0) return issues;
        }
        return [];
    };


    validation.type = type;

    return validation;
}
