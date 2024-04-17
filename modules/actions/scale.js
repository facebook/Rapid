import { utilGetAllNodes } from '@rapid-sdk/util';


export function actionScale(entityIDs, pivotLoc, scaleFactor, viewport) {
  return function(graph) {
    return graph.update(function(graph) {
      let point, radial;

      utilGetAllNodes(entityIDs, graph).forEach(function(node) {
        point = viewport.project(node.loc);
        radial = [
          point[0] - pivotLoc[0],
          point[1] - pivotLoc[1]
        ];
        point = [
          pivotLoc[0] + (scaleFactor * radial[0]),
          pivotLoc[1] + (scaleFactor * radial[1])
        ];

        graph = graph.replace(node.move(viewport.unproject(point)));
      });
    });
  };
}
