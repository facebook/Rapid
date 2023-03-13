import { geomRotatePoints } from '@rapid-sdk/math';
import { utilGetAllNodes } from '@rapid-sdk/util';


export function actionRotate(rotateIds, pivot, angle, projection) {
    var action = function(graph) {
        return graph.update(function(graph) {
            utilGetAllNodes(rotateIds, graph).forEach(function(node) {
                var point = geomRotatePoints([projection.project(node.loc)], angle, pivot)[0];
                graph = graph.replace(node.move(projection.invert(point)));
            });
        });
    };

    return action;
}
