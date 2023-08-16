export function actionChangeTags(entityID, tags) {
  return function(graph) {
    const entity = graph.entity(entityID);
    return graph.replace(entity.update({ tags: tags }));
  };
}
