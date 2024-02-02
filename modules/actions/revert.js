import { actionDeleteRelation } from './delete_relation.js';
import { actionDeleteWay } from './delete_way.js';


export function actionRevert(id) {
    var action = function(graph) {
        var entity = graph.hasEntity(id);
        var base = graph.base.entities.get(id);

        if (entity && !base) {    // entity will be removed..
            if (entity.type === 'node') {
                graph.parentWays(entity)
                    .forEach(function(parent) {
                        parent = parent.removeNode(id);
                        graph = graph.replace(parent);

                        if (parent.isDegenerate()) {
                            graph = actionDeleteWay(parent.id)(graph);
                        }
                    });
            }

            graph.parentRelations(entity)
                .forEach(function(parent) {
                    parent = parent.removeMembersWithID(id);
                    graph = graph.replace(parent);

                    if (parent.isDegenerate()) {
                        graph = actionDeleteRelation(parent.id)(graph);
                    }
                });
        }

        return graph.revert(id);
    };

    return action;
}
