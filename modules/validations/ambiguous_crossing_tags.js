
import { actionChangeTags } from '../actions/change_tags';
import { ValidationIssue, ValidationFix } from '../core/lib';
import { utilHashcode, utilTagDiff } from '@rapid-sdk/util';

/**
 * Look for roads with crossing nodes whose crossing markings conflict/are ambiguous:
 * a road that is 'unmarked' should not have a crossing node with markings, and vice versa.
 * Also flag nodes without crossing info, but who have at least one parent way with crossing information 'candidate'
 */
export function validationAmbiguousCrossingTags(context) {
  const type = 'ambiguous_crossing_tags';
  const editor = context.systems.editor;
  const l10n = context.systems.l10n;


  function isCrossingHighway(entity) {
    return entity.type === 'way' && entity.tags.footway === 'crossing';
  }

  function isCrossingNode(node) {
    return node.tags.crossing;
  }


  function isCrossingNodeCandidate(node, parentWays) {
    //Can't be a crossing candidate... if it's already marked as crossing.
    if (node.tags.highway === 'crossing') return false;

    // We should only consider node candidates with at least one parent highway that is not a footway.
    const crossings = parentWays.filter(way => way.tags?.highway && !way.tags?.footway);
    return (crossings.length > 0 && parentWays.length > 0);
  }

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
    let wayTagDiff;
    let nodeTagDiff;

    //First obtain all the nodes marked as a crossing.
    const crossingNodes = findCrossingNodes(entity);

    crossingNodes.forEach(crossingNode => {
      graph.parentWays(crossingNode).forEach(parentWay => {
        // The parent way shouldn't be flagged for ambiguous crossings if it's not a crossing.
        if (!parentWay.tags.crossing) return;

        // Can't compare node crossing to way crossing if the way crossing is 'uncontrolled'.
        if (parentWay.tags.crossing === 'uncontrolled' || parentWay.tags.crossing === 'traffic_signals') return;
        //Check to see if the parent way / child node crossing tags conflict.

        // Marked/unmarked abmiguities/conflicts:
        //Marked node with explicitly unmarked way
        //marked node with unannotated way
        //Marked way with explicitly unmarked node
        //Marked way with unannotated node
        //Generate 2 fixes: mark both as marked, or both as unmarked, optionally use marking value (if any)
        if ((parentWay.tags?.crossing !== 'unmarked' && crossingNode.tags?.crossing === 'unmarked') ||
          (parentWay.tags?.crossing !== 'marked' && crossingNode.tags?.crossing === 'marked')) {
            markedUnmarkedConflicts.push({
            node: crossingNode,
            way: parentWay,
            });
        } else if (parentWay.tags.crossing === 'marked' && crossingNode.tags?.crossing === 'marked') {
          //Both marked but with different markings, and therefore conflicting
          if (parentWay.tags['crossing:markings'] !== crossingNode.tags['crossing:markings']) {
            markingConflicts.push({
              node: crossingNode,
              way: parentWay
            });
          }
        }
      });
    });

    markedUnmarkedConflicts.forEach(conflictingNodeInfo => {
      currentInfo = conflictingNodeInfo;

      nodeUpdateTags = Object.assign({}, currentInfo.node.tags);
      wayUpdateTags = Object.assign({}, currentInfo.way.tags);

      //Get the markings, favoring the way which is right more often.
      let markingVal = wayUpdateTags['crossing:markings'] || nodeUpdateTags['crossing:markings'];

      if (markingVal === 'no') {
        markingVal = 'yes';
      }

      // Calculate the updated tags for both fixes:
      // Set both as crossing:markings=(whatever is set on one of them) and crossing=marked
      nodeUpdateTags['crossing:markings'] = markingVal;
      nodeUpdateTags.crossing = 'marked';
      wayUpdateTags['crossing:markings'] = markingVal;
      wayUpdateTags.crossing = 'marked';

      //Alternatively, figure out the tags to set both as unmarked

      nodeDowngradeTags = Object.assign({}, currentInfo.node.tags);
      wayDowngradeTags = Object.assign({}, currentInfo.way.tags);

      nodeDowngradeTags['crossing:markings'] = 'none';
      nodeDowngradeTags.crossing = 'unmarked';
      wayDowngradeTags['crossing:markings'] = 'none';
      wayDowngradeTags.crossing = 'unmarked';
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
        hash:  utilHashcode(JSON.stringify(conflictingNodeInfo.node.loc)),
        data: {
          wayTags: conflictingNodeInfo.way.tags,
          nodeTags: conflictingNodeInfo.node.tags
        },
        dynamicFixes: makeFixes
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

      issues.push(new ValidationIssue(context, {
        type,
        subtype: 'fixme_tag',
        severity: 'warning',
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
        hash:  utilHashcode(JSON.stringify(conflictingMarkingInfo.node.loc)),
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


      function doMarkBothAsNode() {
        return actionChangeTags(currentInfo.way.id, wayUpdateTags)(graph);
      }


      function doMarkBothAsWay() {
        return actionChangeTags(currentInfo.node.id, nodeUpdateTags)(graph);
      }

      return fixes;
    }

    function makeFixes() {
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


  function crossingNodeCandidateIssues(entity, graph) {
    let issues = [];
    let currentNodeInfo;
    let candidateNodeInfos = [];
    //Now, find all the nodes that aren't marked as crossings, but are *actually* crossings of at least one footway.
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


    candidateNodeInfos.forEach(candidateNodeInfo => {
      currentNodeInfo = candidateNodeInfo;
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
          //only evaluate 'inner' nodes, not the ends.
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
      const graph = editor.staging.graph;  // I think we use staging graph in dynamic fixes?
      const parentWay = graph.hasEntity(this.entityIds[1]);

      fixes.push(
        new ValidationFix({
          icon: 'rapid-icon-crossing',
          title: l10n.tHtml('issues.fix.set_both_as_marked.title'),
          onClick: function () {
            const graph = editor.staging.graph;
            const [nodeID, wayID] = this.issue.entityIds;
            const node = graph.hasEntity(nodeID);
            const way = graph.hasEntity(wayID);
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


            const annotation = l10n.t('issues.fix.set_both_as_marked.annotation');
            editor.perform(actionChangeTags(nodeID, tags));
            editor.commit({ annotation: annotation, selectedIDs: context.selectedIDs() });
          }
        })
      );

      return fixes;
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
