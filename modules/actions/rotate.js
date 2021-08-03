import { geomRotatePoints } from '@id-sdk/geom';
import { utilGetAllNodes } from '../util';


export function actionRotate(rotateIds, pivot, angle, projection) {

    var action = function(graph) {
        return graph.update(function(graph) {
            utilGetAllNodes(rotateIds, graph).forEach(function(node) {
                var point = geomRotatePoints([projection(node.loc)], angle, pivot)[0];
                graph = graph.replace(node.move(projection.invert(point)));
            });
        });
    };

    return action;
}
