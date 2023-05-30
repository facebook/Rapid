import { Extent, geoSphericalDistance } from '@rapid-sdk/math';

import { operationDelete } from '../operations/index';
import { ValidationIssue, ValidationFix } from '../core/lib';


export function validationShortRoad(context) {
  const type = 'short_road';
  const l10n = context.localizationSystem();

  // Thresholds for number of nodes and total length for a short road. A road
  // is considered as "short" only if it has less than 7 nodes and is shorter
  // than 20 meters.
  const SHORT_WAY_NODES_THD = 7;
  const SHORT_WAY_LENGTH_THD_METERS = 20;


  function wayLength(way, graph) {
    let length = 0;
    for (let i = 0; i < way.nodes.length - 1; i++) {
      const n1 = graph.entity(way.nodes[i]);
      const n2 = graph.entity(way.nodes[i + 1]);
      length += geoSphericalDistance(n1.loc, n2.loc);
    }
    return length;
  }

  function continueDrawing(way, vertex, context) {
    if (!context.editable()) return;

    // make sure the vertex is actually visible and editable
    const map = context.mapSystem();
    if (!map.trimmedExtent().contains(new Extent(vertex.loc))) {
      map.zoomToEase(vertex);
    }

    context.enter('draw-line', { continueWay: way, continueNode: vertex });
  }


  let validation = function(entity, graph) {
    if (entity.type !== 'way') return [];
    if (!entity.tags.highway || entity.isClosed() || entity.nodes.length >= SHORT_WAY_NODES_THD) return [];

    const firstNode = graph.entity(entity.first());
    const lastNode = graph.entity(entity.last());
    const pwaysStart = graph.parentWays(firstNode);
    const pwaysEnd = graph.parentWays(lastNode);
    const firstNodeOK = pwaysStart.length > 1 || firstNode.tags.noexit === 'yes';
    const lastNodeOK = pwaysEnd.length > 1 || lastNode.tags.noexit === 'yes';

    // only do check on roads with open ends
    if ((firstNodeOK && lastNodeOK) || wayLength(entity, graph) >= SHORT_WAY_LENGTH_THD_METERS) return [];

    let fixes = [];
    if (!firstNodeOK) {
      fixes.push(new ValidationFix({
        icon: 'rapid-operation-continue-left',
        title: l10n.t('issues.fix.continue_from_start.title'),
        entityIds: [entity.first()],
        onClick: () => {
          const vertex = context.entity(entity.first());
          continueDrawing(entity, vertex, context);
        }
      }));
    }

    if (!lastNodeOK) {
      fixes.push(new ValidationFix({
        icon: 'rapid-operation-continue',
        title: l10n.t('issues.fix.continue_from_end.title'),
        entityIds: [entity.last()],
        onClick: () => {
          const vertex = context.entity(entity.last());
          continueDrawing(entity, vertex, context);
        }
      }));
    }

    if (!operationDelete(context, [entity.id]).disabled()) {
      fixes.push(new ValidationFix({
        icon: 'rapid-operation-delete',
        title: l10n.t('issues.fix.delete_feature.title'),
        entityIds: [entity.id],
        onClick: function() {
          const id = this.issue.entityIds[0];
          const operation = operationDelete(context, [id]);
          if (!operation.disabled()) {
            operation();
          }
        }
      }));
    }

    return [new ValidationIssue(context, {
      type: type,
      severity: 'warning',
      message: function() {
        const entity = context.hasEntity(this.entityIds[0]);
        if (!entity) return '';
        const entityLabel = l10n.displayLabel(entity, context.graph());
        return l10n.t('issues.short_road.message', { highway: entityLabel });
      },
      reference: selection => {
        selection.selectAll('.issue-reference')
          .data([0])
          .enter()
          .append('div')
          .attr('class', 'issue-reference')
          .text(l10n.t('issues.short_road.reference'));
      },
      entityIds: [entity.id],
      fixes: fixes
    })];
  };


  validation.type = type;

  return validation;
}
