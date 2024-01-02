import { Extent } from '@rapid-sdk/math';

import { actionReverse } from '../actions/reverse';
import { osmFlowingWaterwayTagValues, osmRoutableHighwayTagValues } from '../osm/tags';
import { ValidationIssue, ValidationFix } from '../core/lib';


export function validationImpossibleOneway(context) {
  const type = 'impossible_oneway';
  const editor = context.systems.editor;
  const l10n = context.systems.l10n;

  let validation = function checkImpossibleOneway(entity, graph) {
    if (entity.type !== 'way' || entity.geometry(graph) !== 'line') return [];
    if (entity.isClosed()) return [];
    if (!typeForWay(entity)) return [];
    if (!entity.isOneWay()) return [];
    if (entity.tags.intermittent === 'yes') return [];  // Ignore intermittent waterways - Rapid#1018

    const firstIssues = issuesForNode(entity, entity.first());
    const lastIssues = issuesForNode(entity, entity.last());
    return firstIssues.concat(lastIssues);


    function typeForWay(way) {
      if (way.geometry(graph) !== 'line') return null;
      if (osmRoutableHighwayTagValues[way.tags.highway]) return 'highway';
      if (osmFlowingWaterwayTagValues[way.tags.waterway]) return 'waterway';
      return null;
    }


    function nodeOccursMoreThanOnce(way, nodeID) {
      return (way.nodes.indexOf(nodeID) !== way.nodes.lastIndexOf(nodeID));
    }


    function isConnectedViaOtherTypes(way, node) {
      let wayType = typeForWay(way);

      if (wayType === 'highway') {
        // entrances are considered connected
        if (node.tags.entrance && node.tags.entrance !== 'no') return true;
        if (node.tags.amenity === 'parking_entrance') return true;

      } else if (wayType === 'waterway') {
        if (node.id === way.first()) {
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
          // count connections to ferry routes as connected
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


    function issuesForNode(way, nodeID) {
      const isFirst = nodeID === way.first();
      const wayType = typeForWay(way);

      // ignore if this way is self-connected at this node
      if (nodeOccursMoreThanOnce(way, nodeID)) return [];

      const osm = context.services.osm;
      if (!osm) return [];

      const node = graph.hasEntity(nodeID);

      // ignore if this node or its tile are unloaded
      if (!node || !osm.isDataLoaded(node.loc)) return [];

      if (isConnectedViaOtherTypes(way, node)) return [];

      const attachedWaysOfSameType = graph.parentWays(node).filter(parentWay => {
        if (parentWay.id === way.id) return false;
        return typeForWay(parentWay) === wayType;
      });

      // assume it's okay for waterways to start or end disconnected for now
      if (wayType === 'waterway' && attachedWaysOfSameType.length === 0) return [];

      // ignore if the way is connected to some non-oneway features
      const attachedOneways = attachedWaysOfSameType.filter(attachedWay => attachedWay.isOneWay());
      if (attachedOneways.length < attachedWaysOfSameType.length) return [];

      if (attachedOneways.length) {
        const connectedEndpointsOkay = attachedOneways.some(attachedOneway => {
          if ((isFirst ? attachedOneway.first() : attachedOneway.last()) !== nodeID) return true;
          if (nodeOccursMoreThanOnce(attachedOneway, nodeID)) return true;
          return false;
        });
        if (connectedEndpointsOkay) return [];
      }

      const placement = isFirst ? 'start' : 'end';
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
            const useLeftContinue = (isFirst && !isRTL) || (!isFirst && isRTL);
            fixes.push(new ValidationFix({
              icon: 'rapid-operation-continue' + (useLeftContinue ? '-left' : ''),
              title: l10n.t('issues.fix.continue_from_' + (isFirst ? 'start' : 'end') + '.title'),
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
