import { geomEdgeEqual } from '@id-sdk/math';
import { utilArrayIntersection } from '@id-sdk/util';


export function actionAddMidpoint(midpoint, node) {
    return function(graph) {
        graph = graph.replace(node.move(midpoint.loc));

        var parents = utilArrayIntersection(
            graph.parentWays(graph.entity(midpoint.a.id)),
            graph.parentWays(graph.entity(midpoint.b.id))
        );

        parents.forEach(function(way) {
            for (var i = 0; i < way.nodes.length - 1; i++) {
                if (geomEdgeEqual([way.nodes[i], way.nodes[i + 1]], [midpoint.a.id, midpoint.b.id])) {
                    graph = graph.replace(graph.entity(way.id).addNode(node.id, i + 1));

                    // Add only one midpoint on doubled-back segments,
                    // turning them into self-intersections.
                    return;
                }
            }
        });

        return graph;
    };
}
