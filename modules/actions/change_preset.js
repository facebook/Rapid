import { actionSyncCrossingTags } from './sync_crossing_tags.js';

export function actionChangePreset(entityID, oldPreset, newPreset, skipFieldDefaults) {
  return function action(graph) {
    const entity = graph.entity(entityID);
    const geometry = entity.geometry(graph);
    const origTags = Object.assign({}, entity.tags);
    let tags = entity.tags;

    // preserve tags that the new preset might care about, if any
    if (oldPreset) tags = oldPreset.unsetTags(tags, geometry, newPreset && newPreset.addTags ? Object.keys(newPreset.addTags) : null);
    if (newPreset) tags = newPreset.setTags(tags, geometry, skipFieldDefaults);

    graph = graph.replace(entity.update({ tags: tags }));

    const crossingKeys = ['crossing', 'crossing_ref', 'crossing:continuous', 'crossing:island', 'crossing:markings', 'crossing:signals'];
    if (crossingKeys.some(k => tags[k] !== origTags[k])) {  // `crossing` tag changed?
      graph = actionSyncCrossingTags(entityID)(graph);      // more updates may be necessary..
    }

    return graph;
  };
}
