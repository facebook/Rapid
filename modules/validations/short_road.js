import { Extent } from '@id-sdk/extent';

import { geoSphericalDistance } from '@id-sdk/geo';
import { operationDelete } from '../operations/index';
import { t } from '../core/localizer';
import { utilDisplayLabel } from '../util';
import { validationIssue, validationIssueFix } from '../core/validation';


export function validationShortRoad(context) {
    var type = 'short_road';

    // Thresholds for number of nodes and total length for a short road. A road
    // is considered as "short" only if it has less than 7 nodes and is shorter
    // than 20 meters.
    var SHORT_WAY_NODES_THD = 7;
    var SHORT_WAY_LENGTH_THD_METERS = 20;


    function wayLength(way, graph) {
        var length = 0;
        for (var i = 0; i < way.nodes.length - 1; i++) {
            var n1 = graph.entity(way.nodes[i]),
                n2 = graph.entity(way.nodes[i + 1]);
            length += geoSphericalDistance(n1.loc, n2.loc);
        }
        return length;
    }

    function continueDrawing(way, vertex, context) {
        if (!context.editable()) return;

        // make sure the vertex is actually visible and editable
        var map = context.map();
        if (!map.trimmedExtent().contains(new Extent(vertex.loc))) {
            map.zoomToEase(vertex);
        }

        context.enter('draw-line', { continueWay: way, continueNode: vertex });
    }


    var validation = function(entity, graph) {
        if (entity.type !== 'way' || !entity.tags.highway || entity.isClosed() || entity.nodes.length >= SHORT_WAY_NODES_THD) return [];

        var firstNode = graph.entity(entity.first()),
            lastNode = graph.entity(entity.last()),
            pwaysStart = graph.parentWays(firstNode),
            pwaysEnd = graph.parentWays(lastNode),
            firstNodeOK = pwaysStart.length > 1 || firstNode.tags.noexit === 'yes',
            lastNodeOK = pwaysEnd.length > 1 || lastNode.tags.noexit === 'yes';
        // only do check on roads with open ends
        if ((firstNodeOK && lastNodeOK) || wayLength(entity, graph) >= SHORT_WAY_LENGTH_THD_METERS) return [];

        var fixes = [];
        if (!firstNodeOK) {
            fixes.push(new validationIssueFix({
                icon: 'iD-operation-continue-left',
                title: t('issues.fix.continue_from_start.title'),
                entityIds: [entity.first()],
                onClick: function() {
                    var vertex = context.entity(entity.first());
                    continueDrawing(entity, vertex, context);
                }
            }));
        }
        if (!lastNodeOK) {
            fixes.push(new validationIssueFix({
                icon: 'iD-operation-continue',
                title: t('issues.fix.continue_from_end.title'),
                entityIds: [entity.last()],
                onClick: function() {
                    var vertex = context.entity(entity.last());
                    continueDrawing(entity, vertex, context);
                }
            }));
        }
        if (!operationDelete(context, [entity.id]).disabled()) {
            fixes.push(new validationIssueFix({
                icon: 'iD-operation-delete',
                title: t('issues.fix.delete_feature.title'),
                entityIds: [entity.id],
                onClick: function() {
                    var id = this.issue.entityIds[0];
                    var operation = operationDelete(context, [id]);
                    if (!operation.disabled()) {
                        operation();
                    }
                }
            }));
        }

        return [new validationIssue({
            type: type,
            severity: 'warning',
            message: function(context) {
                var entity = context.hasEntity(this.entityIds[0]);
                if (!entity) return '';
                var entityLabel = utilDisplayLabel(entity, context.graph());
                return t('issues.short_road.message', { highway: entityLabel });
            },
            reference: function(selection) {
                selection.selectAll('.issue-reference')
                    .data([0])
                    .enter()
                    .append('div')
                    .attr('class', 'issue-reference')
                    .text(t('issues.short_road.reference'));
            },
            entityIds: [entity.id],
            fixes: fixes
        })];
    };


    validation.type = type;

    return validation;
}
