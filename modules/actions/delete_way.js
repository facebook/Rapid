import { osmNodeGeometriesForTags } from '../osm/tags.js';
import { actionDeleteRelation } from './delete_relation.js';


// https://github.com/openstreetmap/potlatch2/blob/master/net/systemeD/halcyon/connection/actions/DeleteWayAction.as
export function actionDeleteWay(wayID) {

    function canDeleteNode(node, graph) {
        // Don't delete nodes still attached to ways or relations
        if (graph.parentWays(node).length || graph.parentRelations(node).length) return false;

        var geometries = osmNodeGeometriesForTags(node.tags);
        if (geometries.point) return false;    // don't delete if this node can be a standalone point
        if (geometries.vertex) return true;    // do delete if this node can only be a vertex

        // If not sure, only delete if there are no interesting tags
        return !node.hasInterestingTags();
    }


    var action = function(graph) {
        var way = graph.entity(wayID);

        graph.parentRelations(way).forEach(function(parent) {
            parent = parent.removeMembersWithID(wayID);
            graph = graph.replace(parent);

            if (parent.isDegenerate()) {
                graph = actionDeleteRelation(parent.id)(graph);
            }
        });

        (new Set(way.nodes)).forEach(function(nodeID) {
            graph = graph.replace(way.removeNode(nodeID));

            var node = graph.entity(nodeID);
            if (canDeleteNode(node, graph)) {
                graph = graph.remove(node);
            }
        });

        return graph.remove(way);
    };


    return action;
}
