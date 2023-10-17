
import { actionChangeTags } from '../actions/change_tags';
import { osmRoutableHighwayTagValues } from '../osm/tags';
import { ValidationIssue, ValidationFix } from '../core/lib';


/**
 * Look for roads with crossing nodes whose crossing markings conflict/are ambiguous:
 * a road that is 'unmarked' should not have a crossing node with markings, and vice versa.
 * Also flag nodes without crossing info, but who have at least one parent way with crossing information 'candidate'
 */
export function validationAmbiguousCrossingTags(context) {
  const type = 'ambiguous_crossing_tags';
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

  const validation = function checkAmbiguousCrossingTags(entity, graph) {
    if (!isCrossingHighway(entity)) return [];
    if (entity.isDegenerate()) return [];

    //First obtain all the nodes marked as a crossing.
    const crossingNodes = findCrossingNodes(entity);

    //Now, find all the nodes that aren't marked as crossings, but are *actually* crossings of at least one footway.
    const crossingNodeCandidates = findCrossingNodeCandidates(entity);

    let issues = [];

    let conflictingNodeInfos = [];
    let candidateNodeInfos = [];

    crossingNodes.forEach(crossingNode => {
      const parentWays = graph.parentWays(crossingNode);

      parentWays.forEach(parentWay => {

        //The parent way shouldn't be flagged for ambiguous crossings if it's not a crossing.
        if (!parentWay.tags.crossing) return;

        //Can't compare node crossing to way crossing if the way crossing is 'uncontrolled'.
        if (parentWay.tags.crossing === 'uncontrolled' || parentWay.tags.crossing === 'traffic_signals') return;
        //Check to see if the parent way / child node crossing tags conflict.
        if ((parentWay.tags?.crossing !== 'unmarked' && crossingNode.tags?.crossing === 'unmarked') ||
          (parentWay.tags?.crossing !== 'marked' && crossingNode.tags?.crossing === 'marked')) {
            conflictingNodeInfos.push({
            node: crossingNode,
            way: parentWay,
          });
        }
      });

    });

    conflictingNodeInfos.forEach(conflictingNodeInfo => {
      issues.push(new ValidationIssue(context, {
        type,
        subtype: 'fixme_tag',
        severity: 'warning',
        message: function () {
          const node = context.hasEntity(this.entityIds[0]);
          const way = context.hasEntity(this.entityIds[1]);
          return l10n.tHtml('issues.ambiguous_crossing_tags.message', {
            feature: l10n.displayLabel(node, context.graph()),
            feature2: l10n.displayLabel(way, context.graph())
          });
        },
        reference: showReference,
        entityIds: [
          conflictingNodeInfo.node.id,
          conflictingNodeInfo.way.id,
        ],
        loc: conflictingNodeInfo.node.loc,
        hash: JSON.stringify(conflictingNodeInfo.node.loc),
        data: {
          wayTags: conflictingNodeInfo.way.tags,
          nodeTags: conflictingNodeInfo.node.tags
        },
        dynamicFixes: makeFixes
      }));
    });

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
      issues.push(new ValidationIssue(context, {
        type,
        subtype: 'fixme_tag',
        severity: 'warning',
        message: function () {
          const way = context.hasEntity(this.entityIds[1]);
          return l10n.tHtml('issues.ambiguous_crossing_tags.incomplete_message', {
            feature: l10n.displayLabel(way, context.graph())
          });
        },
        reference: showReference,
        entityIds: [
          candidateNodeInfo.node.id,
          candidateNodeInfo.way.id,
        ],
        loc: candidateNodeInfo.node.loc,
        hash: JSON.stringify(candidateNodeInfo.node.loc),
        data: {
          wayTags: candidateNodeInfo.way.tags,
          nodeTags: candidateNodeInfo.node.tags
        },
        dynamicFixes: makeCandidateFixes
      }));
    });

    return issues;

    function makeFixes() {
      let fixes = [];
      const parentWay = context.hasEntity(this.entityIds[1]);

      if (parentWay) {
        fixes.push(
          new ValidationFix({
            icon: 'rapid-icon-crossing',
            title: l10n.tHtml('issues.fix.use_crossing_tags_from_way.title'),
            onClick: function () {
              const annotation = l10n.t(issues.fix.use_crossing_tags_from_way.annotation);
              const [nodeId, parentWayId] = this.issue.entityIds;

              const tags = Object.assign({}, context.entity(parentWayId).tags);

              Object.keys(tags).forEach(tag => {
                if ((tag === 'crossing') || (tag === 'crossing:markings')) {
                  return;
                }
                delete tags.tag;
              });

              context.perform(
                actionChangeTags(nodeId, tags),
                annotation
              );
            }
          })
        );

        fixes.push(
          new ValidationFix({
            icon: 'rapid-icon-point',
            title: l10n.tHtml('issues.fix.use_crossing_tags_from_node.title'),
            onClick: function () {
              const annotation = l10n.t(
                'issues.fix.use_crossing_tags_from_node.annotation'
              );
              const [nodeId, parentWayId] = this.issue.entityIds;


              const tags = Object.assign({}, context.entity(nodeId).tags);

              Object.keys(tags).forEach(tag => {
                if ((tag === 'crossing') || (tag === 'crossing:markings')) {
                  return;
                }
                delete tags.tag;
              });

              context.perform(
                actionChangeTags(parentWayId, tags),
                annotation
              );
            }
          },
          )
        );
      }

      return fixes;
    }

    function makeCandidateFixes() {
      let fixes = [];
      const parentWay = context.hasEntity(this.entityIds[1]);

        fixes.push(
          new ValidationFix({
            icon: 'rapid-icon-crossing',
            title: l10n.tHtml('issues.fix.use_crossing_tags_from_way.title'),
            onClick: function () {
              const annotation = l10n.t('issues.fix.use_crossing_tags_from_way.annotation');
              const [ nodeId, parentWayId] = this.issue.entityIds;

              const wayTags = context.entity(parentWayId).tags;

              let tags = {};

              //At the very least, we need to make the node into a crossing node
              tags.highway = 'crossing';
              if (wayTags.crossing) {
                tags.crossing = wayTags.crossing;
              }
              if (wayTags['crossing:markings']) {
                tags['crossing:markings'] = wayTags['crossing:markings'];
              }
              tags.highway = 'crossing';

              context.perform(
                actionChangeTags(nodeId, tags),
                annotation
              );
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

    /**
     *
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
    function hasTag(tags, key) {
      return tags[key] !== undefined && tags[key] !== 'no';
    }

  };

  validation.type = type;

  return validation;
}
