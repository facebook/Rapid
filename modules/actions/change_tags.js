import { actionSyncCrossingTags } from './sync_crossing_tags';

export function actionChangeTags(entityID, tags) {
  return function(graph) {
    const entity = graph.entity(entityID);
    const origTags = Object.assign({}, entity.tags);

    graph = graph.replace(entity.update({ tags: tags }));

    const crossingKeys = ['crossing', 'crossing_ref', 'crossing:signals', 'crossing:markings', 'crossing:island'];
    if (crossingKeys.some(k => tags[k] !== origTags[k])) {  // `crossing` tag changed?
      graph = actionSyncCrossingTags(entityID)(graph);      // more updates may be necessary..
    }

    return graph;
  };
}
