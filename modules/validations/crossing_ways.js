import {
  Extent, geoLatToMeters, geoLonToMeters, geoSphericalClosestPoint,
  geoSphericalDistance, geoMetersToLat, geoMetersToLon, geomLineIntersection,
  vecAngle, vecLength
} from '@rapid-sdk/math';

import { actionAddMidpoint, actionChangeTags, actionMergeNodes, actionSplit, actionSyncCrossingTags } from '../actions/index.js';
import { osmNode } from '../osm/node.js';
import {
  osmFlowingWaterwayTagValues, osmPathHighwayTagValues, osmRailwayTrackTagValues,
  osmRoutableAerowayTags, osmRoutableHighwayTagValues
} from '../osm/tags.js';
import { ValidationIssue, ValidationFix } from '../core/lib/index.js';


export function validationCrossingWays(context) {
  const type = 'crossing_ways';
  const editor = context.systems.editor;
  const l10n = context.systems.l10n;

  // helpers
  function hasTag(v) {
    return v !== undefined && v !== 'no';
  }
  function taggedAsIndoor(tags) {
    return hasTag(tags.indoor) || hasTag(tags.level) || tags.highway === 'corridor';
  }

  // lookups
  const allowBridge = new Set(['aeroway', 'highway', 'railway', 'waterway']);
  const allowTunnel = new Set(['highway', 'railway', 'waterway']);
  const ignoreBuilding = new Set(['demolished', 'dismantled', 'proposed', 'razed']);
  const disallowFord = new Set([
    'motorway', 'motorway_link', 'trunk', 'trunk_link',
    'primary', 'primary_link', 'secondary', 'secondary_link'
  ]);
  const pathVals = new Set([
    'path', 'footway', 'cycleway', 'bridleway', 'pedestrian'
  ]);


  /**
   * isCrossingWay
   * Is the way tagged with something that would indicate that it is a crossing,
   *   for example `highway=footway`+`footway=crossing` ?
   * @param   {Object}   tags - tags to check
   * @return  {boolean}  `true` if the way is tagged as a crossing
   */
  function isCrossingWay(tags) {
    for (const k of pathVals) {
      if (tags.highway === k && tags[k] === 'crossing') {
        return true;
      }
    }
    return false;
  }


  /**
   * checkCrossingWays
   * This validation checks the given entity to see if it is involved in any problematic crossings
   * @param  {Entity}  entity - the Entity to validate
   * @param  {Graph}   graph  - the Graph we are validating
   * @return {Array}   Array of ValidationIssues detected
   */
  const validation = function checkCrossingWays(entity, graph) {
// note: using tree like this may be problematic - it may not reflect the graph we are validating.
// update: it's probably ok, as `tree.waySegments` will reset the tree to the graph are using..
// (although this will surely hurt performance)
    const tree = context.systems.editor.tree;
    const issues = [];

    for (const way of waysToCheck(entity, graph)) {
      for (const crossing of detectProblemCrossings(way, graph, tree)) {
        issues.push(createIssue(crossing, graph));
      }
    }
    return issues;
  };


  /**
   * waysToCheck
   * Returns the ways to check for problem crossings:
   *   If not worth checking, return empty set
   *   If entity is a way, return the entity
   *   If entity is a multipolygon relation, return its inner and outer member ways
   * @param  {Entity} entity
   * @param  {Graph}  graph
   * @return {Set}    Set of ways to check
   */
  function waysToCheck(entity, graph) {
    if (!getFeatureType(entity, graph)) {   // no type - not worth checking
      return new Set();

    } else if (entity.type === 'way') {
      return new Set([entity]);

    } else if (entity.type === 'relation' && entity.tags.type === 'multipolygon') {
      const result = new Set();
      for (const member of entity.members) {
        // also include no role, these are treated as 'outer'
        if (member.type === 'way' && (!member.role || member.role === 'outer' || member.role === 'inner')) {
          const child = graph.hasEntity(member.id);
          if (child) {
            result.add(child);  // useful: Set prevents duplicates
          }
        }
      }
      return result;

    } else {
      return new Set();  // nothing to check
    }
  }


  /**
   * getTaggedEntityForWay
   * Returns the way or its parent relation, whichever has a useful feature type
   * @param  {Entity}  way - the way involved in the crossing
   * @param  {Graph}   graph  - the Graph we are validating
   * @return {Entity}
   */
  function getTaggedEntityForWay(way, graph) {
    if (getFeatureType(way, graph) === null) {
      // if the way doesn't match a feature type, check its parent relations
      const parentRels = graph.parentRelations(way);
      for (const rel of parentRels) {
        if (getFeatureType(rel, graph) !== null) {
          return rel;
        }
      }
    }
    return way;
  }


  /**
   * getFeatureType
   * This determines what type of feature the given entity is
   * @param  {Entity} entity
   * @param  {Graph}  graph
   * @return {string|null} One of 'aeroway', 'building', 'highway', 'railway', 'waterway', or null if none of those
   */
  function getFeatureType(entity, graph) {
    const geometry = entity.geometry(graph);
    if (geometry !== 'line' && geometry !== 'area') return null;

    const tags = entity.tags;

    if (osmRoutableAerowayTags[tags.aeroway]) return 'aeroway';
    if (hasTag(tags.building) && !ignoreBuilding.has(tags.building)) return 'building';
    if (hasTag(tags.highway) && osmRoutableHighwayTagValues[tags.highway]) return 'highway';

    // don't check railway or waterway areas
    if (geometry !== 'line') return null;

    if (hasTag(tags.railway) && osmRailwayTrackTagValues[tags.railway]) return 'railway';
    if (hasTag(tags.waterway) && osmFlowingWaterwayTagValues[tags.waterway]) return 'waterway';

    return null;
  }


  /**
   * isLegitCrossing
   * This determines whether a crossing between the given entities is acceptable (according to OSM tagging conventions)
   * @param  {Object} tags1 - entity1 tags
   * @param  {string} type1 - entity1 type, 'aeroway', 'building', 'highway', 'railway', or 'waterway'
   * @param  {Object} tags2 - entity2 tags
   * @param  {string} type2 - entity2 type, 'aeroway', 'building', 'highway', 'railway', or 'waterway'
   * @return {boolean} `true` if the crossing is fine (i.e. should raise no issue)
   */
  function isLegitCrossing(tags1, type1, tags2, type2) {
    // assume 0 by default
    const level1 = tags1.level || '0';
    const level2 = tags2.level || '0';

    // Allow indoor features to cross if they're indoor on different levels
    if (taggedAsIndoor(tags1) && taggedAsIndoor(tags2) && level1 !== level2) return true;

    // assume 0 by default; don't use way.layer() since we account for structures here
    const layer1 = tags1.layer || '0';
    const layer2 = tags2.layer || '0';

    // Allow highways to cross if they're on different layers (regardless of bridge/tunnel tags)
    if ((type1 === 'highway' && type2 === 'highway') && layer1 !== layer2) return true;

    // Allow bridges to cross on different layers
    const bridge1 = allowBridge.has(type1) && hasTag(tags1.bridge);
    const bridge2 = allowBridge.has(type2) && hasTag(tags2.bridge);
    if ((bridge1 && !bridge2) || (!bridge1 && bridge2)) return true;  // one has a bridge, one doesnt
    if (bridge1 && bridge2 && layer1 !== layer2) return true;         // both have bridges on different layers

    // Allow tunnels to cross on different layers
    const tunnel1 = allowTunnel.has(type1) && hasTag(tags1.tunnel);
    const tunnel2 = allowTunnel.has(type2) && hasTag(tags2.tunnel);
    if ((tunnel1 && !tunnel2) || (!tunnel1 && tunnel2)) return true;  // one has a tunnel, one doesnt
    if (tunnel1 && tunnel2 && layer1 !== layer2) return true;         // both have tunnels on different layers

    // Allow waterways to cross highways tagged with 'pier'
    if (type1 === 'waterway' && type2 === 'highway' && tags2.man_made === 'pier') return true;
    if (type2 === 'waterway' && type1 === 'highway' && tags1.man_made === 'pier') return true;

    // Allow anything to cross buildings if on different layers
    if ((type1 === 'building' || type2 === 'building') && layer1 !== layer2) return true;

    return false;
  }


  /**
   * getConnectionTags
   * This determines whether a potential crossing between the given entities is allowed,
   * and if so, what tags should be suggested on the crossing node.
   * @param  {Entity} entity1
   * @param  {Entity} entity2
   * @param  {Graph}  graph
   * @return {Object|null} Suggested tags for the connecting node, or `null` if the entities should not be connected
   */
  function getConnectionTags(entity1, entity2, graph) {
    const type1 = getFeatureType(entity1, graph);
    const type2 = getFeatureType(entity2, graph);
    const crossingType = [type1, type2].sort().join('-');  // a string like 'highway-highway'

    const geometry1 = entity1.geometry(graph);
    const geometry2 = entity2.geometry(graph);
    const bothLines = geometry1 === 'line' && geometry2 === 'line';

    if (crossingType === 'aeroway-aeroway') {
      return {};  // allowed, no tag suggestion

    } else if (crossingType === 'aeroway-highway') {
      const isService = entity1.tags.highway === 'service' || entity2.tags.highway === 'service';
      const isPath = osmPathHighwayTagValues[entity1.tags.highway] || osmPathHighwayTagValues[entity2.tags.highway];
      // Only significant roads get the `aeroway=aircraft_crossing` tag
      return (isService || isPath) ? {} : { aeroway: 'aircraft_crossing' };

    } else if (crossingType === 'aeroway-railway') {
      return { aeroway: 'aircraft_crossing', railway: 'level_crossing' };

    } else if (crossingType === 'aeroway-waterway') {
      return null;  // not allowed

    } else if (crossingType === 'highway-highway') {
      const entity1IsPath = osmPathHighwayTagValues[entity1.tags.highway];
      const entity2IsPath = osmPathHighwayTagValues[entity2.tags.highway];

      // One feature is a path but not both
      if ((entity1IsPath || entity2IsPath) && entity1IsPath !== entity2IsPath) {
        const road = entity1IsPath ? entity2 : entity1;

        // No crossing suggestion in some situations
        if (!bothLines || road.tags.highway === 'track') {
          return {};  // allowed, no tag suggestion
        }

        // Suggest joining them with a `highway=crossing` node.
        // We'll run the `actionsyncCrossingTags` afterwards to make sure the tags are synced.
        return { highway: 'crossing' };

      } else {      // road-road or path-path
        return {};  // allowed, no tag suggestion
      }

    } else if (crossingType === 'highway-railway') {
      if (!bothLines) {
        return {};  // allowed, no tag suggestion
      }

      const isTram = entity1.tags.railway === 'tram' || entity2.tags.railway === 'tram';
      const isPath = osmPathHighwayTagValues[entity1.tags.highway] || osmPathHighwayTagValues[entity2.tags.highway];

      if (isPath) {
        if (isTram) {
          return { railway: 'tram_crossing' };  // path-tram connections use this tag
        } else {
          return { railway: 'crossing' };       // other path-rail connections use this tag
        }
      } else {
        if (isTram) {
          return { railway: 'tram_level_crossing' };  // road-tram connections use this tag
        } else {
          return { railway: 'level_crossing' };       // other road-rail connections use this tag
        }
      }

    } else if (crossingType === 'highway-waterway') {
      // Do not suggest fords on structures
      if (hasTag(entity1.tags.tunnel) && hasTag(entity2.tags.tunnel)) return null;
      if (hasTag(entity1.tags.bridge) && hasTag(entity2.tags.bridge)) return null;

      // Do not suggest fords on major highways (secondry and higher)
      if (disallowFord.has(entity1.tags.highway) || disallowFord.has(entity2.tags.highway)) {
        return null;
      }
      return bothLines ? { ford: 'yes' } : {};

    } else if (crossingType === 'railway-railway') {
      return {};  // allowed, no tag suggestion

    } else if (crossingType === 'railway-waterway') {
      return null;  // not allowed

    } else if (crossingType === 'waterway-waterway') {
      return {};  // allowed, no tag suggestion
    }

    return null;
  }


  /**
   * detectProblemCrossings
   * This determines where lines cross
   * @param  {Entity} way1
   * @param  {Graph}  graph
   * @param  {Tree}   tree
   * @return {Array}  Array of Objects containing the crossing details
   */
  function detectProblemCrossings(way1, graph, tree) {
    if (way1.type !== 'way') return [];

    const entity1 = getTaggedEntityForWay(way1, graph);
    const tags1 = entity1.tags;
    const type1 = getFeatureType(entity1, graph);
    if (type1 === null) return [];

    const seenWayIDs = new Set();
    const crossings = [];
    const way1Nodes = graph.childNodes(way1);

    for (let i = 0; i < way1Nodes.length - 1; i++) {
      const n1 = way1Nodes[i];
      const n2 = way1Nodes[i + 1];
      const extent = new Extent(
        [ Math.min(n1.loc[0], n2.loc[0]), Math.min(n1.loc[1], n2.loc[1]) ],
        [ Math.max(n1.loc[0], n2.loc[0]), Math.max(n1.loc[1], n2.loc[1]) ]
      );

      // Optimize by only checking overlapping segments, not every segment of overlapping ways
      const segments = tree.waySegments(extent, graph);

      for (const segment of segments) {
        // Don't check for self-intersection in this validation
        if (segment.wayId === way1.id) continue;

        // Skip if this way was already checked and only one issue is needed
        if (seenWayIDs.has(segment.wayId)) continue;

        const way2 = graph.hasEntity(segment.wayId);
        if (!way2) continue;

        const entity2 = getTaggedEntityForWay(way2, graph);
        const type2 = getFeatureType(entity2, graph);
        const tags2 = entity2.tags;
        if (type2 === null || isLegitCrossing(tags1, type1, tags2, type2)) continue;

        const nAId = segment.nodes[0];
        const nBId = segment.nodes[1];

        // n1 or n2 is a connection node; skip
        if (nAId === n1.id || nAId === n2.id || nBId === n1.id || nBId === n2.id) continue;

        const nA = graph.hasEntity(nAId);
        const nB = graph.hasEntity(nBId);
        if (!nA || !nB) continue;

        const line1 = [n1.loc, n2.loc];
        const line2 = [nA.loc, nB.loc];
        const point = geomLineIntersection(line1, line2);

        if (point) {
          crossings.push({
            wayInfos: [
              {
                way: way1,
                featureType: type1,
                edge: [n1.id, n2.id]
              }, {
                way: way2,
                featureType: type2,
                edge: [nA.id, nB.id]
              }
            ],
            crossPoint: point
          });

          // create only one issue for building crossings
          const oneOnly = (type1 === 'building' || type2 === 'building');
          if (oneOnly) {
            seenWayIDs.add(way2.id);
            break;
          }
        }
      }
    }

    return crossings;
  }


  /**
   * createIssue
   * Returns a ValidationIssue for the given crossing
   * @param  {Object}           crossing - Object containing crossing data
   * @param  {Graph}            graph
   * @return {ValidationIssue}  The issue
   */
  function createIssue(crossing, graph) {
    // use the entities with the tags that define the feature type
    crossing.wayInfos.sort((way1Info, way2Info) => {
      const type1 = way1Info.featureType;
      const type2 = way2Info.featureType;
      if (type1 === type2) {
        return l10n.displayLabel(way1Info.way, graph) > l10n.displayLabel(way2Info.way, graph);
      } else if (type1 === 'waterway') {
        return true;
      } else if (type2 === 'waterway') {
        return false;
      }
      return type1 < type2;
    });

    const entities = crossing.wayInfos.map(wayInfo => getTaggedEntityForWay(wayInfo.way, graph));
    const [entity1, entity2] = entities;

    const tags1 = entity1.tags;
    const tags2 = entity2.tags;
    const type1 = crossing.wayInfos[0].featureType;
    const type2 = crossing.wayInfos[1].featureType;
    const edges = [crossing.wayInfos[0].edge, crossing.wayInfos[1].edge];
    const featureTypes = [type1, type2];

    const connectionTags = getConnectionTags(entity1, entity2, graph);

    const isCrossingIndoors = taggedAsIndoor(tags1) && taggedAsIndoor(tags2);

    const bridge1 = allowBridge.has(type1) && hasTag(tags1.bridge);
    const bridge2 = allowBridge.has(type2) && hasTag(tags2.bridge);
    const isCrossingBridges = bridge1 && bridge2;

    const tunnel1 = allowTunnel.has(type1) && hasTag(tags1.tunnel);
    const tunnel2 = allowTunnel.has(type2) && hasTag(tags2.tunnel);
    const isCrossingTunnels = tunnel1 && tunnel2;

    const isMinorCrossing = (tags1.highway === 'service' || tags2.highway === 'service') &&
      connectionTags?.highway === 'crossing';

    // If we are trying to create a crossing node, and one of the crossing ways is already a tagged crossing,
    // sync that parent way's tags to the new crossing node that we are creating - Rapid#1271
    let crossingWayID = null;
    if (connectionTags?.highway === 'crossing') {
      if (isCrossingWay(tags1)) {
        crossingWayID = entity1.id;
      } else if (isCrossingWay(tags2)) {
        crossingWayID = entity2.id;
      }
    }

    const subtype = [type1, type2].sort().join('-');

    let crossingTypeID = subtype;

    if (isCrossingIndoors) {
      crossingTypeID = 'indoor-indoor';
    } else if (isCrossingTunnels) {
      crossingTypeID = 'tunnel-tunnel';
    } else if (isCrossingBridges) {
      crossingTypeID = 'bridge-bridge';
    }
    if (connectionTags && (isCrossingIndoors || isCrossingTunnels || isCrossingBridges)) {
      crossingTypeID += '_connectable';
    }

    // Differentiate based on the loc rounded to 4 digits, since two ways can cross multiple times.
    const uniqueID = '' + crossing.crossPoint[0].toFixed(4) + ',' + crossing.crossPoint[1].toFixed(4);

    // Support autofix for some kinds of connections
    let autoArgs = null;
    if (isMinorCrossing) {
      autoArgs = getConnectWaysAction(crossing.crossPoint, edges, null, {});  // untagged connection
    } else if (connectionTags && !connectionTags.ford) {
      autoArgs = getConnectWaysAction(crossing.crossPoint, edges, crossingWayID, connectionTags); // suggested tagged connection
    }

    return new ValidationIssue(context, {
      type: type,
      subtype: subtype,
      severity: 'warning',
      message: function() {
        const graph = editor.staging.graph;
        const entity1 = graph.hasEntity(this.entityIds[0]);
        const entity2 = graph.hasEntity(this.entityIds[1]);
        return (entity1 && entity2) ? l10n.t('issues.crossing_ways.message', {
          feature: l10n.displayLabel(entity1, graph),
          feature2: l10n.displayLabel(entity2, graph)
        }) : '';
      },
      reference: showReference,
      entityIds: [ entity1.id, entity2.id ],
      data: {
        edges: edges,
        featureTypes: featureTypes,
        crossingWayID: crossingWayID,
        connectionTags: connectionTags
      },
      hash: uniqueID,
      loc: crossing.crossPoint,
      autoArgs: autoArgs,
      dynamicFixes: function() {
        const graph = editor.staging.graph;
        const selectedIDs = context.selectedIDs();
        if (context.mode?.id !== 'select-osm' || selectedIDs.length !== 1) return [];

        const selectedIndex = this.entityIds[0] === selectedIDs[0] ? 0 : 1;
        const selectedType = this.data.featureTypes[selectedIndex];
        const otherType = this.data.featureTypes[selectedIndex === 0 ? 1 : 0];
        const fixes = [];

        // For crossings between sidewalk and service road, offer an untagged connection fix - iD#9650, iD#8463
        if (isMinorCrossing) {
          fixes.push(makeConnectWaysFix({}));
        }

        if (connectionTags) {
          fixes.push(makeConnectWaysFix(connectionTags));
        }

        if (isCrossingIndoors) {
          fixes.push(new ValidationFix({
            icon: 'rapid-icon-layers',
            title: l10n.t('issues.fix.use_different_levels.title')
          }));

        } else if (isCrossingTunnels || isCrossingBridges || type1 === 'building' || type2 === 'building')  {
          fixes.push(makeChangeLayerFix('higher'));
          fixes.push(makeChangeLayerFix('lower'));

        // can only add bridge/tunnel if both features are lines
        } else if (graph.geometry(this.entityIds[0]) === 'line' &&
          graph.geometry(this.entityIds[1]) === 'line') {

          // don't recommend adding bridges to waterways since they're uncommon
          if (allowBridge.has(selectedType) && selectedType !== 'waterway') {
            fixes.push(makeAddBridgeOrTunnelFix('add_a_bridge', 'temaki-bridge', 'bridge'));
          }

          // don't recommend adding tunnels under waterways since they're uncommon
          const skipTunnelFix = otherType === 'waterway' && selectedType !== 'waterway';
          if (allowTunnel.has(selectedType) && !skipTunnelFix) {
            fixes.push(makeAddBridgeOrTunnelFix('add_a_tunnel', 'temaki-tunnel', 'tunnel'));
          }
        }

        // repositioning the features is always an option
        fixes.push(new ValidationFix({
          icon: 'rapid-operation-move',
          title: l10n.t('issues.fix.reposition_features.title')
        }));

        return fixes;
      }
    });

    function showReference(selection) {
      selection.selectAll('.issue-reference')
        .data([0])
        .enter()
        .append('div')
        .attr('class', 'issue-reference')
        .text(l10n.t(`issues.crossing_ways.${crossingTypeID}.reference`));
    }
  }


  /**
   * makeAddBridgeOrTunnelFix
   * @param  {string}  titleID
   * @param  {string}  iconName
   * @param  {string}  bridgeOrTunnel
   * @return {ValidationFix}
   */
  function makeAddBridgeOrTunnelFix(titleID, iconName, bridgeOrTunnel) {
    return new ValidationFix({
      icon: iconName,
      title: l10n.t(`issues.fix.${titleID}.title`),
      onClick: function() {
        if (context.mode?.id !== 'select-osm') return;

        const selectedIDs = context.selectedIDs();
        if (selectedIDs.length !== 1) return;

        const selectedWayID = selectedIDs[0];
        const graph = editor.staging.graph;
        if (!graph.hasEntity(selectedWayID)) return;

        const resultWayIDs = [selectedWayID];

        let edge, crossedEdge, crossedWayID;
        if (this.issue.entityIds[0] === selectedWayID) {
          edge = this.issue.data.edges[0];
          crossedEdge = this.issue.data.edges[1];
          crossedWayID = this.issue.entityIds[1];
        } else {
          edge = this.issue.data.edges[1];
          crossedEdge = this.issue.data.edges[0];
          crossedWayID = this.issue.entityIds[0];
        }

        const crossingLoc = this.issue.loc;

        const viewport = context.viewport;

        const actionAddStructure = (graph) => {
          const edgeNodes = [ graph.entity(edge[0]), graph.entity(edge[1]) ];
          const crossedWay = graph.hasEntity(crossedWayID);

          // use the explicit width of the crossed feature as the structure length, if available
          let structLengthMeters = crossedWay && crossedWay.tags.width && parseFloat(crossedWay.tags.width);
          if (!structLengthMeters) {
            // if no explicit width is set, approximate the width based on the tags
            structLengthMeters = crossedWay && crossedWay.impliedLineWidthMeters();
          }
          if (structLengthMeters) {
            if (getFeatureType(crossedWay, graph) === 'railway') {
              // bridges over railways are generally much longer than the rail bed itself, compensate
              structLengthMeters *= 2;
            }
          } else {
            // should ideally never land here since all rail/water/road tags should have an implied width
            structLengthMeters = 8;
          }

          const a1 = vecAngle(viewport.project(edgeNodes[0].loc), viewport.project(edgeNodes[1].loc)) + Math.PI;
          const a2 = vecAngle(viewport.project(graph.entity(crossedEdge[0]).loc), viewport.project(graph.entity(crossedEdge[1]).loc)) + Math.PI;
          let crossingAngle = Math.max(a1, a2) - Math.min(a1, a2);
          if (crossingAngle > Math.PI) crossingAngle -= Math.PI;
          // lengthen the structure to account for the angle of the crossing
          structLengthMeters = ((structLengthMeters / 2) / Math.sin(crossingAngle)) * 2;

          // add padding since the structure must extend past the edges of the crossed feature
          structLengthMeters += 4;

          // clamp the length to a reasonable range
          structLengthMeters = Math.min(Math.max(structLengthMeters, 4), 50);

          function geomToProj(geoPoint) {
            return [
              geoLonToMeters(geoPoint[0], geoPoint[1]),
              geoLatToMeters(geoPoint[1])
            ];
          }
          function projToGeom(projPoint) {
            const lat = geoMetersToLat(projPoint[1]);
            return [
              geoMetersToLon(projPoint[0], lat),
              lat
            ];
          }

          const projEdgeNode1 = geomToProj(edgeNodes[0].loc);
          const projEdgeNode2 = geomToProj(edgeNodes[1].loc);
          const projectedAngle = vecAngle(projEdgeNode1, projEdgeNode2);

          const projectedCrossingLoc = geomToProj(crossingLoc);
          const linearToSphericalMetersRatio = vecLength(projEdgeNode1, projEdgeNode2) /
              geoSphericalDistance(edgeNodes[0].loc, edgeNodes[1].loc);

          function locSphericalDistanceFromCrossingLoc(angle, distanceMeters) {
            const lengthSphericalMeters = distanceMeters * linearToSphericalMetersRatio;
            return projToGeom([
              projectedCrossingLoc[0] + Math.cos(angle) * lengthSphericalMeters,
              projectedCrossingLoc[1] + Math.sin(angle) * lengthSphericalMeters
            ]);
          }

          const endpointLocGetter1 = function(lengthMeters) {
            return locSphericalDistanceFromCrossingLoc(projectedAngle, lengthMeters);
          };
          const endpointLocGetter2 = function(lengthMeters) {
            return locSphericalDistanceFromCrossingLoc(projectedAngle + Math.PI, lengthMeters);
          };

          // avoid creating very short edges from splitting too close to another node
          const minEdgeLengthMeters = 0.55;

          // decide where to bound the structure along the way, splitting as necessary
          function determineEndpoint(edge, endNode, locGetter) {
            let newNode;
            const idealLengthMeters = structLengthMeters / 2;

            // distance between the crossing location and the end of the edge,
            // the maximum length of this side of the structure
            const crossingToEdgeEndDistance = geoSphericalDistance(crossingLoc, endNode.loc);
            if (crossingToEdgeEndDistance - idealLengthMeters > minEdgeLengthMeters) {
              // the edge is long enough to insert a new node
              // the loc that would result in the full expected length
              const idealNodeLoc = locGetter(idealLengthMeters);
              newNode = osmNode();
              graph = actionAddMidpoint({ loc: idealNodeLoc, edge: edge }, newNode)(graph);

            } else {
              let edgeCount = 0;
              endNode.parentIntersectionWays(graph).forEach(function(way) {
                way.nodes.forEach(function(nodeID) {
                  if (nodeID === endNode.id) {
                    if ((endNode.id === way.first() && endNode.id !== way.last()) ||
                      (endNode.id === way.last() && endNode.id !== way.first())) {
                      edgeCount += 1;
                    } else {
                      edgeCount += 2;
                    }
                  }
                });
              });

              if (edgeCount >= 3) {
                // the end node is a junction, try to leave a segment
                // between it and the structure - iD#7202

                const insetLength = crossingToEdgeEndDistance - minEdgeLengthMeters;
                if (insetLength > minEdgeLengthMeters) {
                  const insetNodeLoc = locGetter(insetLength);
                  newNode = osmNode();
                  graph = actionAddMidpoint({ loc: insetNodeLoc, edge: edge }, newNode)(graph);
                }
              }
            }

            // if the edge is too short to subdivide as desired, then
            // just bound the structure at the existing end node
            if (!newNode) newNode = endNode;

            const splitAction = actionSplit([newNode.id])
              .limitWays(resultWayIDs); // only split selected or created ways

            // do the split
            graph = splitAction(graph);
            if (splitAction.getCreatedWayIDs().length) {
              resultWayIDs.push(splitAction.getCreatedWayIDs()[0]);
            }

            return newNode;
          }

          const structEndNode1 = determineEndpoint(edge, edgeNodes[1], endpointLocGetter1);
          const structEndNode2 = determineEndpoint([edgeNodes[0].id, structEndNode1.id], edgeNodes[0], endpointLocGetter2);

          const structureWay = resultWayIDs
            .map(id => graph.entity(id))
            .find(way => way.nodes.includes(structEndNode1.id) && way.nodes.includes(structEndNode2.id));

          const tags = Object.assign({}, structureWay.tags); // copy tags
          if (bridgeOrTunnel === 'bridge') {
            tags.bridge = 'yes';
            tags.layer = '1';
          } else {
            const type = getFeatureType(structureWay, graph);   // use `tunnel=culvert` for waterways by default
            tags.tunnel = (type === 'waterway') ? 'culvert' : 'yes';
            tags.layer = '-1';
          }
          // apply the structure tags to the way
          graph = actionChangeTags(structureWay.id, tags)(graph);
          return graph;
        };

        editor.perform(actionAddStructure);
        editor.commit({
          annotation: l10n.t(`issues.fix.${titleID}.annotation`),
          selectedIDs: [selectedWayID]
        });
        context.enter('select-osm', { selection: { osm: resultWayIDs }} );
      }
    });
  }


  /**
   * getConnectWaysAction
   * @param  {Array}   loc             - [lon,lat] location where the connection should be
   * @param  {Array}   edges           - edges that will participate in the connection
   * @param  {string?} crossingWayID   - optionally, run `actionsyncCrossingTags` on this wayID
   * @param  {Object}  tags            - tags to assign to the new connection node
   * @return {Action}  An Action function that connects the ways
   */
  function getConnectWaysAction(loc, edges, crossingWayID, tags) {
    const actionConnectCrossingWays = (graph) => {

      // Create a new candidate junction node which will be inserted at the connection location..
      const newNode = osmNode({ loc: loc, tags: tags });
      graph = graph.replace(newNode);

      const mergeNodeIDs = [newNode.id];
      const mergeThresholdInMeters = 0.75;

      // Insert the new node along the edges (or reuse one already there)..
      for (const edge of edges) {
        const n0 = graph.hasEntity(edge[0]);
        const n1 = graph.hasEntity(edge[1]);
        if (!n0 || !n1) continue;  // graph has changed and these nodes are no longer there?

        // Look for a suitable existing node nearby to reuse..
        let canReuse = false;
        const edgeNodes = [n0, n1];
        const closest = geoSphericalClosestPoint([n0.loc, n1.loc], loc);
        if (closest && closest.distance < mergeThresholdInMeters) {
          const closeNode = edgeNodes[closest.index];
          // Reuse the close node if it has no interesting tags or if it is already a crossing - iD#8326
          if (!closeNode.hasInterestingTags() || closeNode.isCrossing()) {
            canReuse = true;
            mergeNodeIDs.push(closeNode.id);
          }
        }

        if (!canReuse) {
          graph = actionAddMidpoint({ loc: loc, edge: edge }, newNode)(graph);  // Insert the new node
        }
      }

      // If we're reusing nearby nodes, merge them with the new node.
      if (mergeNodeIDs.length > 1) {
        graph = actionMergeNodes(mergeNodeIDs, loc)(graph);
      }

      // If the parent way is tagged as a crossing, sync its crossing tags to the node we just added.
      if (crossingWayID) {
        graph = actionSyncCrossingTags(crossingWayID)(graph);
      }

      return graph;
    };

    return [actionConnectCrossingWays, l10n.t('issues.fix.connect_crossing_features.annotation')];
  }


  /**
   * makeConnectWaysFix
   * @param  {Object}  connectionTags
   * @return {ValidationFix}
   */
  function makeConnectWaysFix(connectionTags) {
    let titleID = 'connect_features';
    let iconID = 'rapid-icon-connect';

    if (connectionTags.ford) {
      titleID = 'connect_using_ford';
    } else if (connectionTags.highway === 'crossing') {
      titleID = 'connect_using_crossing';
      iconID = 'temaki-pedestrian';
    }

    return new ValidationFix({
      icon: iconID,
      title: l10n.t(`issues.fix.${titleID}.title`),
      onClick: function() {
        const loc = this.issue.loc;
        const edges = this.issue.data.edges;
        const crossingWayID = this.issue.data.crossingWayID;
        const result = getConnectWaysAction(loc, edges, crossingWayID, connectionTags);

        // result contains [function, annotation]
        editor.perform(result[0]);
        editor.commit({
          annotation: result[1],
          selectedIDs: this.issue.entityIds
        });
      }
    });
  }


  /**
   * makeChangeLayerFix
   * @param  {string}  higherOrLower
   * @return {ValidationFix}
   */
  function makeChangeLayerFix(higherOrLower) {
    return new ValidationFix({
      icon: 'rapid-icon-' + (higherOrLower === 'higher' ? 'up' : 'down'),
      title: l10n.t(`issues.fix.tag_this_as_${higherOrLower}.title`),
      onClick: function() {
        if (context.mode?.id !== 'select-osm') return;

        const selectedIDs = context.selectedIDs();
        if (selectedIDs.length !== 1) return;

        const selectedID = selectedIDs[0];
        if (!this.issue.entityIds.some(entityID => entityID === selectedID)) return;

        const graph = editor.staging.graph;
        const entity = graph.hasEntity(selectedID);
        if (!entity) return;

        const tags = Object.assign({}, entity.tags);   // shallow copy
        let layer = tags.layer && Number(tags.layer);
        if (layer && !isNaN(layer)) {
          if (higherOrLower === 'higher') {
            layer += 1;
          } else {
            layer -= 1;
          }
        } else {
          if (higherOrLower === 'higher') {
            layer = 1;
          } else {
            layer = -1;
          }
        }
        tags.layer = layer.toString();
        editor.perform(actionChangeTags(entity.id, tags));
        editor.commit({
          annotation: l10n.t('operations.change_tags.annotation'),
          selectedIDs: [selectedID]
        });
      }
    });
  }

  validation.type = type;

  return validation;
}
