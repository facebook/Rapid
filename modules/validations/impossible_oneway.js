import { Extent } from '@rapid-sdk/math';

import { actionReverse } from '../actions/reverse.js';
import { osmFlowingWaterwayTagValues, osmRoutableHighwayTagValues } from '../osm/tags.js';
import { ValidationIssue, ValidationFix } from '../core/lib/index.js';


export function validationImpossibleOneway(context) {
  const type = 'impossible_oneway';
  const editor = context.systems.editor;
  const l10n = context.systems.l10n;

  let validation = function checkImpossibleOneway(entity, graph) {
    if (entity.type !== 'way' || entity.geometry(graph) !== 'line') return [];
    if (entity.isClosed()) return [];
    if (!typeForWay(entity)) return [];
    if (!entity.isOneWay()) return [];
    if (
      entity.tags.oneway === 'alternating' ||
      entity.tags.oneway === 'reversible' ||
      entity.tags.intermittent === 'yes'      // Ignore intermittent waterways - Rapid#1018
    ) return [];

    const firstIssues = issuesForNode(entity, entity.first());
    const lastIssues = issuesForNode(entity, entity.last());
    return firstIssues.concat(lastIssues);


    /**
     * typeForWay
     * Return whether the way is a 'highway' or 'waterway'.
     * @param   {osmWay}   way
     * @return  {string?}  'highway' or 'waterway'
     */
    function typeForWay(way) {
      if (way.geometry(graph) !== 'line') return null;
      if (osmRoutableHighwayTagValues[way.tags.highway]) return 'highway';
      if (osmFlowingWaterwayTagValues[way.tags.waterway]) return 'waterway';
      return null;
    }


    /**
     * nodeOccursMoreThanOnce
     * We skip checks on nodes that occur more than once.
     * This can happen if a way starts/ends in its middle, for example:
     *
     * A --> B --> +
     *       |     |
     *       + <-- +
     *
     * @param   {osmWay}   way
     * @param   {string}   nodeID
     * @return  {boolean}  `true` if the node occurs more than once
     */
    function nodeOccursMoreThanOnce(way, nodeID) {
      return (way.nodes.indexOf(nodeID) !== way.nodes.lastIndexOf(nodeID));
    }


    /**
     * isNodeTaggedAsConnected
     * Returns `true` if the node is connected (aka reachable/escapable)
     * based on its tagging or what type of features it is attached to.
     * @param   {osmWay}   way
     * @param   {osmNode}  node
     * @param   {boolean}  `true` if this node occurs at the head of the way.
     * @return  {boolean}  `true` if this node is considered connected.
     */
    function isNodeTaggedAsConnected(way, node, isHead) {
      const wayType = typeForWay(way);

      if (wayType === 'highway') {
        // entrances are considered connected
        if (node.tags.entrance && node.tags.entrance !== 'no') return true;
        if (node.tags.amenity === 'parking_entrance') return true;

      } else if (wayType === 'waterway') {
        if (isHead) {
          // multiple waterways may start at the same spring
          if (node.tags.natural === 'spring') return true;
        } else {
          // multiple waterways may end at the same drain
          if (node.tags.manhole === 'drain') return true;
        }
      }

      return graph.parentWays(node).some(parentWay => {
        if (parentWay.id === way.id) return false;

        if (wayType === 'highway') {
          // allow connections to highway areas
          if (parentWay.geometry(graph) === 'area' && osmRoutableHighwayTagValues[parentWay.tags.highway]) return true;
          // consider connections to ferry routes as connected
          if (parentWay.tags.route === 'ferry') return true;

          return graph.parentRelations(parentWay).some(parentRelation => {
            if (parentRelation.tags.type === 'route' && parentRelation.tags.route === 'ferry') return true;
            // allow connections to highway multipolygons
            return parentRelation.isMultipolygon() && osmRoutableHighwayTagValues[parentRelation.tags.highway];
          });
        } else if (wayType === 'waterway') {
          // multiple waterways may start or end at a water body at the same node
          if (parentWay.tags.natural === 'water' || parentWay.tags.natural === 'coastline') return true;
        }
        return false;
      });
    }


    /**
     * issuesForNode
     * Detects issues that occur at the given nodeID.
     * This function gets called twice, once for the start node, once for the end node.
     * (The start/end nodes can function either as the head or tail, depending on whether
     *  the way is tagged as a normal oneway or a reverse oneway, see Rapid#1302)
     * @param   {osmWay}   way     - way to check (it should be a oneway)
     * @param   {osmNode}  nodeID  - node to check (either the start or end node of the way)
     * @param   {Array}    Array of any `ValidationIssue`s detected
     */
    function issuesForNode(way, nodeID) {
      const isHead = (nodeID === way.first() && way.tags.oneway !== '-1');
      const isTail = !isHead;
      const wayType = typeForWay(way);

      // Skip checks if the way is self-connected at this node.
      if (nodeOccursMoreThanOnce(way, nodeID)) return [];

      const osm = context.services.osm;
      if (!osm) return [];

      const node = graph.hasEntity(nodeID);

      // Bail out if map not fully loaded here - we won't know all the node's parentWays.
      // Don't worry, as more map tiles are loaded, we'll have additional chances to validate it.
      if (!node || !osm.isDataLoaded(node.loc)) return [];

      // Some tags imply that the node is connected and we can stop here.
      if (isNodeTaggedAsConnected(way, node, isHead)) return [];

      // Collect other ways of the same type (highway or waterway).
      const attachedWaysOfSameType = graph.parentWays(node).filter(other => {
        if (other.id === way.id) return false;  // ignore self
        return typeForWay(other) === wayType;
      });

      // Assume it's okay for waterways to start or end disconnected for now.
      if (wayType === 'waterway' && attachedWaysOfSameType.length === 0) return [];

      // No issues if this oneway is connected to non-oneway features of the same type.
      const attachedOneways = attachedWaysOfSameType.filter(other => other.isOneWay());
      if (attachedOneways.length < attachedWaysOfSameType.length) return [];

      // Finally, check how this oneway attaches to the other oneways.
      // Allow anything except for head-head or tail-tail.
      //
      // It is still possible to construct some unescapable geometries that satisfy this check.
      // For example, where heads/tails attach to middles
      //
      //    a -> b -> c -> d               w1: [a,b,c,d,x]
      //          \         \              w2: [w,x,y,z,b]
      //           z <- y <- x <- w

      for (const other of attachedOneways) {
        // Again, skip checks on self-connected ways
        if (nodeOccursMoreThanOnce(other, nodeID)) return [];

        const otherHead = (other.tags.oneway === '-1') ? other.last() : other.first();
        const otherTail = (other.tags.oneway === '-1') ? other.first() : other.last();
        if ((isHead && nodeID !== otherHead) || (isTail && nodeID !== otherTail)) return [];
      }

      // If we get here, the way is not reachable / escapable.

      const placement = isHead ? 'start' : 'end';
      let messageID, referenceID;
      if (wayType === 'waterway') {
        messageID = `${wayType}.connected.${placement}`;
        referenceID = `${wayType}.connected`;
      } else {
        messageID = `${wayType}.${placement}`;
        referenceID = `${wayType}.${placement}`;
      }

      return [new ValidationIssue(context, {
        type: type,
        subtype: wayType,
        severity: 'warning',
        message: function() {
          const graph = editor.staging.graph;
          const entity = graph.hasEntity(this.entityIds[0]);
          return entity ? l10n.t(`issues.impossible_oneway.${messageID}.message`, {
            feature: l10n.displayLabel(entity, graph)
          }) : '';
        },
        reference: getReference(referenceID),
        entityIds: [way.id, node.id],
        dynamicFixes: function() {
          const graph = editor.staging.graph;
          let fixes = [];
          if (attachedOneways.length) {
            fixes.push(new ValidationFix({
              icon: 'rapid-operation-reverse',
              title: l10n.t('issues.fix.reverse_feature.title'),
              entityIds: [way.id],
              onClick: function() {
                const entityID = this.issue.entityIds[0];
                editor.perform(actionReverse(entityID));
                editor.commit({
                  annotation: l10n.t('operations.reverse.annotation.line', { n: 1 }),
                  selectedIDs: [entityID]
                });
              }
            }));
          }
          if (node.tags.noexit !== 'yes') {
            const isRTL = l10n.isRTL();
            const useLeftContinue = (isHead && !isRTL) || (!isHead && isRTL);
            fixes.push(new ValidationFix({
              icon: 'rapid-operation-continue' + (useLeftContinue ? '-left' : ''),
              title: l10n.t('issues.fix.continue_from_' + (isHead ? 'start' : 'end') + '.title'),
              onClick: function() {
                const entityID = this.issue.entityIds[0];
                const vertexID = this.issue.entityIds[1];
                const way = graph.entity(entityID);
                const vertex = graph.entity(vertexID);
                continueDrawing(way, vertex, context);
              }
            }));
          }

          return fixes;
        },
        loc: node.loc
      })];

      function getReference(referenceID) {
        return function showReference(selection) {
          selection.selectAll('.issue-reference')
            .data([0])
            .enter()
            .append('div')
            .attr('class', 'issue-reference')
            .text(l10n.t(`issues.impossible_oneway.${referenceID}.reference`));
        };
      }
    }
  };


  function continueDrawing(way, vertex, context) {
    // make sure the vertex is actually visible and editable
    let map = context.systems.map;
    if (!context.editable() || !map.trimmedExtent().contains(new Extent(vertex.loc))) {
      map.fitEntitiesEase(vertex);
    }

    context.enter('draw-line', { continueWayID: way.id, continueNodeID: vertex.id });
  }

  validation.type = type;

  return validation;
}
