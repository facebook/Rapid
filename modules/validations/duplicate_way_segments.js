import { ValidationIssue, ValidationFix } from '../core/lib/index.js';


// This validation determines whether way segments are duplicated atop one another,
// which is impossible to detect via the tool(the geometries are stacked on top of
// one another, so they are not visible ever).
export function validationDuplicateWaySegments(context) {
  const type = 'duplicate_way_segments';
  const editor = context.systems.editor;
  const l10n = context.systems.l10n;


  let validation = function(entity, graph) {
    if (entity.type === 'way') {
      return getIssuesForWay(entity);
    }
    return [];


    function isRoutableTag(key) {
      return key === 'highway' || key === 'railway' || key === 'waterway';
    }


    // Consider a way to be routable if it is a highway, railway, or wateray.
    // if it is an area of any kind, it is not routable.
    function hasRoutableTags(way) {
      if (way.isArea()) return false;
      return Object.keys(way.tags).some(isRoutableTag);
    }


    function adjacentNodes(node1, node2, way) {
      const nodes = graph.childNodes(way);
      const index1 = nodes.findIndex(node => node.id === node1.id);
      const index2 = nodes.findIndex(node => node.id === node2.id);
      return Math.abs(index1 - index2) === 1;
    }


    function getIssuesForWay(way) {
      let issues = [];
      if (!hasRoutableTags(way)) return issues;

      const nodes = graph.childNodes(way);
      for (let i = 0; i < nodes.length - 1; i++) {
        const node1 = nodes[i];
        const node2 = nodes[i+1];
        const issue = getWayIssueIfAny(node1, node2, way);
        if (issue) issues.push(issue);
      }
      return issues;
    }


    function getWayIssueIfAny(node1, node2, way) {
      if (node1.id === node2.id ) return null;

      if (node1.loc !== node2.loc) {
        const parentWays1 = graph.parentWays(node1);
        const parentWays2 = new Set(graph.parentWays(node2));
        const sharedWays = parentWays1.filter(parentWay => parentWays2.has(parentWay));

        // Now, we want to filter out any shared ways that aren't routable.
        const remainingSharedWays = sharedWays.filter(way => hasRoutableTags(way));

        //Finally, get rid of ways where the two nodes in question are not continguous
        //(this indicates a dogleg or u-shaped road splitting off from node1 and then re-joining at node 2)
        const waysWithContiguousNodes = remainingSharedWays.filter(way => adjacentNodes(node1, node2, way));

        // If the nodes don't share a way, or share 1 way, that's fine!
        // We just want to know if they share 2 or more ways, which means we have duplicate way geometries.
        if (waysWithContiguousNodes.length <= 1) return null;
      }

      return new ValidationIssue(context, {
        type: type,
        subtype: 'vertices',
        severity: 'warning',
        message: function() {
          const graph = editor.staging.graph;
          const entity = graph.hasEntity(this.entityIds[0]);
          return entity ? l10n.t('issues.duplicate_way_segments.message', {
            way: l10n.displayLabel(entity, graph)
          }) : '';
        },
        reference: showReference,
        entityIds: [ way.id, node1.id, node2.id ],
        loc: node1.loc,
        dynamicFixes: () => {
          return [
            new ValidationFix({
              icon: 'rapid-icon-plus',
              title: l10n.t('issues.fix.merge_points.title'),
            }),
            new ValidationFix({
              icon: 'rapid-operation-delete',
              title: l10n.t('issues.fix.remove_way_segments.title')
            }),
            new ValidationFix({
              icon: 'rapid-operation-disconnect',
              title: l10n.t('issues.fix.move_way_segments_apart.title')
            })
          ];
        }
      });


      function showReference(selection) {
        selection.selectAll('.issue-reference')
          .data([0])
          .enter()
          .append('div')
          .attr('class', 'issue-reference')
          .text(l10n.t('issues.duplicate_way_segments.reference'));
      }
    }

  };


  validation.type = type;

  return validation;
}
