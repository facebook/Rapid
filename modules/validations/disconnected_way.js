import { Extent } from '@rapid-sdk/math';

import { operationDelete } from '../operations/delete.js';
import { osmRoutableHighwayTagValues } from '../osm/tags.js';
import { ValidationIssue, ValidationFix } from '../core/lib/index.js';


export function validationDisconnectedWay(context) {
  const type = 'disconnected_way';
  const editor = context.systems.editor;
  const l10n = context.systems.l10n;
  const map = context.systems.map;

  function isTaggedAsHighway(entity) {
    return osmRoutableHighwayTagValues[entity.tags.highway];
  }


  let validation = function checkDisconnectedWay(entity, graph) {
    const routingIslandEntities = routingIslandForEntity(entity);
    if (!routingIslandEntities) return [];

    return [new ValidationIssue(context, {
      type: type,
      subtype: 'highway',
      severity: 'warning',
      message: function() {
        const graph = editor.staging.graph;
        const entity = this.entityIds.length && graph.hasEntity(this.entityIds[0]);
        const label = entity && l10n.displayLabel(entity, graph);
        return l10n.t('issues.disconnected_way.routable.message', { count: this.entityIds.length, highway: label });
      },
      reference: showReference,
      entityIds: Array.from(routingIslandEntities).map(entity => entity.id),
      dynamicFixes: makeFixes
    })];


    function makeFixes() {
      const graph = editor.staging.graph;
      const singleEntity = this.entityIds.length === 1 && graph.hasEntity(this.entityIds[0]);
      let fixes = [];

      if (singleEntity) {
        if (singleEntity.type === 'way' && !singleEntity.isClosed()) {
          const startFix = makeContinueDrawingFixIfAllowed(singleEntity.first(), 'start');
          if (startFix) fixes.push(startFix);

          const endFix = makeContinueDrawingFixIfAllowed(singleEntity.last(), 'end');
          if (endFix) fixes.push(endFix);
        }
        if (!fixes.length) {
          fixes.push(new ValidationFix({
            title: l10n.t('issues.fix.connect_feature.title')
          }));
        }

        fixes.push(new ValidationFix({
          icon: 'rapid-operation-delete',
          title: l10n.t('issues.fix.delete_feature.title'),
          entityIds: [ singleEntity.id ],
          onClick: function() {
            const id = this.issue.entityIds[0];
            const operation = operationDelete(context, [id]);
            if (!operation.disabled()) {
              operation();
            }
          }
        }));
      } else {
        fixes.push(new ValidationFix({
          title: l10n.t('issues.fix.connect_features.title')
        }));
      }

      return fixes;
    }


    function showReference(selection) {
      selection.selectAll('.issue-reference')
        .data([0])
        .enter()
        .append('div')
        .attr('class', 'issue-reference')
        .text(l10n.t('issues.disconnected_way.routable.reference'));
    }


    function routingIslandForEntity(entity) {
      let routingIsland = new Set();  // the interconnected routable features
      let waysToCheck = [];           // the queue of remaining routable ways to traverse

      function queueParentWays(node) {
        for (const parentWay of graph.parentWays(node)) {
          if (!routingIsland.has(parentWay) && isRoutableWay(parentWay, false)) {
            routingIsland.add(parentWay);
            waysToCheck.push(parentWay);
          }
        }
      }

      if (entity.type === 'way' && isRoutableWay(entity, true)) {
        routingIsland.add(entity);
        waysToCheck.push(entity);

      } else if (entity.type === 'node' && isRoutableNode(entity)) {
        routingIsland.add(entity);
        queueParentWays(entity);

      } else {    // this feature isn't routable, cannot be a routing island
        return null;
      }


      while (waysToCheck.length) {
        const way = waysToCheck.pop();
        for (const vertex of graph.childNodes(way)) {
          if (isConnectedVertex(vertex)) {
            return null;  // found a link to the wider network, not a routing island
          }

          if (isRoutableNode(vertex)) {
            routingIsland.add(vertex);
          }

          queueParentWays(vertex);
        }
      }

      // no network link found, this is a routing island, return its members
      return routingIsland;
    }


    function isConnectedVertex(vertex) {
      // Assume ways overlapping unloaded tiles are connected to the wider road network. - iD#5938
      // Don't worry, as more map tiles are loaded, we'll have additional chances to validate it.
      const osm = context.services.osm;
      if (osm && !osm.isDataLoaded(vertex.loc)) return true;

      // entrances are considered connected
      if (vertex.tags.entrance && vertex.tags.entrance !== 'no') return true;
      if (vertex.tags.amenity === 'parking_entrance') return true;

      return false;
    }


    function isRoutableNode(node) {
      // treat elevators as distinct features in the highway network
      if (node.tags.highway === 'elevator') return true;
      return false;
    }


    function isRoutableWay(way, ignoreInnerWays) {
      if (isTaggedAsHighway(way) || way.tags.route === 'ferry') return true;

      return graph.parentRelations(way).some(parentRelation => {
        if (parentRelation.tags.type === 'route' &&
          parentRelation.tags.route === 'ferry') return true;

        if (parentRelation.isMultipolygon() &&
          isTaggedAsHighway(parentRelation) &&
          (!ignoreInnerWays || parentRelation.memberById(way.id).role !== 'inner')) return true;

        return false;
      });
    }


    function makeContinueDrawingFixIfAllowed(vertexID, whichEnd) {
      const vertex = graph.hasEntity(vertexID);
      if (!vertex || vertex.tags.noexit === 'yes') return null;

      const isRTL = l10n.isRTL();
      const useLeftContinue = (whichEnd === 'start' && !isRTL) || (whichEnd === 'end' && isRTL);

      return new ValidationFix({
        icon: 'rapid-operation-continue' + (useLeftContinue ? '-left' : ''),
        title: l10n.t(`issues.fix.continue_from_${whichEnd}.title`),
        entityIds: [vertexID],
        onClick: function() {
          const graph = editor.staging.graph;
          const wayID = this.issue.entityIds[0];
          const way = graph.hasEntity(wayID);
          const vertexID = this.entityIds[0];
          const vertex = graph.hasEntity(vertexID);
          if (!way || !vertex) return;

          // make sure the vertex is actually visible and editable
          if (!context.editable() || !map.trimmedExtent().contains(new Extent(vertex.loc))) {
            map.fitEntitiesEase(vertex);
          }

          context.enter('draw-line', { continueWayID: way.id, continueNodeID: vertex.id });
        }
      });
    }
  };


  validation.type = type;

  return validation;
}
