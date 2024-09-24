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


export function validationKerbNodes(context) {
  const type = 'kerb_nodes';
  const editor = context.systems.editor;
  const l10n = context.systems.l10n;

  // helpers
  function hasTag(v) {
    return v !== undefined && v !== 'no';
  }
  function taggedAsIndoor(tags) {
    return hasTag(tags.indoor) || hasTag(tags.level) || tags.highway === 'corridor';
  }

  function isKerbNode(entity) {
    return entity.type === 'node' && entity.tags?.barrier === 'kerb';
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
   * checkKerbNodeCandidacy
   * This validation checks the given entity to see if it is a candidate to have kerb nodes added to it
   * @param  {Entity}  entity - the Entity to validate
   * @param  {Graph}   graph  - the Graph we are validating
   * @return {Array}   Array of ValidationIssues detected
   */
  const validation = function checkKerbNodeCandidacy(entity, graph) {
    if (entity.type !== 'way' || entity.isDegenerate()) return [];
    return detectKerbCandidates(entity, graph);
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

  // TODO: This method is one of the first things that the validator runs- it picks types of ways that need validation.
  // There's a pretty significant logical refinement we can make here that will simplify all the downstream code. Can you think of it?
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

  // TODO: a 'legit' crossing in this case means 'one that does not need validating'. So, true = ignore, false = throw a validation.
  // Depending on the refinement you made to the above 'getFeatureType' method, there's probably quite a bit we can prune out of here.
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

    // Allow highways & footways to cross if they're on different layers (regardless of bridge/tunnel tags)
    if ((type1 === 'highway' && type2 === 'footway') && layer1 !== layer2) return true;

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
   * detectKerbCandidates
   * This determines where any crossing ways exist but do not have at least 1 kerb node.
   * @param  {Entity} way - the candidate way we're evaluating for kerb nodes
   * @param  {Graph}  graph
   * @return {Array}  Array of Objects containing the crossing details
   */
  function detectKerbCandidates(way, graph) {
    let issues = [];
    const wayID = way.id;

    // Discount any way that already has kerbs in it.
    // TODO: Make further refinements to this logic, i.e. only consider ways that intersect with routable (traffic) roads
    const hasKerbs = hasKerbNodes(way);
    if (!hasKerbs) {
      issues.push(new ValidationIssue(context, {
        type,
        subtype: 'fixme_tag',
        severity: 'warning',
        message: function () {
          const graph = editor.staging.graph;
          const way = graph.hasEntity(this.entityIds[0]);

          return l10n.t('issues.kerb_nodes.message', {
            feature: l10n.displayLabel(way, graph),
          });
          return l10n.tHtml('issues.ambiguous_crossing_tags.incomplete_message');
        },
        reference: showReference,
        entityIds: [
          wayID,
        ],
      }));
    }

    // Choices being offered..
    const choices = new Map();  // Map(string -> { setTags })

    // Details about the entities involved in this issue.
    const updates = new Map();  // Map(entityID -> { preset name, tagDiff })


    function showReference(selection) {
      selection.selectAll('.issue-reference')
        .data([0])
        .enter()
        .append('div')
        .attr('class', 'issue-reference')
        .html(l10n.tHtml('issues.kerb_nodes.reference'));
    }

    /**
     * @param {*} way
     * @returns true if the way has kerb information in it already (either it is marked )
     */
   function hasKerbNodes(way) {
      way.nodes.forEach((nodeID, index) => {
        const node = graph.entity(nodeID);
        if (isKerbNode(node)) return true;
      });
      return false;
    }

  return issues;
  }

  /**
   * getKerbNodesAction
   * @param  {string} crossingWayID   - the crossing way ID to add kerb nodes to
   * @param  {Object}  tags            - tags to assign to the new kerb nodes
   * @return {Action}  An Action function that connects the ways
   */
  function getAddKerbNodesAction(crossingWayID, tags) {

  }


  /**
   * makeKerbNodesFix
   * @param  {Object}  connectionTags
   * @return {ValidationFix}
   */
  function makeKerbNodesFix(connectionTags) {
    let titleID = 'add_kerb_nodes';
    // TODO: Pick a better icon for this action. 'temaki-pedestrian', perhaps?
    let iconID = 'rapid-icon-connect';
    iconID = 'temaki-pedestrian';

    return new ValidationFix({
      icon: iconID,
      title: l10n.t(`issues.fix.${titleID}.title`),
      onClick: function() {
        const crossingWayID = this.issue.data.crossingWayID;
        const result = getAddKerbNodesAction(crossingWayID, connectionTags);

        // result contains [function, annotation]
        editor.perform(result[0]);
        editor.commit({
          annotation: result[1],
          selectedIDs: this.issue.entityIds
        });
      }
    });
  }

  validation.type = type;

  return validation;
}
