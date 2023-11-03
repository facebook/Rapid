
import { actionChangeTags } from '../actions/change_tags';
import { ValidationIssue, ValidationFix } from '../core/lib';
import { utilHashcode } from '@rapid-sdk/util';

/**
 * Ambiguous Crossing Tags: this file is all about resolving ambiguities between crossing ways and their constituent crossing nodes.
 *
 * There are three classes of ambiguity:
 *
 * marked/unmarked - i.e. one is marked and the other is not marked
 * conflicting- both are marked but the markings differ (zebra vs. marked, ladder vs. lines, etc)
 * candidate crossings: nodes without any crossing info that are candidates to be made into crossings
 * *
 */
export function validationAmbiguousCrossingTags(context) {
  const type = 'ambiguous_crossing_tags';
  const editor = context.systems.editor;
  const l10n = context.systems.l10n;


  // Some utility methods.
  function isCrossingHighway(entity) {
    return entity.type === 'way' && entity.tags.footway === 'crossing';
  }

  function isCrossingNode(node) {
    return node.tags.crossing || node.tags.highway === 'crossing';
  }

  function hasMarkings(entity) {
    return (entity.tags.crossing === 'marked' || (entity.tags['crossing:markings'] !== undefined && entity.tags['crossing:markings'] !== 'no'));
  }

  // Crossing node candidate check
  function isCrossingNodeCandidate(node, parentWays) {
    // Can't be a crossing candidate... if it's already marked as crossing.
    if (node.tags.highway === 'crossing') return false;

    // We should only consider node candidates with at least one parent highway that is not a footway.
    const crossings = parentWays.filter(way => way.tags?.highway && !way.tags?.footway);
    return (crossings.length > 0 && parentWays.length > 0);
  }

  // This method performs both the conflicting checks and the marked/unmarked checks, generating fixes for both.
  // Note that 'unmarked' can either mean: explicity unmarked, such as tags like  `crossing=unmarked`, `
  // crossing=unmarked; crossing: markings=no`, or implicitly unmarked, i.e. no marking tag info whatsoever.
  function crossingNodeIssues(entity, graph) {
    let issues = [];
    let currentInfo;

    // Any conflicts where the node and way 'marked' state differs
    let markedUnmarkedConflicts = [];

    // Any conflicts where both node and way are 'marked', but marking differs.
    let markingConflicts = [];
    let nodeUpdateTags;
    let wayUpdateTags;
    let nodeDowngradeTags;
    let wayDowngradeTags;

    // First obtain all the nodes marked as a crossing.
    // We'll check each one.
    const crossingNodes = findCrossingNodes(entity);

    crossingNodes.forEach(crossingNode => {
      graph.parentWays(crossingNode).forEach(parentWay => {
        // The parent way shouldn't be flagged for ambiguous crossings if it's not a crossing.
        if (!parentWay.tags.crossing) return;

        // Can't compare node crossing to way crossing if the way crossing is 'uncontrolled'.
        if (parentWay.tags.crossing === 'uncontrolled' || parentWay.tags.crossing === 'traffic_signals') return;
        // Check to see if the parent way / child node crossing tags conflict.

        // Marked/unmarked abmiguities/conflicts:
        // Marked way with explicitly unmarked or unannotated node
        // Marked node with explicitly unmarked or unannotated way
        // Generate 2 fixes: mark both as unmarked, or both as marked & optionally use marking value (if any)
        if ((parentWay.tags?.crossing !== 'unmarked' && noCrossingMarkings(crossingNode.tags)) ||
          (crossingNode.tags?.crossing !== 'unmarked' && noCrossingMarkings(parentWay.tags))) {
            markedUnmarkedConflicts.push({
            node: crossingNode,
            way: parentWay,
            });
        } else if (hasMarkings(parentWay) && hasMarkings(crossingNode)) {
          // Both marked but with different markings, and therefore conflicting
          if (parentWay.tags['crossing:markings'] !== crossingNode.tags['crossing:markings']) {
            markingConflicts.push({
              node: crossingNode,
              way: parentWay
            });
          }
        }
      });
    });

    function noCrossingMarkings(nodeTags) {
      return nodeTags?.crossing === 'unmarked' || !nodeTags?.crossing;
    }

    // For each marked/unmarked conflict, we'll need to generate two fixes:
    // one to update both entities as 'marked' with the markings already potentially set on the marked entity
    // one to downgrade both entities to being 'unmarked'.
    markedUnmarkedConflicts.forEach(conflictingNodeInfo => {
      currentInfo = conflictingNodeInfo;

      nodeUpdateTags = Object.assign({}, currentInfo.node.tags);
      wayUpdateTags = Object.assign({}, currentInfo.way.tags);

      // Get the markings, favoring the way which is right more often.
      let markingVal = wayUpdateTags['crossing:markings'] || nodeUpdateTags['crossing:markings'];

      // On the chance that the marking value is explicitly unmarked, change it to marked to construct our update tags.
      if (markingVal === 'no') {
        markingVal = 'yes';
      }

      // Calculate the updated tags for both fixes:
      // Set both as crossing:markings=(whatever is set on one of them) and crossing=marked
      nodeUpdateTags['crossing:markings'] = markingVal;
      nodeUpdateTags.crossing = 'marked';
      wayUpdateTags['crossing:markings'] = markingVal;
      wayUpdateTags.crossing = 'marked';

      // Alternatively, figure out the tags to set both as unmarked
      nodeDowngradeTags = Object.assign({}, currentInfo.node.tags);
      wayDowngradeTags = Object.assign({}, currentInfo.way.tags);

      nodeDowngradeTags['crossing:markings'] = 'no';
      nodeDowngradeTags.crossing = 'unmarked';
      wayDowngradeTags['crossing:markings'] = 'no';
      wayDowngradeTags.crossing = 'unmarked';

      const wayMarked = hasMarkings(currentInfo.way);

      // The autofix button can only do one thing- so we'll prefer to use the way tags over the node tags.
      // This is because empirically we see that crossing ways in OSM are tagged with crossing markings much more often than the crossing nodes are.
      // So if the way is already marked, chances are the node just needs to be made the same as the way.
      let autoArgs = [wayMarked ? doMarkBothAsWay : doUnmarkNodeAsWay, l10n.t( hasMarkings(currentInfo.way) ? 'issues.fix.set_both_as_marked.annotation' : 'issues.fix.set_both_as_unmarked.annotation')];

      issues.push(new ValidationIssue(context, {
        type,
        subtype: 'fixme_tag',
        severity: 'warning',
        message: function () {
          const graph = editor.staging.graph;
          const node = graph.hasEntity(this.entityIds[0]);
          const way = graph.hasEntity(this.entityIds[1]);
          return (way && node) ? l10n.tHtml('issues.ambiguous_crossing_tags.message', {
            feature:  l10n.displayLabel(node, graph),
            feature2: l10n.displayLabel(way, graph)
          }) : '';
        },
        reference: showReference,
        entityIds: [ conflictingNodeInfo.node.id, conflictingNodeInfo.way.id ],
        loc: conflictingNodeInfo.node.loc,
        hash: utilHashcode(JSON.stringify(conflictingNodeInfo.node.loc)),
        autoArgs: autoArgs,
        data: {
          wayTags: conflictingNodeInfo.way.tags,
          nodeTags: conflictingNodeInfo.node.tags
        },
        dynamicFixes: makeMarkedUnmarkedFixes
      }));
    });

    markingConflicts.forEach(conflictingMarkingInfo => {
      currentInfo = conflictingMarkingInfo;

      nodeUpdateTags = Object.assign({}, currentInfo.node.tags);
      wayUpdateTags = Object.assign({}, currentInfo.way.tags);

      // Get the markings of both the way and the node, since they are at odds.
      let nodeMarkingVal = nodeUpdateTags['crossing:markings'];
      let wayMarkingVal = wayUpdateTags['crossing:markings'];


      // Special case: If one entity has 'crossing=marked' but no crossing:markings, then we need to remove the other entity's markings as well.
      if (!currentInfo.way.tags['crossing:markings'] || currentInfo.way.tags['crossing:markings'] === '') {
        delete nodeUpdateTags['crossing:markings'];
        nodeUpdateTags.crossing = currentInfo.way.tags.crossing;
      } else if (!currentInfo.node.tags['crossing:markings'] || currentInfo.node.tags['crossing:markings'] === '') {
        delete wayUpdateTags['crossing:markings'];
        wayUpdateTags.crossing = currentInfo.node.tags.crossing;
      }


      // Calculate the updated tags for both fixes:
      // 1) Set node to use the way's markings,
      // 2) Set the way to use the node's markings

      if (wayMarkingVal) {
        nodeUpdateTags['crossing:markings'] = wayMarkingVal;
      }
      if (nodeMarkingVal) {
        wayUpdateTags['crossing:markings'] = nodeMarkingVal;
      }

      // The autofix button can only do one thing- so we'll prefer to use the way tags over the node tags.
      // (See earlier code note about why we prefer the way tags)
      let autoArgs = [doMarkBothAsWay, l10n.t(wayMarkingVal ? 'issues.fix.set_both_as_marked.annotation' : 'issues.fix.set_both_as_unmarked.annotation')];


      issues.push(new ValidationIssue(context, {
        type,
        subtype: 'fixme_tag',
        severity: 'error',
        message: function () {
          const graph = editor.staging.graph;
          const node = graph.hasEntity(this.entityIds[0]);
          const way = graph.hasEntity(this.entityIds[1]);
          return l10n.tHtml('issues.ambiguous_crossing_tags.message_markings', {
            feature: l10n.displayLabel(node, graph),
            feature2: l10n.displayLabel(way, graph)
          });
        },
        reference: showReference,
        entityIds: [
          conflictingMarkingInfo.node.id,
          conflictingMarkingInfo.way.id,
        ],
        loc: conflictingMarkingInfo.node.loc,
        hash: utilHashcode(JSON.stringify(conflictingMarkingInfo.node.loc)),
        autoArgs: autoArgs,
        data: {
          wayTags: conflictingMarkingInfo.way.tags,
          nodeTags: conflictingMarkingInfo.node.tags
        },
        dynamicFixes: makeConflictingMarkingFixes
      }));
    });

    return issues;

    /**
     *
     * @param {*} way
     * @returns a list of nodes in that way that have crossing markings
     */
    function findCrossingNodes(way) {
      let results = [];
      way.nodes.forEach(nodeID => {
        const node = graph.entity(nodeID);

        if (!isCrossingNode(node)) return;

        results.push(node);
      });
      return results;
    }


    function makeConflictingMarkingFixes() {
      let fixes = [];
      const graph = editor.staging.graph;

      const parentWay = graph.hasEntity(this.entityIds[1]);
      const node = graph.hasEntity(this.entityIds[0]);

      // Only display this fix if the node markings are present
      if (node.tags['crossing:markings']) {
        fixes.push(
          new ValidationFix({
            icon: 'rapid-icon-crossing',
            title: getTitle(node.tags),
            onClick: () => {
              const annotation = l10n.t('issues.fix.set_both_as_marked.annotation');
              editor.perform(doMarkBothAsNode, annotation);
              editor.commit({ annotation: annotation, selectedIDs: context.selectedIDs() });
            }
          })
        );
      }
      // Similarly, only display this fix if the way markings are present
      if (parentWay.tags['crossing:markings']) {
        fixes.push(
          new ValidationFix({
            icon: 'rapid-icon-crossing',
            title: getTitle(parentWay.tags),
            onClick: () => {
              const annotation = l10n.t(
                'issues.fix.set_both_as_marked.annotation'
              );
              editor.perform(doMarkBothAsWay, annotation);
              editor.commit({ annotation: annotation, selectedIDs: context.selectedIDs() });
            }
          },
          )
        );
      }

      function getTitle(tags) {
          return l10n.tHtml('issues.fix.set_both_as_marked.title_use_marking', {
            marking: tags['crossing:markings']
          });
      }


      return fixes;
    }

    function doMarkBothAsNode() {
      return actionChangeTags(currentInfo.way.id, wayUpdateTags)(graph);
    }


    function doMarkBothAsWay() {
      return actionChangeTags(currentInfo.node.id, nodeUpdateTags)(graph);
    }



    function doUnmarkNodeAsWay() {
      return actionChangeTags(currentInfo.node.id, nodeDowngradeTags)(graph);
    }

    function makeMarkedUnmarkedFixes() {
      let fixes = [];
      const graph = editor.staging.graph;  // I think we use staging graph for dynamic fixes?
      const parentWay = graph.hasEntity(this.entityIds[1]);

      if (parentWay) {
        fixes.push(
          new ValidationFix({
            icon: 'rapid-icon-crossing',
            title: l10n.tHtml('issues.fix.set_both_as_marked.title'),
            onClick:  () => {
              const annotation = l10n.t('issues.fix.set_both_as_marked.annotation');
              editor.perform(actionChangeTags(currentInfo.node.id, nodeUpdateTags));
              editor.perform(actionChangeTags(currentInfo.way.id, wayUpdateTags));
              editor.commit({ annotation: annotation, selectedIDs: context.selectedIDs() });
            }
          })
        );

        fixes.push(
          new ValidationFix({
            icon: 'rapid-icon-crossing',
            title: l10n.tHtml('issues.fix.set_both_as_unmarked.title'),
            onClick: function () {

              const annotation = l10n.t('issues.fix.set_both_as_unmarked.annotation');
              editor.perform(actionChangeTags(currentInfo.node.id, nodeDowngradeTags));
              editor.perform(actionChangeTags(currentInfo.way.id, wayDowngradeTags));
              editor.commit({ annotation: annotation, selectedIDs: context.selectedIDs() });
            }
          })
        );
      }


      return fixes;
    }

    function showReference(selection) {
      let enter = selection.selectAll('.issue-reference')
        .data([0])
        .enter();

      enter
        .append('div')
        .attr('class', 'issue-reference')
        .html(l10n.tHtml('issues.ambiguous_crossing_tags.reference'));
    }
  }


  // This method performs the crossing node candidate check. This check attempts to find normal nodes in a crossing way that are potentials to upgrade into crossing nodes.
  // Not all the nodes found with this validation need to be upgraded, it is merely to call attention to the potential for missing crossing information.
  function crossingNodeCandidateIssues(entity, graph) {
    let issues = [];
    let currentNodeInfo;
    let candidateNodeInfos = [];
    // Now, find all the nodes that aren't marked as crossings, but are *actually* crossings of at least one footway.
    const crossingNodeCandidates = findCrossingNodeCandidates(entity);


    crossingNodeCandidates.forEach(node => {
      const parentWays = graph.parentWays(node);

      const parentCrossingWay = parentWays.filter(way => way.tags?.footway === 'crossing')[0];
      if (parentCrossingWay) {
        candidateNodeInfos.push({
          node: node,
          way:parentCrossingWay
        });
      }
    });

    // For each crossing candidate...
    candidateNodeInfos.forEach(candidateNodeInfo => {
      currentNodeInfo = candidateNodeInfo;
      let autoArgs = [doTagUpgrade, l10n.t('issues.fix.set_both_as_marked.annotation')];

      issues.push(new ValidationIssue(context, {
        type,
        subtype: 'fixme_tag',
        severity: 'warning',
        message: function () {
          const graph = editor.staging.graph;
          const way = graph.hasEntity(this.entityIds[1]);
          return l10n.tHtml('issues.ambiguous_crossing_tags.incomplete_message', {
            feature: l10n.displayLabel(way, graph)
          });
        },
        reference: showReference,
        entityIds: [
          candidateNodeInfo.node.id,
          candidateNodeInfo.way.id,
        ],
        loc: candidateNodeInfo.node.loc,
        hash: utilHashcode(JSON.stringify(candidateNodeInfo.node.loc)),
        autoArgs: autoArgs,
        data: {
          wayTags: candidateNodeInfo.way.tags,
          nodeTags: candidateNodeInfo.node.tags
        },
        dynamicFixes: makeCandidateFixes
      }));
    });

    return issues;


    /**
     * @param {*} way
     * @returns a list of nodes in that way that don't have crossing markings, but have multiple parent ways, one of which is a crossing way
     */
    function findCrossingNodeCandidates(way) {
      let results = [];
      way.nodes.forEach((nodeID, index) => {

        if (index === 0 || index === way.nodes.length - 1) {
          // only evaluate 'inner' nodes, not the ends.
          return;
        }
        const node = graph.entity(nodeID);

        if (!isCrossingNodeCandidate(node, graph.parentWays(node))) return;

        results.push(node);
      });

      return results;
    }


    function makeCandidateFixes() {
      let fixes = [];

      fixes.push(
        new ValidationFix({
          icon: 'rapid-icon-crossing',
          title: l10n.tHtml('issues.fix.set_both_as_marked.title'),
          onClick: function () {
            const annotation = l10n.t('issues.fix.set_both_as_marked.annotation');
            editor.perform(doTagUpgrade);
            editor.commit({ annotation: annotation, selectedIDs: context.selectedIDs() });
          }
        })
      );

      return fixes;
    }

    function doTagUpgrade(graph) {
      const node = currentNodeInfo.node;
      const way = currentNodeInfo.way;
      if (!node || !way) return;

      const wayTags = way.tags;
      let tags = Object.assign({}, node.tags);

      // At the very least, we need to make the node into a crossing node
      tags.highway = 'crossing';
      if (wayTags.crossing) {
        tags.crossing = wayTags.crossing;
      }
      if (wayTags['crossing:markings']) {
        tags['crossing:markings'] = wayTags['crossing:markings'];
      }
      tags.highway = 'crossing';
      return actionChangeTags(node.id, tags)(graph);
    }

    function showReference(selection) {
      selection.selectAll('.issue-reference')
        .data([0])
        .enter()
        .append('div')
        .attr('class', 'issue-reference')
        .html(l10n.tHtml('issues.ambiguous_crossing_tags.reference'));
    }
  }

  let validation = function checkAmbiguousCrossingTags(entity, graph) {
    if (!isCrossingHighway(entity)) return [];
    if (entity.isDegenerate()) return [];

    let issues = crossingNodeIssues(entity, graph);
    let candidateIssues = crossingNodeCandidateIssues(entity, graph);

    issues = [...issues, ...candidateIssues];

    return issues;
  };

  validation.type = type;

  return validation;
}
