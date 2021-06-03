import { utilDisplayLabel } from '../util';
import { t } from '../core/localizer';
import { validationIssue, validationIssueFix } from '../core/validation';

// This validation determines whether way segments are duplicated atop one another,
// which is impossible to detect via the tool(the geometries are stacked on top of
// one another, so they are not visible ever).
export function validationDuplicateWaySegments(context) {
    var type = 'duplicate_way_segments';


    var validation = function(entity, graph) {
        if (entity.type === 'way') {
            return getIssuesForWay(entity);
        }
        return [];


        function isRoutableTag(key) {
            return key === 'highway' ||
                key === 'railway' ||
                key === 'waterway';
        }


        function isAreaTag(key) {
            return key === 'area';
        }


    // Consider a way to be routable if it is a highway, railway, or wateray.
    // if it is an area of any kind, it is not routable.
    function hasRoutableTags(way) {
        if (way.isArea()) return false;
        return Object.keys(way.tags).some(isRoutableTag);
    }


    function adjacentNodes(node1, node2, way) {
        const nodes = graph.childNodes(way);
        return Math.abs(nodes.findIndex(node => node.id === node1.id) - nodes.findIndex(node =>  node.id === node2.id)) === 1;
    }


    function getIssuesForWay(way) {
        var issues = [];
            if (!hasRoutableTags(way)) return issues;

        var nodes = graph.childNodes(way);
        for (var i = 0; i < nodes.length - 1; i++) {
            var node1 = nodes[i];
            var node2 = nodes[i+1];

            var issue = getWayIssueIfAny(node1, node2, way);
            if (issue) issues.push(issue);
        }
        return issues;
    }


        function getWayIssueIfAny(node1, node2, way) {
            if (node1.id === node2.id ) {
                return null;
            }

            if (node1.loc !== node2.loc) {
                var parentWays1 = graph.parentWays(node1);
                var parentWays2 = new Set(graph.parentWays(node2));

                var sharedWays = parentWays1.filter(function(parentWay) {
                    return parentWays2.has(parentWay);
                });

                // Now, we want to filter out any shared ways that aren't routable.

                var remainingSharedWays = sharedWays.filter(way => hasRoutableTags(way));

                //Finally, get rid of ways where the two nodes in question are not continguous (this indicates a dogleg or u-shaped road splitting off from node1 and then re-joining at node 2)
                var waysWithContiguousNodes = remainingSharedWays.filter(way => adjacentNodes(node1, node2, way))

                // If the nodes don't share a way, or share 1 way, that's fine!
                // We just want to know if they share 2 or more ways, which means we have duplicate way geometries.
                if (waysWithContiguousNodes.length <= 1) return null;
            }


            return new validationIssue({
                type: type,
                subtype: 'vertices',
                severity: 'warning',
                message: function(context) {
                    var entity = context.hasEntity(this.entityIds[0]);
                    return entity ? t.html('issues.duplicate_way_segments.message', { way: utilDisplayLabel(entity, context.graph()) }) : '';
                },
                reference: showReference,
                entityIds: [way.id, node1.id, node2.id],
                loc: node1.loc,
                dynamicFixes: function() {
                    return [
                        new validationIssueFix({
                            icon: 'iD-icon-plus',
                            title: t.html('issues.fix.merge_points.title'),
                        }),
                        new validationIssueFix({
                            icon: 'iD-operation-delete',
                            title: t.html('issues.fix.remove_way_segments.title')
                        }),
                        new validationIssueFix({
                            icon: 'iD-operation-disconnect',
                            title: t.html('issues.fix.move_way_segments_apart.title')
                        })
                    ];
                }
            });


            function showReference(selection) {
                var referenceText = t('issues.duplicate_way_segments.reference');
                selection.selectAll('.issue-reference')
                    .data([0])
                    .enter()
                    .append('div')
                    .attr('class', 'issue-reference')
                    .html(referenceText);
            }
        }

    };


    validation.type = type;

    return validation;
}
