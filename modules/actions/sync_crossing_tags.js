
// Some of these don't make sense for crossings, but we will check them
const roadVals = new Set([
  'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential',
  'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link',
  'unclassified', 'road', 'service', 'track', 'living_street', 'bus_guideway', 'busway',
]);

const pathVals = new Set([
  'path', 'footway', 'cycleway', 'bridleway', 'pedestrian'
]);

const crossingKeys = new Set([
  'crossing', 'crossing_ref',
  'crossing:signals', 'crossing:markings', 'crossing:island',
  'lit', 'traffic_calming', 'surface'
]);


/**
 *  actionSyncCrossingTags
 *  This keeps the tags in sync between a parent crossing way and a child crossing node.
 */
export function actionSyncCrossingTags(entityID) {

  return function action(graph) {
    const entity = graph.entity(entityID);
    const geometry = entity.geometry(graph);

    if (geometry === 'line') {
      graph = syncParentToChildren(entity, graph);
    }
    // else if 'vertex', syncChildToParent?

    return graph;
  };


  // When modifying a crossing way, sync certain tags to any connected crossing nodes.
  function syncParentToChildren(parent, graph) {
    const parentTags = Object.assign({}, parent.tags);  // copy

    // Is the parent way tagged with something like `highway=footway`+`footway=crossing` ?
    let isCrossing = false;
    for (const k of pathVals) {
      if (parentTags.highway === k && parentTags[k] === 'crossing') {
        isCrossing = true;
        break;
      }
    }

    // If parent way isn't a road-path crossing anymore, most of these tags should be removed.
    if (!isCrossing) {
      for (const k of crossingKeys) {
        // Watch out, it could be a `railway=crossing` or something, so some tags can remain.
        if (['crossing', 'lit', 'surface'].includes(k)) continue;
        delete parentTags[k];
      }
      graph = graph.replace(parent.update({ tags: parentTags }));
    }

    // Gather relevant crossing tags from the parent way..
    const crossingTags = {};
    for (const k of crossingKeys) {
      crossingTags[k] = parentTags[k];
    }

    // Gather junctions between the parent and any other roads..
    const junctionNodes = new Set();
    for (const nodeID of parent.nodes) {
      const child = graph.hasEntity(nodeID);
      if (!child) continue;

      for (const other of graph.parentWays(child)) {
        if (other.id === parent.id) continue;  // ignore self

        if (roadVals.has(other.tags.highway)) {  // its a road
          junctionNodes.add(child);
        }
      }
    }

    // Sync the tags..
    for (const junctionNode of junctionNodes) {
      const tags = Object.assign({}, junctionNode.tags);  // copy

      for (const [k, v] of Object.entries(crossingTags)) {
        if (v) {
          tags[k] = v;
        } else {
          delete tags[k];
        }
      }

      // Set/remove the `highway=crossing` tag too.
      // Watch out for multivalues ';', sometimes the `crossing` might also be a stopline / traffic_signals / etc.
      const highwayVals = new Set( (tags.highway || '').split(';').filter(Boolean) );
      if (isCrossing) {
        highwayVals.add('crossing');
      } else {
        highwayVals.delete('crossing');
      }

      if (highwayVals.size) {
        tags.highway = Array.from(highwayVals).join(';');
      } else {
        delete tags.highway;
      }

      graph = graph.replace(junctionNode.update({ tags: tags }));
    }

    return graph;
  }

}
