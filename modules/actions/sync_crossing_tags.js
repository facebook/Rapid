
// Some of these don't make sense for crossings, but we will check them
const roadVals = new Set([
  'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential',
  'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link',
  'unclassified', 'road', 'service', 'track', 'living_street', 'bus_guideway', 'busway',
]);

const pathVals = new Set([
  'path', 'footway', 'cycleway', 'bridleway', 'pedestrian'
]);

// These crossing tags should be kept in sync between the parent way and any child nodes
const crossingKeys = new Set([
  'crossing', 'crossing_ref', 'crossing:continuous', 'crossing:island', 'crossing:markings', 'crossing:signals'
]);

// These tags can be preserved (not deleted) if they are set in one place and not the other.
// (they function more as attribute tags than defining tags)
const crossingPreserveKeys = new Set([
  'crossing_ref', 'crossing:continuous', 'crossing:island'
]);

/**
 *  actionSyncCrossingTags
 *  This performs some basic crossing tag cleanups and upgrades, and keeps the
 *  crossing tags in sync between parent crossing ways and child crossing nodes.
 *
 *  Each "crossing" has 2 geometries that need to be kept in sync:
 *  - A crossing way:   It will be tagged like `highway=footway` + `footway=crossing`
 *  - A crossing node:  It will be tagged like `highway=crossing`
 *
 *  This code is run automatically:
 *  - when changing presets, if a crossing tag is affected
 *  - when editing in the field sections of the preset editor, if a crossing tag is affected
 *    (but not the raw tag editor)
 *  - by the `ambiguous_crossing_tags` validator to detect issues, or make fixes
 *
 *  @param  {string}   entityID  - The Entity with the tags that should be checked
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
   * _isHighwayCrossingWay
   * Is the way tagged with something that would indicate that it is a crossing,
   *   for example `highway=footway`+`footway=crossing` ?
   * @param   {Object}   tags - tags to check
   * @return  {boolean}  `true` if the way is tagged as a crossing
   */
  function _isHighwayCrossingWay(tags) {
    for (const k of pathVals) {
      if (tags.highway === k && tags[k] === 'crossing') {
        return true;
      }
    }
    return false;
  }


  /**
   * _isCrossableWay
   * Is the way tagged with something that can have crossing nodes along it?
   * @param   {Object}   tags - tags to check
   * @return  {boolean}  `true` if the way is tagged as a crossing
   */
  function _isCrossableWay(tags) {
    return roadVals.has(tags.highway) || pathVals.has(tags.highway) || !!tags.railway || !!tags.crossing;
  }


//  /**
//   * _isPathWay
//   * Is the way tagged with something that would indicate that it is a path,
//   *   for example `highway=footway` (with or without the crossing)
//   * @param   {Object}   tags - tags to check
//   * @return  {boolean}  true if the way is considered a path (with or without crossing tags)
//   */
//  function _isPathWay(tags) {
//    return pathVals.has(tags.highway);
//  }


  /**
   * _isCrossingNode
   * Is the node tagged with something that would indicate that it is a crossing,
   *   for example `highway=crossing`
   * @param   {Object}   tags - tags to check
   * @return  {boolean}
   */
  function _isCrossingNode(tags) {
    // Watch out for multivalues ';', sometimes the `crossing` might also be a stopline / traffic_signals / etc.
    const highwayVals = new Set( (tags.highway || '').split(';').filter(Boolean) );
    return !!tags['crossing:markings'] || highwayVals.has('crossing');
  }


  /**
   * syncParentToChildren
   * When modifying a way, make sure the parent and children have consistent crossing tags.
   *  - if the parent is a crossing, child nodes should have matching crossing tags.
   *  - if the parent is no longer a crossing, child nodes may need to have their crossing tags removed.
   * @param   {Node}    child - The child  Node with the tags that have changed.
   * @param   {Graph}   graph - The input Graph
   * @param   {string?} skipChildID - Optional, if the change originated from `syncChildToParents`, skip the original child nodeID
   * @return  {Graph}   The modified output Graph
   */
  function syncParentToChildren(parent, graph, skipChildID) {
    let parentTags = Object.assign({}, parent.tags);  // copy
    parentTags = cleanCrossingTags(parentTags);

    // These are the two conditions where we want to attempt syncing the parent crossing tags to child nodes:
    // 1. Is the parent actually a crossing  (e.g. `highway=footway`+`footway=crossing`)
    const isCrossingWay = _isHighwayCrossingWay(parentTags);
    // 2. Some kind of way that shouldn't have crossing tags on it. (e.g. tagged as a stream or barrier or something)
    const isNotCrossable = !_isCrossableWay(parentTags);

    if (isNotCrossable) {    // crossing tags should be removed
      for (const k of crossingKeys) {
        delete parentTags[k];
      }
    }
    parent = parent.update({ tags: parentTags });
    graph = graph.replace(parent);

    // Exit if one of these isn't true.
    if (!(isCrossingWay || isNotCrossable)) return graph;

    // Gather relevant crossing tags from the parent way, these are the tags that will be synced.
    // (If the parent is not a crossing, we'll be gathering `undefined`, this is expected)
    const syncTags = {};
    for (const k of crossingKeys) {
      syncTags[k] = parentTags[k];
    }

    // Gather childNodes - these nodes will receive the synced tags.
    const childNodes = new Set();

    for (const nodeID of parent.nodes) {
      // If we were called from `syncChildToParents`, skip the child that initiated the change.
      if (nodeID === skipChildID) continue;

      const node = graph.hasEntity(nodeID);
      if (!node) continue;

      if (isCrossingWay) {  // Parent is a crossing - we are adding/updating crossing tags on childNodes..
        let isCandidate = false;
        for (const other of graph.parentWays(node)) {
          if (other.id === parent.id) continue;  // ignore self
          if (roadVals.has(other.tags.highway)) {  // other is an actual road
            isCandidate = true;
            break;
          }
        }
        if (isCandidate) {
          childNodes.add(node);
        }

      } else if (isNotCrossable) {  // Parent is not a crossing - we are removing crossing tags from childNodes..
        let isCandidate = true;
        for (const other of graph.parentWays(node)) {
          if (other.id === parent.id) continue;  // ignore self
          if (_isCrossableWay(other.tags)) {  // other way can have crossing tags
            isCandidate = false;              // so dont touch them
            break;
          }
        }
        if (isCandidate) {
          childNodes.add(node);
        }
      }
    }


    // Sync the tags to the child nodes..
    const isInformalCrossing = ['informal', 'no'].includes(syncTags.crossing);
    for (const child of childNodes) {
      const childTags = Object.assign({}, child.tags);  // copy

      for (const [k, v] of Object.entries(syncTags)) {
        if (v) {
          childTags[k] = v;
        } else if (!crossingPreserveKeys.has(k)) {
          delete childTags[k];
        }
      }

      // Set/remove the `highway=crossing` tag too.
      // Watch out for multivalues ';', sometimes the `crossing` might also be a stopline / traffic_signals / etc.
      const highwayVals = new Set( (childTags.highway || '').split(';').filter(Boolean) );
      if (isCrossingWay) {
        if (isInformalCrossing) {  // By convention this should be removed for `crossing=no` and `crossing=informal`.
          highwayVals.delete('crossing');
        } else {
          highwayVals.add('crossing');
        }
      } else if (isNotCrossable) {
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
   *  (and other children along those ways)
   * @param   {Node}   child - The child  Node with the tags that have changed.
   * @param   {Graph}  graph - The input Graph
   * @return  {Graph}  The modified output Graph
   */
  function syncChildToParents(child, graph) {
    const parentWays = graph.parentWays(child);

    let childTags = Object.assign({}, child.tags);  // copy
    childTags = cleanCrossingTags(childTags);

    // Is the child vertex
    // 1. tagged with something like `highway=crossing` or `crossing:markings=*?  and
    // 2. has a parent that can have crossing nodes along it
    const isCrossingNode = _isCrossingNode(childTags) && parentWays.some(way => _isCrossableWay(way.tags));

    // If child vertex isn't a crossing anymore, most of these tags should be removed.
    if (!isCrossingNode) {
      for (const k of crossingKeys) {
        delete childTags[k];
      }
    }

    child = child.update({ tags: childTags });
    graph = graph.replace(child);

    // Exit if not a crossing (maybe curb ramp or barrier or some other thing - nothing to sync to parent)
    if (!isCrossingNode) return graph;

    // Gather relevant crossing tags from the child way, these are the tags that will be synced.
    const syncTags = {};
    for (const k of crossingKeys) {
      syncTags[k] = childTags[k];
    }

    // Gather parent ways that are already tagged as crossings..
    const crossingWays = new Set();
    for (const way of parentWays) {
      if (_isHighwayCrossingWay(way.tags)) {
        crossingWays.add(way);
      }
    }

    // Sync the tags to the parent ways..
    for (let parent of crossingWays) {
      const parentTags = Object.assign({}, parent.tags);  // copy

      for (const [k, v] of Object.entries(syncTags)) {
        if (v) {
          parentTags[k] = v;
        } else if (!crossingPreserveKeys.has(k)) {
          delete parentTags[k];
        }
      }

      // Unlike in `syncParentToChildren` - we won't adjust the `footway=crossing` tag of the parent way here.
      // The parent way might be a sidewalk that just stretches all the way across the intersection.
      parent = parent.update({ tags: parentTags });
      graph = graph.replace(parent);

      // We should sync these tags to any other sibling crossing nodes along the same parent.
      if (isCrossingNode) {
        graph = syncParentToChildren(parent, graph, child.id);  // but skip this child that initiated the change
      }
    }

    return graph;
  }


  /**
   * cleanCrossingTags
   * Attempt to assign basic defaults to avoid tag mismatches / unnecessary validation warnings.
   * @param   {Object}  t - the input tags to check
   * @return  {Object}  updated tags to set
   */
  function cleanCrossingTags(t) {
    let crossing = t.crossing ?? '';
    let crossingref = t.crossing_ref ?? '';
    let markings = t['crossing:markings'] ?? '';
    let signals  = t['crossing:signals'] ?? '';

    // At least one of these must be set..
    if (!crossing && !crossingref && !markings && !signals) return t;

    // Bail out if any of these tags include semicolons..
    if (crossing.includes(';') || crossingref.includes(';') || markings.includes(';') || signals.includes(';')) return t;

    const tags = Object.assign({}, t);  // copy

    // First, consider `crossing_ref` tag
    if (crossingref) {  // Assign default `crossing:markings`, if it doesn't exist yet..
      if (!markings) {
        switch (crossingref) {
          case 'zebra':
            markings = tags['crossing:markings'] = 'zebra';
            break;
          default:
            markings = tags['crossing:markings'] = 'yes';
            break;
        }
      }
      if (!signals) {  // Assign default `crossing:signals`, if it doesn't exist yet..
        switch (crossingref) {
          case 'hawk':
          case 'pelican':
          case 'puffin':
          case 'toucan':
          case 'pegasus':
            signals = tags['crossing:signals'] = 'yes';
            break;
        }
      }
    }

    // Next, consider the legacy `crossing` tag.
    // See https://wiki.openstreetmap.org/wiki/Proposal:Highway_crossing_cleanup
    if (crossing) {
      if (!markings) {   // Assign default `crossing:markings`, if it doesn't exist yet..
        switch (crossing) {
          case 'island':
          case 'pedestrian_signals':
          case 'traffic_signals':
            break;    // these convey no info about markings
          case 'informal':
          case 'no':
          case 'unmarked':
            markings = tags['crossing:markings'] = 'no';
            break;
          case 'zebra':
            markings = tags['crossing:markings'] = 'zebra';
            break;
          default:
            markings = tags['crossing:markings'] = 'yes';
            break;
        }
      }

      if (!signals) {   // Assign default `crossing:signals`, if it doesn't exist yet..
        switch (crossing) {
          case 'informal':
          case 'no':
          case 'uncontrolled':
            signals = tags['crossing:signals'] = 'no';
            break;
          case 'pedestrian_signals':
          case 'traffic_signals':
            signals = tags['crossing:signals'] = 'yes';
            break;
        }
      }

      // Remove the legacy `crossing` tag if it directly conflicts with a modern `crossing:*` tag.
      const legacyMarked = !(['island', 'informal', 'no', 'traffic_signals', 'pedestrian_signals', 'unmarked'].includes(crossing));
      const legacySignaled = (['traffic_signals', 'pedestrian_signals'].includes(crossing));
      const modernMarked = (markings && markings !== 'no');
      const modernSignaled = (signals && signals !== 'no');
      if (
        (legacyMarked && !modernMarked) || (!legacyMarked && modernMarked) ||
        (legacySignaled && !modernSignaled) || (!legacySignaled && modernSignaled) ||
        (crossing === 'yes' && markings)  // replace 'yes' with something better - Rapid#1284
      ) {
        crossing = null;
        delete tags.crossing;
      }
    }


    // Attempt to assign a legacy `crossing` tag, if it is missing and there are modern tags set.
    if (!tags.crossing) {
      if (signals && signals !== 'no') {
        tags.crossing = 'traffic_signals';

      } else if (markings) {
        switch (markings) {
          case 'no':
            tags.crossing = 'unmarked';
            break;
          default:
            tags.crossing = 'marked';
            break;
        }
      }
    }

    return tags;
  }

}
