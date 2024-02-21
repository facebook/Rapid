import { polygonCentroid as d3_polygonCentroid } from 'd3-polygon';
import { vecInterp } from '@rapid-sdk/math';

import { osmNode } from '../osm/node.js';


export function actionExtract(entityID, viewport) {
  let _extractedNodeID;

  let action = function(graph) {
    const entity = graph.entity(entityID);
    if (entity.type === 'node') {
      return _extractFromNode(entity, graph);
    } else {
      return _extractFromWayOrRelation(entity, graph);
    }
  };


  function _extractFromNode(node, graph) {
    _extractedNodeID = node.id;

    // Create a new node to replace the one we will detach
    const replacement = osmNode({ loc: node.loc });
    graph = graph.replace(replacement);

    for (const parentWay of graph.parentWays(node)) {
      graph = graph.replace(parentWay.replaceNode(entityID, replacement.id));
    }
    for (const parentRelation of graph.parentRelations(node)) {
      graph = graph.replace(parentRelation.replaceMember(node, replacement));
    }
    return graph;
  }


  function _extractFromWayOrRelation(entity, graph) {
    const fromGeometry = entity.geometry(graph);
    const keysToCopyAndRetain = ['source', 'wheelchair'];
    const keysToRetain = ['area'];
    const buildingKeysToRetain = /architect|building|height|layer|nycdoitt:bin|roof/i;

    const geojson = entity.asGeoJSON(graph);
    const coords = geojson.type === 'LineString' ? geojson.coordinates :
      geojson.type === 'Polygon' ? geojson.coordinates[0] :
      geojson.type === 'MultiPolygon' ? geojson.coordinates[0][0] : [];
    const points = coords.map(coord => viewport.project(coord));

    let centroid;
    if (!points.length) {
      return graph;
    } else if (points.length === 1) {
      centroid = points[0];
    } else if (points.length === 2) {
      centroid = vecInterp(points[0], points[1], 0.5);
    } else {
      centroid = d3_polygonCentroid(points);
    }

    let extractedLoc = viewport.unproject(centroid);
    if (!extractedLoc  || !isFinite(extractedLoc[0]) || !isFinite(extractedLoc[1])) {
      extractedLoc = entity.extent(graph).center();
    }

    const indoorAreaValues = {
      area: true,
      corridor: true,
      elevator: true,
      level: true,
      room: true
    };

    const isBuilding = (entity.tags.building && entity.tags.building !== 'no') ||
      (entity.tags['building:part'] && entity.tags['building:part'] !== 'no');

    const isIndoorArea = fromGeometry === 'area' && entity.tags.indoor && indoorAreaValues[entity.tags.indoor];

    let entityTags = Object.assign({}, entity.tags);  // shallow copy
    let extractTags = {};

    for (const key in entityTags) {
      if (entity.type === 'relation' && key === 'type') continue;
      if (keysToRetain.indexOf(key) !== -1) continue;
      if (isIndoorArea && key === 'indoor') continue;   // leave `indoor` tag on the area
      if (isBuilding && buildingKeysToRetain.test(key)) continue;

      // Copy the tag from the entity to the extracted point
      extractTags[key] = entityTags[key];

      // Keep addresses, level, and some other tags on both features
      if (keysToCopyAndRetain.indexOf(key) !== -1 || key.match(/^addr:.{1,}/)) continue;
      if (isIndoorArea && key === 'level') continue;

      // Remove the tag from the entity
      delete entityTags[key];
    }

    if (!isBuilding && !isIndoorArea && fromGeometry === 'area') {
      entityTags.area = 'yes';  // ensure that areas keep area geometry
    }

    const replacement = osmNode({ loc: extractedLoc, tags: extractTags });
    graph = graph.replace(replacement);
    _extractedNodeID = replacement.id;

    return graph.replace(entity.update({tags: entityTags}));
  }


  action.getExtractedNodeID = function() {
    return _extractedNodeID;
  };

  return action;
}
