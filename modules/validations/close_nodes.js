import { Extent, geoMetersToLat, geoMetersToLon, geoSphericalDistance } from '@rapid-sdk/math';

import { actionMergeNodes } from '../actions/merge_nodes.js';
import { ValidationIssue, ValidationFix } from '../core/lib/index.js';
import { osmPathHighwayTagValues } from '../osm/tags.js';


export function validationCloseNodes(context) {
  const type = 'close_nodes';
  const editor = context.systems.editor;
  const l10n = context.systems.l10n;

  const pointThresholdMeters = 0.2;

  // helpers
  function hasTag(v) {
    return v !== undefined && v !== 'no';
  }


  let validation = function(entity, graph) {
    if (entity.type === 'node') {
      return getIssuesForNode(entity);
    } else if (entity.type === 'way') {
      return getIssuesForWay(entity);
    }
    return [];

    function getIssuesForNode(node) {
      const parentWays = graph.parentWays(node);
      if (parentWays.length) {
        return getIssuesForVertex(node, parentWays);
      } else {
        return getIssuesForDetachedPoint(node);
      }
    }

    function wayTypeFor(way) {
      const tags = way.tags;

      if (hasTag(tags.boundary)) return 'boundary';
      if (hasTag(tags.indoor)) return 'indoor';
      if (hasTag(tags.building) || hasTag(tags['building:part'])) return 'building';
      if (osmPathHighwayTagValues[tags.highway]) return 'path';

      const parentRelations = graph.parentRelations(way);
      for (const relation of parentRelations) {
        if (relation.tags.type === 'boundary') return 'boundary';
        if (relation.isMultipolygon()) {
          if (hasTag(relation.tags.indoor)) return 'indoor';
          if (hasTag(relation.tags.building) || hasTag(relation.tags['building:part'])) return 'building';
        }
      }

      return 'other';
    }


    function shouldCheckWay(way) {
      // don't flag issues where merging would create degenerate ways
      if (way.nodes.length <= 2 || (way.isClosed() && way.nodes.length <= 4)) return false;

      // don't flag close nodes in very small ways
      const bbox = way.extent(graph).bbox();
      const hypotenuseMeters = geoSphericalDistance([bbox.minX, bbox.minY], [bbox.maxX, bbox.maxY]);
      if (hypotenuseMeters < 1.5) return false;

      return true;
    }


    function getIssuesForWay(way) {
      if (!shouldCheckWay(way)) return [];

      const issues = [];
      const nodes = graph.childNodes(way);

      for (let i = 0; i < nodes.length - 1; i++) {
        const node1 = nodes[i];
        const node2 = nodes[i+1];
        const issue = getWayIssueIfAny(node1, node2, way);
        if (issue) {
          issues.push(issue);
        }
      }
      return issues;
    }


    function getIssuesForVertex(node, parentWays) {
      const issues = [];

      function checkForCloseness(node1, node2, way) {
        const issue = getWayIssueIfAny(node1, node2, way);
        if (issue) {
          issues.push(issue);
        }
      }

      for (const parentWay of parentWays) {
        if (!shouldCheckWay(parentWay)) continue;

        const lastIndex = parentWay.nodes.length - 1;
        for (let j = 0; j < parentWay.nodes.length; j++) {
          if (j !== 0) {
            if (parentWay.nodes[j-1] === node.id) {
              checkForCloseness(node, graph.entity(parentWay.nodes[j]), parentWay);
            }
          }
          if (j !== lastIndex) {
            if (parentWay.nodes[j+1] === node.id) {
              checkForCloseness(graph.entity(parentWay.nodes[j]), node, parentWay);
            }
          }
        }
      }
      return issues;
    }


    function thresholdMetersForWay(way) {
      if (!shouldCheckWay(way)) return 0;

      const wayType = wayTypeFor(way);

      // don't flag boundaries since they might be highly detailed and can't be easily verified
      if (wayType === 'boundary') return 0;

      // expect some features to be mapped with higher levels of detail
      if (wayType === 'indoor')   return 0.01;
      if (wayType === 'building') return 0.05;
      if (wayType === 'path')     return 0.1;

      return 0.2;
    }


    function getIssuesForDetachedPoint(node) {
      const issues = [];
      const lon = node.loc[0];
      const lat = node.loc[1];
      const lon_range = geoMetersToLon(pointThresholdMeters, lat) / 2;
      const lat_range = geoMetersToLat(pointThresholdMeters) / 2;
      const queryExtent = new Extent(
        [lon - lon_range, lat - lat_range],
        [lon + lon_range, lat + lat_range]
      );

//todo: using tree like this may be problematic - it may not reflect the graph we are validating
// update: it's probably ok, as `tree.intersects` will reset the tree to the graph are using..
// (although this will surely hurt performance)
      const intersected = editor.tree.intersects(queryExtent, graph);

      for (const nearby of intersected) {
        if (nearby.id === node.id) continue;  // ignore self
        if (nearby.type !== 'node' || nearby.geometry(graph) !== 'point') continue;

        if (nearby.loc === node.loc || geoSphericalDistance(node.loc, nearby.loc) < pointThresholdMeters) {
          // ignore stolperstein (https://wiki.openstreetmap.org/wiki/DE:Stolpersteine)
          if ('memorial:type' in node.tags && 'memorial:type' in nearby.tags && node.tags['memorial:type']==='stolperstein' && nearby.tags['memorial:type']==='stolperstein') continue;
          if ('memorial' in node.tags && 'memorial' in nearby.tags && node.tags.memorial==='stolperstein' && nearby.tags.memorial === 'stolperstein') continue;

          // allow very close points if tags indicate the z-axis might vary
          const zAxisKeys = { layer: true, level: true, 'addr:housenumber': true, 'addr:unit': true };
          let zAxisDifferentiates = false;
          for (var key in zAxisKeys) {
            const nodeValue = node.tags[key] || '0';
            const nearbyValue = nearby.tags[key] || '0';
            if (nodeValue !== nearbyValue) {
              zAxisDifferentiates = true;
              break;
            }
          }
          if (zAxisDifferentiates) continue;

          issues.push(new ValidationIssue(context, {
            type: type,
            subtype: 'detached',
            severity: 'warning',
            message: function() {
              const graph = editor.staging.graph;
              const entity = graph.hasEntity(this.entityIds[0]);
              const entity2 = graph.hasEntity(this.entityIds[1]);
              return (entity && entity2) ? l10n.t('issues.close_nodes.detached.message', {
                feature: l10n.displayLabel(entity, graph),
                feature2: l10n.displayLabel(entity2, graph)
              }) : '';
            },
            reference: showReference,
            entityIds: [node.id, nearby.id],
            dynamicFixes: function() {
              return [
                new ValidationFix({
                  icon: 'rapid-operation-disconnect',
                  title: l10n.t('issues.fix.move_points_apart.title')
                }),
                new ValidationFix({
                  icon: 'rapid-icon-layers',
                  title: l10n.t('issues.fix.use_different_layers_or_levels.title')
                })
              ];
            }
          }));
        }
      }

      return issues;

      function showReference(selection) {
        selection.selectAll('.issue-reference')
          .data([0])
          .enter()
          .append('div')
          .attr('class', 'issue-reference')
          .text(l10n.t('issues.close_nodes.detached.reference'));
      }
    }


    function getWayIssueIfAny(node1, node2, way) {
      if (node1.id === node2.id || (node1.hasInterestingTags() && node2.hasInterestingTags())) {
        return null;
      }

      if (node1.loc !== node2.loc) {
        const parentWays1 = graph.parentWays(node1);
        const parentWays2 = new Set(graph.parentWays(node2));
        const sharedWays = parentWays1.filter(parentWay => parentWays2.has(parentWay));
        const thresholds = sharedWays.map(parentWay => thresholdMetersForWay(parentWay));
        const threshold = Math.min(...thresholds);
        const distance = geoSphericalDistance(node1.loc, node2.loc);
        if (distance > threshold) return null;
      }

      // This just wraps `actionMergeNodes`, but it checks that the nodes exist first.
      // During autofixing, the nodes involved may have been merged previously and not exist anymore.
      const actionTryMergeNodes = (nodeIDs) => {
        return graph => {
          const nA = nodeIDs[0];
          const nB = nodeIDs[1];
          if (nA && nB && graph.hasEntity(nA) && graph.hasEntity(nB)) {
            return actionMergeNodes(nodeIDs)(graph);  // ok to merge
          } else {
            return graph;
          }
        };
      };

      return new ValidationIssue(context, {
        type: type,
        subtype: 'vertices',
        severity: 'warning',
        message: function() {
          const graph = editor.staging.graph;
          const entity = graph.hasEntity(this.entityIds[0]);
          return entity ? l10n.t('issues.close_nodes.message', { way: l10n.displayLabel(entity, graph) }) : '';
        },
        reference: showReference,
        entityIds: [way.id, node1.id, node2.id],
        loc: node1.loc,
        autoArgs: [
          actionTryMergeNodes([node1.id, node2.id]),
          l10n.t('issues.fix.merge_close_vertices.annotation')
        ],
        dynamicFixes: function() {
          return [
            new ValidationFix({
              icon: 'rapid-icon-plus',
              title: l10n.t('issues.fix.merge_points.title'),
              onClick: function() {
                const entityIds = this.issue.entityIds;
                editor.perform(actionMergeNodes([entityIds[1], entityIds[2]]));
                editor.commit({
                  annotation: l10n.t('issues.fix.merge_close_vertices.annotation'),
                  selectedIDs: [ entityIds[1], entityIds[2] ]
                });
              }
            }),
            new ValidationFix({
              icon: 'rapid-operation-disconnect',
              title: l10n.t('issues.fix.move_points_apart.title')
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
          .text(l10n.t('issues.close_nodes.reference'));
      }
    }

  };


  validation.type = type;

  return validation;
}
