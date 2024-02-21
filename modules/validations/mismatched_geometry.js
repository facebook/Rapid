import { geoSphericalDistance } from '@rapid-sdk/math';
import { utilTagText } from '@rapid-sdk/util';
import deepEqual from 'fast-deep-equal';

import { actionAddVertex } from '../actions/add_vertex.js';
import { actionChangeTags } from '../actions/change_tags.js';
import { actionMergeNodes } from '../actions/merge_nodes.js';
import { actionExtract } from '../actions/extract.js';
import { osmJoinWays } from '../osm/multipolygon.js';
import { osmNodeGeometriesForTags, osmTagSuggestingArea } from '../osm/tags.js';
import { geoHasSelfIntersections } from '../geo/index.js';
import { ValidationIssue, ValidationFix } from '../core/lib/index.js';


export function validationMismatchedGeometry(context) {
    const type = 'mismatched_geometry';
    const editor = context.systems.editor;
    const l10n = context.systems.l10n;
    const presets = context.systems.presets;

    function tagSuggestingLineIsArea(entity) {
        if (entity.type !== 'way' || entity.isClosed()) return null;

        const tagSuggestingArea = entity.tagSuggestingArea();
        if (!tagSuggestingArea) {
            return null;
        }

        const linePreset = presets.matchTags(tagSuggestingArea, 'line');
        const areaPreset = presets.matchTags(tagSuggestingArea, 'area');

        if (linePreset && areaPreset) {
            // If the same preset allows both lines and areas (e.g. barrier), ignore
            if (linePreset === areaPreset) return null;

            // If the presets match something like '*', (e.g. attraction), ignore
            const key = Object.keys(tagSuggestingArea)[0];
            if (linePreset.tags[key] === '*' || areaPreset.tags[key === '*']) return null;
        }

        return tagSuggestingArea;
    }


    function makeConnectEndpointsFixOnClick(way, graph) {
        // must have at least three nodes to close this automatically
        if (way.nodes.length < 3) return null;

        var nodes = graph.childNodes(way);
        var testNodes;
        var firstToLastDistanceMeters = geoSphericalDistance(nodes[0].loc, nodes[nodes.length-1].loc);

        // if the distance is very small, attempt to merge the endpoints
        if (firstToLastDistanceMeters < 0.75) {
            testNodes = nodes.slice();   // shallow copy
            testNodes.pop();
            testNodes.push(testNodes[0]);
            // make sure this will not create a self-intersection
            if (!geoHasSelfIntersections(testNodes, testNodes[0].id)) {
              return function() {
                const graph = editor.staging.graph;
                const way = graph.entity(this.issue.entityIds[0]);
                editor.perform(actionMergeNodes([way.nodes[0], way.nodes[way.nodes.length-1]], nodes[0].loc));
                editor.commit({
                  annotation: l10n.t('issues.fix.connect_endpoints.annotation'),
                  selectedIDs: [way.id]
                });
              };
            }
        }

        // if the points were not merged, attempt to close the way
        testNodes = nodes.slice();   // shallow copy
        testNodes.push(testNodes[0]);
        // make sure this will not create a self-intersection
        if (!geoHasSelfIntersections(testNodes, testNodes[0].id)) {
            return function() {
                const wayID = this.issue.entityIds[0];
                const graph = editor.staging.graph;
                const way = graph.entity(wayID);
                const nodeID = way.nodes[0];
                const index = way.nodes.length;
                editor.perform(actionAddVertex(wayID, nodeID, index));
                editor.commit({
                  annotation: l10n.t('issues.fix.connect_endpoints.annotation'),
                  selectedIDs: [wayID]
                });
            };
        }
    }

    function lineTaggedAsAreaIssue(entity) {
        var tagSuggestingArea = tagSuggestingLineIsArea(entity);
        if (!tagSuggestingArea) return null;

        return new ValidationIssue(context, {
            type: type,
            subtype: 'area_as_line',
            severity: 'warning',
            message: function() {
                const graph = editor.staging.graph;
                const entity = graph.hasEntity(this.entityIds[0]);
                return entity ? l10n.t('issues.tag_suggests_area.message', {
                    feature: l10n.displayLabel(entity, 'area', true),   // true = verbose
                    tag: utilTagText({ tags: tagSuggestingArea })
                }) : '';
            },
            reference: showReference,
            entityIds: [entity.id],
            hash: JSON.stringify(tagSuggestingArea),
            dynamicFixes: function() {
                const graph = editor.staging.graph;
                var fixes = [];
                var entity = graph.entity(this.entityIds[0]);
                var connectEndsOnClick = makeConnectEndpointsFixOnClick(entity, graph);

                fixes.push(new ValidationFix({
                    title: l10n.t('issues.fix.connect_endpoints.title'),
                    onClick: connectEndsOnClick
                }));

                fixes.push(new ValidationFix({
                    icon: 'rapid-operation-delete',
                    title: l10n.t('issues.fix.remove_tag.title'),
                    onClick: function() {
                        const entityID = this.issue.entityIds[0];
                        const graph = editor.staging.graph;
                        const entity = graph.entity(entityID);
                        const tags = Object.assign({}, entity.tags);  // shallow copy
                        for (var key in tagSuggestingArea) {
                            delete tags[key];
                        }
                        editor.perform(actionChangeTags(entityID, tags));
                        editor.commit({
                          annotation: l10n.t('issues.fix.remove_tag.annotation'),
                          selectedIDs: [entityID]
                        });
                    }
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
                .text(l10n.t('issues.tag_suggests_area.reference'));
        }
    }

    function vertexPointIssue(entity, graph) {
        // we only care about nodes
        if (entity.type !== 'node') return null;

        // ignore tagless points
        if (Object.keys(entity.tags).length === 0) return null;

        // address lines are special so just ignore them
        if (entity.isOnAddressLine(graph)) return null;

        var geometry = entity.geometry(graph);
        var allowedGeometries = osmNodeGeometriesForTags(entity.tags);

        if (geometry === 'point' && !allowedGeometries.point && allowedGeometries.vertex) {

            return new ValidationIssue(context, {
                type: type,
                subtype: 'vertex_as_point',
                severity: 'warning',
                message: function() {
                    const graph = editor.staging.graph;
                    const entity = graph.hasEntity(this.entityIds[0]);
                    return entity ? l10n.t('issues.vertex_as_point.message', {
                        feature: l10n.displayLabel(entity, 'vertex', true /* verbose */)
                    }) : '';
                },
                reference: function showReference(selection) {
                    selection.selectAll('.issue-reference')
                        .data([0])
                        .enter()
                        .append('div')
                        .attr('class', 'issue-reference')
                        .text(l10n.t('issues.vertex_as_point.reference'));
                },
                entityIds: [entity.id]
            });

        } else if (geometry === 'vertex' && !allowedGeometries.vertex && allowedGeometries.point) {

            return new ValidationIssue(context, {
                type: type,
                subtype: 'point_as_vertex',
                severity: 'warning',
                message: function() {
                    const graph = editor.staging.graph;
                    const entity = graph.hasEntity(this.entityIds[0]);
                    return entity ? l10n.t('issues.point_as_vertex.message', {
                        feature: l10n.displayLabel(entity, 'point', true /* verbose */)
                    }) : '';
                },
                reference: function showReference(selection) {
                    selection.selectAll('.issue-reference')
                        .data([0])
                        .enter()
                        .append('div')
                        .attr('class', 'issue-reference')
                        .text(l10n.t('issues.point_as_vertex.reference'));
                },
                entityIds: [entity.id],
                dynamicFixes: extractPointDynamicFixes
            });
        }

        return null;
    }


    function otherMismatchIssue(entity, graph) {
        // ignore boring features
        if (!entity.hasInterestingTags()) return null;

        if (entity.type !== 'node' && entity.type !== 'way') return null;

        // address lines are special so just ignore them
        if (entity.type === 'node' && entity.isOnAddressLine(graph)) return null;

        var sourceGeom = entity.geometry(graph);

        var targetGeoms = entity.type === 'way' ? ['point', 'vertex'] : ['line', 'area'];

        if (sourceGeom === 'area') targetGeoms.unshift('line');

        var asSource = presets.match(entity, graph);

        var targetGeom = targetGeoms.find(nodeGeom => {
            var asTarget = presets.matchTags(entity.tags, nodeGeom);
            // sometimes there are two presets with the same tags for different geometries
            if (!asSource || !asTarget || asSource === asTarget || deepEqual(asSource.tags, asTarget.tags)) return false;

            if (asTarget.isFallback()) return false;

            var primaryKey = Object.keys(asTarget.tags)[0];

            // special case: buildings-as-points not suggested by presets, but common in OSM, so ignore them
            if (primaryKey === 'building') return false;

            if (asTarget.tags[primaryKey] === '*') return false;

            return asSource.isFallback() || asSource.tags[primaryKey] === '*';
        });

        if (!targetGeom) return null;

        var subtype = targetGeom + '_as_' + sourceGeom;

        if (targetGeom === 'vertex') targetGeom = 'point';
        if (sourceGeom === 'vertex') sourceGeom = 'point';

        var referenceId = targetGeom + '_as_' + sourceGeom;

        var dynamicFixes;
        if (targetGeom === 'point') {
            dynamicFixes = extractPointDynamicFixes;

        } else if (sourceGeom === 'area' && targetGeom === 'line') {
            dynamicFixes = lineToAreaDynamicFixes;
        }

        return new ValidationIssue(context, {
            type: type,
            subtype: subtype,
            severity: 'warning',
            message: function() {
                const graph = editor.staging.graph;
                const entity = graph.hasEntity(this.entityIds[0]);
                return entity ? l10n.t('issues.' + referenceId + '.message', {
                    feature: l10n.displayLabel(entity, targetGeom, true /* verbose */)
                }) : '';
            },
            reference: function showReference(selection) {
                selection.selectAll('.issue-reference')
                    .data([0])
                    .enter()
                    .append('div')
                    .attr('class', 'issue-reference')
                    .text(l10n.t('issues.mismatched_geometry.reference'));
            },
            entityIds: [entity.id],
            dynamicFixes: dynamicFixes
        });
    }


    /**
     * lineToAreaDynamicFixes
     */
    function lineToAreaDynamicFixes() {
      let convertOnClick = null;
      const entityID = this.entityIds[0];
      const graph = editor.staging.graph;
      const entity = graph.entity(entityID);
      const tags = Object.assign({}, entity.tags);  // shallow copy
      delete tags.area;

      if (!osmTagSuggestingArea(tags)) {
        // if removing the area tag would make this a line, offer that as a quick fix
        convertOnClick = function() {
          const entityID = this.issue.entityIds[0];
          const graph = editor.staging.graph;
          const entity = graph.entity(entityID);
          const tags = Object.assign({}, entity.tags);  // shallow copy
          if (tags.area) {
            delete tags.area;
          }
          editor.perform(actionChangeTags(entityID, tags));
          editor.commit({
            annotation: l10n.t('issues.fix.convert_to_line.annotation'),
            selectedIDs: [entityID]
          });
        };
      }

      return [
        new ValidationFix({
          icon: 'rapid-icon-line',
          title: l10n.t('issues.fix.convert_to_line.title'),
          onClick: convertOnClick
        })
      ];
    }


    /**
     * extractPointDynamicFixes
     */
    function extractPointDynamicFixes() {
      let extractOnClick = null;
      const entityID = this.entityIds[0];

      if (!context.hasHiddenConnections(entityID)) {
        extractOnClick = function() {
          const entityID = this.issue.entityIds[0];
          const action = actionExtract(entityID, context.viewport);
          editor.perform(action);
          editor.commit({
            annotation: l10n.t('operations.extract.annotation', { n: 1 }),
            selectedIDs: [entityID]
          });
          // re-enter mode to trigger updates
          context.enter('select-osm', { selection: { osm: [ action.getExtractedNodeID() ] }} );
        };
      }

      return [
        new ValidationFix({
          icon: 'rapid-operation-extract',
          title: l10n.t('issues.fix.extract_point.title'),
          onClick: extractOnClick
        })
      ];
    }


    function unclosedMultipolygonPartIssues(entity, graph) {
        if (entity.type !== 'relation' ||
            !entity.isMultipolygon() ||
            entity.isDegenerate() ||
            // cannot determine issues for incompletely-downloaded relations
            !entity.isComplete(graph)) return [];

        var sequences = osmJoinWays(entity.members, graph);
        var issues = [];

        for (var i in sequences) {
            var sequence = sequences[i];

            if (!sequence.nodes) continue;

            var firstNode = sequence.nodes[0];
            var lastNode = sequence.nodes[sequence.nodes.length - 1];

            // part is closed if the first and last nodes are the same
            if (firstNode === lastNode) continue;

            var issue = new ValidationIssue(context, {
                type: type,
                subtype: 'unclosed_multipolygon_part',
                severity: 'warning',
                message: function() {
                    const graph = editor.staging.graph;
                    const entity = graph.hasEntity(this.entityIds[0]);
                    return entity ? l10n.t('issues.unclosed_multipolygon_part.message', {
                        feature: l10n.displayLabel(entity, graph, true /* verbose */)
                    }) : '';
                },
                reference: showReference,
                loc: sequence.nodes[0].loc,
                entityIds: [entity.id],
                hash: sequence.map(function(way) {
                    return way.id;
                }).join()
            });
            issues.push(issue);
        }

        return issues;

        function showReference(selection) {
            selection.selectAll('.issue-reference')
                .data([0])
                .enter()
                .append('div')
                .attr('class', 'issue-reference')
                .text(l10n.t('issues.unclosed_multipolygon_part.reference'));
        }
    }

    var validation = function checkMismatchedGeometry(entity, graph) {
        var vertexPoint = vertexPointIssue(entity, graph);
        if (vertexPoint) return [vertexPoint];

        var lineAsArea = lineTaggedAsAreaIssue(entity);
        if (lineAsArea) return [lineAsArea];

        var mismatch = otherMismatchIssue(entity, graph);
        if (mismatch) return [mismatch];

        return unclosedMultipolygonPartIssues(entity, graph);
    };

    validation.type = type;

    return validation;
}
