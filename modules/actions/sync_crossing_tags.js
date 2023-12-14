
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
 *  This keeps the tags in sync between parent crossing ways and child crossing nodes.
 *  Each "crossing" has 2 geometries that need to be kept in sync:
 *  - A crossing way:   It will be tagged like `highway=footway` + `footway=crossing`
 *  - A crossing node:  It will be tagged like `highway=crossing`
 *  @param  {string}   entityID  - The Entity with the tags that have changed
 *  @return {Function} The Action function, accepts a Graph and returns a modified Graph
 */
export function actionSyncCrossingTags(entityID) {

  return function action(graph) {
    const entity = graph.entity(entityID);
    const geometry = entity.geometry(graph);

    if (entity.type === 'way' && geometry === 'line') {
      graph = syncParentToChildren(entity, graph);
    } else if (entity.type === 'node' && geometry === 'vertex') {
      graph = syncChildToParents(entity, graph);
    }

    return graph;
  };


  /**
   * syncParentToChildren
   * When modifying a crossing way, sync certain tags to any connected crossing nodes.
   * @param   {Node}    child - The child  Node with the tags that have changed.
   * @param   {Graph}   graph - The input Graph
   * @param   {string?} skipChildID - Optional, if the change originated from `syncChildToParents`, skip the original child nodeID
   * @return  {Graph}   The modified output Graph
   */
  function syncParentToChildren(parent, graph, skipChildID) {
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
    const syncTags = {};
    for (const k of crossingKeys) {
      syncTags[k] = parentTags[k];
    }

    // Gather child crossings between the parent and any other roads..
    const crossingNodes = new Set();
    for (const nodeID of parent.nodes) {
      // If we were called from `syncChildToParents`, skip the child that initiated the change.
      if (nodeID === skipChildID) continue;

      const node = graph.hasEntity(nodeID);
      if (!node) continue;

      for (const other of graph.parentWays(node)) {
        if (other.id === parent.id) continue;  // ignore self

        if (roadVals.has(other.tags.highway)) {  // its a road
          crossingNodes.add(node);
        }
      }
    }

    // Sync the tags to the child nodes..
    for (const child of crossingNodes) {
      const childTags = Object.assign({}, child.tags);  // copy

      for (const [k, v] of Object.entries(syncTags)) {
        if (v) {
          childTags[k] = v;
        } else {
          delete childTags[k];
        }
      }

      // Set/remove the `highway=crossing` tag too.
      // Watch out for multivalues ';', sometimes the `crossing` might also be a stopline / traffic_signals / etc.
      const highwayVals = new Set( (childTags.highway || '').split(';').filter(Boolean) );
      if (isCrossing) {
        highwayVals.add('crossing');
      } else {
        highwayVals.delete('crossing');
      }

      if (highwayVals.size) {
        childTags.highway = Array.from(highwayVals).join(';');
      } else {
        delete childTags.highway;
      }

      graph = graph.replace(child.update({ tags: childTags }));
    }

    return graph;
  }


  /**
   * syncChildToParents
   * When modifying a crossing vertex, sync certain tags to any parent crossing ways.
   * (and other children along those ways)
   * @param   {Node}   child - The child  Node with the tags that have changed.
   * @param   {Graph}  graph - The input Graph
   * @return  {Graph}  The modified output Graph
   */
  function syncChildToParents(child, graph) {
    const childTags = Object.assign({}, child.tags);  // copy

    // Is the child vertex tagged with something like `highway=crossing` or `crossing:markings=*?
    let isCrossing = false;
    if (childTags['crossing:markings'] || childTags.highway === 'crossing') {
      isCrossing = true;
    }

    // If child vertex isn't a road-path crossing anymore, most of these tags should be removed.
    if (!isCrossing) {
      for (const k of crossingKeys) {
        // Watch out, it could be a `railway=crossing` or something, so some tags can remain.
        if (['crossing', 'lit', 'surface'].includes(k)) continue;
        delete childTags[k];
      }
      graph = graph.replace(child.update({ tags: childTags }));
    }

    // Gather relevant crossing tags from the child vertex..
    const syncTags = {};
    for (const k of crossingKeys) {
      syncTags[k] = childTags[k];
    }

    // Gather parent ways that are already tagged as crossings..
    const crossingWays = new Set();
    for (const way of graph.parentWays(child)) {
      for (const k of pathVals) {
        if (way.tags.highway === k && way.tags[k] === 'crossing') {  // e.g. `highway=footway`+`footway=crossing`
          crossingWays.add(way);
        }
      }
    }

    // Sync the tags to the parent ways..
    for (const parent of crossingWays) {
      const parentTags = Object.assign({}, parent.tags);  // copy

      for (const [k, v] of Object.entries(syncTags)) {
        if (v) {
          parentTags[k] = v;
        } else {
          delete parentTags[k];
        }
      }

      // Unlike in `syncParentToChildren` - we won't adjust the `footway=crossing` tag of the parent way here.
      // The parent way might be a sidewalk that just stretches all the way across the intersection.

      graph = graph.replace(parent.update({ tags: parentTags }));

      // We should sync these tags to any other child crossing nodes along the same parent.
      if (isCrossing) {
        graph = syncParentToChildren(parent, graph, child.id);  // skip the current child that initiated the change
      }
    }

    return graph;
  }

}
