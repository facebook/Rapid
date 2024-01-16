import { actionDeleteRelation } from './delete_relation.js';


export function actionDeleteMember(relationId, memberIndex) {
    return function(graph) {
        var relation = graph.entity(relationId)
            .removeMember(memberIndex);

        graph = graph.replace(relation);

        if (relation.isDegenerate()) {
            graph = actionDeleteRelation(relation.id)(graph);
        }

        return graph;
    };
}
