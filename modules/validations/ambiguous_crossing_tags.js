import { select as d3_select } from 'd3-selection';
import { utilTagDiff } from '@rapid-sdk/util';

import { actionChangePreset, actionChangeTags, actionSyncCrossingTags } from '../actions';
import { Difference, ValidationIssue, ValidationFix } from '../core/lib';


/**
 * validationAmbiguousCrossingTags
 * This file is all about resolving ambiguities between crossing ways and their constituent crossing nodes.
 *
 * There are three classes of ambiguity:
 * - candidate crossings: nodes without any crossing info that are candidates to be made into crossings
 * - marked/unmarked - i.e. one is marked and the other is not marked
 * - conflicting - both are marked but the markings differ (zebra vs. marked, ladder vs. lines, etc)
 */
export function validationAmbiguousCrossingTags(context) {
  const type = 'ambiguous_crossing';
  const editor = context.systems.editor;
  const l10n = context.systems.l10n;
  const presets = context.systems.presets;

  // These checks will be run on the parent way.
  const validation = function checkAmbiguousCrossingTags(entity, graph) {
    if (entity.type !== 'way' || entity.isDegenerate()) return [];

    const tagIssues = detectCrossingTagIssues(entity, graph);
    const candidateIssues = detectCrossingCandidateIssues(entity, graph);

    return [...tagIssues, ...candidateIssues];
  };


  /**
   * actionUpdateCrossingTags
   * Upgrades the preset if possible, then syncs the crossing tags.
   * This is like `outdated_tags.js`, but we take things further here.
   * @param  {string}   wayID  - The Way with the tags that should be checked
   * @return {Function} The Action function, accepts a Graph and returns a modified Graph
   */
  function actionUpdateCrossing(wayID) {
    return graph => {
      const way = graph.entity(wayID);
      const currPreset = presets.match(way, graph);
      const replacementID = currPreset.replacement;
      const replacement = replacementID && presets.item(replacementID);

      if (replacement) {
        graph = actionChangePreset(wayID, currPreset, replacement, true /* skip field defaults */)(graph);
        // `actionChangePreset` also does `actionSyncCrossingTags`, so we don't have to call it here.
      } else {
        graph = actionSyncCrossingTags(wayID)(graph);
      }

      return graph;
    };
  }


  /**
   * actionCandidateToCrossing
   * Converts the given "candidate" nodeID to a crossing along the given wayID
   * @param  {string}   nodeID - The Node to make into a crossing
   * @param  {string}   wayID  - The parent Way that already is a crossing way
   * @return {Function} The Action function, accepts a Graph and returns a modified Graph
   */
  function actionCandidateToCrossing(nodeID, wayID) {
    return graph => {
      const node = graph.entity(nodeID);
      const way = graph.entity(wayID);

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
      graph = actionChangeTags(node.id, tags)(graph);

      return graph;
    };
  }


  /**
   * detectCrossingTagIssues
   * This check just runs `actionUpdateCrossing` and compares graphs to see what has changed.
   * @param   {Way}    startWay - Way being validated
   * @param   {Graph}  startGraph - Graph being validated
   * @return  {Array}  Array of ValidationIssues detected
   */
  function detectCrossingTagIssues(startWay, startGraph) {
    const wayID = startWay.id;
    const startPreset = presets.match(startWay, startGraph);
    const action = actionUpdateCrossing(wayID);
    const endGraph = action(startGraph);
    const diff = new Difference(startGraph, endGraph);  // What changed?
    if (!diff.changes.size) return [];  // no updates needed

    // What does the original way look like after the changes?
    const endWay = endGraph.hasEntity(wayID);
    if (!endWay) return [];   // shouldn't happen

    // Choices being offered..
    const choices = new Map();  // Map(string -> { setTags })

    // Details about the entities involved in this issue.
    const updates = new Map();  // Map(entityID -> { preset name, tagDiff })

    // The default choice is, basically:
    // - If the parent is a crossing, upgrade parent way tagging and make the child nodes match.
    // - If the parent is not a crossing, to remove any stray crossing tags.
    const parentDetail = inferCrossingType(endWay.tags);
    const isParentCrossing = (parentDetail.type !== 'not a crossing');
    addChoice(parentDetail);

    // If we haven't already, create the 'not a crossing' choice to remove the crossing tags completely.
    addChoice(inferCrossingType({/* no tags */}));

    // First, collect the parent way (include it whether it changed or not, tagDiff may be `[]`).
    const tagDiff = utilTagDiff(startWay.tags, endWay.tags);
    updates.set(wayID, { name: startPreset.name(), tagDiff: tagDiff });

    // Next, collect any child nodes that got changed.
    for (const change of diff.changes.values()) {
      const base = change?.base;    // Entity before change
      const head = change?.head;    // Entity after change
      if (!base || !head) continue;         // Shouldn't happen, a tag modification should include both.
      if (base.type !== 'node') continue;   // We collected the parent way already and only want child nodes.

      // Generate choices for the before and after states of this child node,
      // But only do this if the parent really is a crossing.  The parent might just be a sidewalk,
      //  and we dont want to suggest to turn the whole sidewalk into a crossing.
      if (isParentCrossing) {
        addChoice(inferCrossingType(base.tags));
        addChoice(inferCrossingType(head.tags));
      }

      // Include this child node's details in the updates Map.
      const startPreset = presets.match(base, startGraph);
      const tagDiff = utilTagDiff(base.tags, head.tags);
      updates.set(base.id, { name: startPreset.name(), tagDiff: tagDiff });
    }

    // If the updates are only adding tags, this is considered an "upgrade" not a "conflict"
    let isOnlyAddingTags = true;
    for (const update of updates.values()) {
      if (!update.tagDiff?.length) continue;
      if (update.tagDiff.some(d => d.type === '-')) {
        isOnlyAddingTags = false;
        break;
      }
    }

    return [
      new ValidationIssue(context, {
        type,
        subtype: 'crossing_conflict',
        severity: 'warning',
        entityIds: [ ...updates.keys() ],
        data: {
          isParentCrossing: isParentCrossing,
          isOnlyAddingTags: isOnlyAddingTags,
          updates: updates,
          choices: choices
        },
        autoArgs: [ action, l10n.t('issues.ambiguous_crossing.annotation.changed') ],
        message: getConflictMessage,
        reference: showConflictReference,
        dynamicFixes: makeConflictFixes
      })
    ];


    // Based on the given tags, what type of crossing is this?
    // Returns a type that will be used for both identification and display (e.g. 'lines', 'zebra', 'marked'),
    // along with whatever tags should be set on the parent way if the user picks this type as a fix.
    function inferCrossingType(t) {
      const markings = t['crossing:markings'] ?? '';
      const crossing = t.crossing ?? '';

      const isUnspecified = t.highway === 'crossing' || t.path === 'crossing' || t.footway === 'crossing' ||
        t.cycleway === 'crossing' || t.bridleway === 'crossing'  || t.pedestrian === 'crossing';

      let type, tags;
      if (markings !== '' && markings !== 'yes' && markings !== 'no') {  // only interesting values like 'lines', 'surface', etc
        type = markings;
        tags = { 'crossing:markings': markings };
      } else if (crossing !== '') {
        type = crossing;
        tags = { crossing: crossing };
      } else if (isUnspecified) {    // a crossing with no detail tags
        type = 'unspecified';
        tags = null;
      } else {
        type = 'not a crossing';
        tags = {
          footway: null, path: null, cycleway: null, bridleway: null, pedestrian: null,
          crossing: null, 'crossing:markings': null, 'crossing:signals': null
        };
      }

      return { type, tags };
    }


    // Add a 'choice' to the `choices` Map, if it isn't there already
    // type - a string like 'lines', or 'unmarked'.
    // tags - the tags to apply to the parent way.
    function addChoice(data) {
      const tags = data.tags;
      const type = data.type;

      // Never offer this as a choice - it's a situation where someting is tagged incompletely,
      // e.g. parent way is a sidewalk, child node is a crossing with no detail tags.
      if (type === 'unspecified') return;

      let choice = choices.get(type);
      if (!choice) {
        choice = { setTags: tags };
        choices.set(type, choice);
      } else if (type !== 'not a crossing') {
        // Merge tags into an existing choice, if it's a real type.
        // This is useful if we first added `crossing=zebra` and then
        // later want to include a better tag like 'crossing:markings=zebra'
        choice.setTags = Object.apply(choice.tags, tags);
      }
      return choice;
    }


    function makeConflictFixes() {
      const issue = this;
      const wayID = issue.entityIds[0];
      const choices = issue.data.choices;
      const stringID = issue.data.isOnlyAddingTags ? 'update_type' : 'choose_type';
      const fixes = [];

      for (const [type, choice] of choices) {
        if (type === 'not a crossing') continue;  // will go at the end

        const title = l10n.t(`issues.ambiguous_crossing.fix.${stringID}`, { type: type });
        const fix = makeConflictFix(title, wayID, choice.setTags);
        fixes.push(fix);
      }

      // put this one at the end
      const choice = choices.get('not a crossing');
      const title = l10n.t('issues.ambiguous_crossing.fix.remove_all');
      const fix = makeConflictFix(title, wayID, choice.setTags);
      fixes.push(fix);

      return fixes;
    }


    function makeConflictFix(title, wayID, setTags) {
      return new ValidationFix({
        title: title,
        onClick: () => {
          const graph = editor.staging.graph;
          const way = graph.hasEntity(wayID);
          if (!way) return;

          if (setTags) {
            const tags = Object.assign({}, way.tags);
            for (const [k, v] of Object.entries(setTags)) {
              if (v) {
                tags[k] = v;
              } else {
                delete tags[k];
              }
            }
            editor.perform(actionChangeTags(way.id, tags));
          }

          editor.perform(action);
          editor.commit({
            annotation: l10n.t('issues.ambiguous_crossing.annotation.changed'),
            selectedIDs: [way.id]
          });
        }
      });
    }


    function getConflictMessage() {
      const issue = this;

      if (issue.data.isOnlyAddingTags) {
        return l10n.t('issues.ambiguous_crossing.message.update');
      } else {
        return l10n.t('issues.ambiguous_crossing.message.conflict');
      }
    }


    function showConflictReference(selection) {
      const issue = this;

      // convert `updates` Map to `data` Array for d3.data join
      const updateData = [];
      for (const [entityID, update] of issue.data.updates) {
        updateData.push({
          entityID: entityID,
          name: update.name,
          tagDiff: update.tagDiff || [],
          notCrossing: (entityID === wayID && !issue.data.isParentCrossing)
        });
      }

      const referenceEnter = selection.selectAll('.issue-reference')
        .data([0])
        .enter();

      referenceEnter
        .append('div')
        .attr('class', 'issue-reference')
        .text('The various `crossing` tags should be consistent between the line and points.  In order to match the line tagging, the following updates are suggested.');

      referenceEnter
        .append('strong')
        .html(l10n.tHtml('issues.suggested'));  // "Suggested updates"

      const updatesEnter = referenceEnter.selectAll('.suggested-update')
        .data(updateData, d => d.entityID)
        .enter()
        .append('div')
        .attr('class', 'suggested-update');

      updatesEnter
        .append('strong')
        .text(d => {
          const lineOrPoint = d.entityID[0] === 'w' ? l10n.t('modes.add_line.title') : l10n.t('modes.add_point.title');
          return `${lineOrPoint} ${d.entityID} - ${d.name}:`;
        });

      // Add a note if the parent way was not detected to be a crossing..
      // There won't be a tagdiff for it, but there may be suggestions to remove crossing tags from child nodes.
      updatesEnter
        .each((d, i, nodes) => {
          if (d.notCrossing) {
            d3_select(nodes[i])
              .append('div')
              .attr('class', 'tagDiff-message')
              .text(l10n.t('issues.ambiguous_crossing.not_a_crossing'));
            }
        });

      updatesEnter
        .append('table')
        .attr('class', 'tagDiff-table')
        .selectAll('.tagDiff-row')
        .data(d => d.tagDiff)
        .enter()
        .append('tr')
        .attr('class', 'tagDiff-row')
        .append('td')
        .attr('class', d => {
          const klass = (d.type === '+') ? 'add' : 'remove';
          return `tagDiff-cell tagDiff-cell-${klass}`;
        })
        .html(d => d.display);
    }
  }


  /**
   * detectCrossingCandidateIssues
   * This method performs the crossing node candidate check. This check attempts to find normal nodes in a
   * crossing way that are potentials to upgrade into crossing nodes.  Not all the nodes found with this check
   * need to be upgraded, it is merely to call attention to the potential for missing crossing information.
   * @param   {Way}    way - Way being validated
   * @param   {Graph}  graph - Graph being validated
   * @return  {Array}  Array of ValidationIssues detected
   */
  function detectCrossingCandidateIssues(way, graph) {
    const issues = [];

    // Find all the nodes that aren't marked as crossings, but are *actually* crossings of at least one footway.
    for (const node of findCrossingNodeCandidates(way, graph)) {
      const parentWays = graph.parentWays(node);
      const parentCrossingWay = parentWays.find(way => way.tags.footway === 'crossing');
      if (!parentCrossingWay) continue;

      const nodeID = node.id;
      const wayID = parentCrossingWay.id;

      issues.push(new ValidationIssue(context, {
        type,
        subtype: 'candidate_crossing',
        severity: 'warning',
        entityIds: [ nodeID, wayID ],
        loc: node.loc,
        autoArgs: [ actionCandidateToCrossing(nodeID, wayID), l10n.t('issues.ambiguous_crossing.annotation.candidate') ],
        message: () => l10n.t('issues.ambiguous_crossing.incomplete_message'),
        reference: showCandidateReference,
        dynamicFixes: makeCandidateFixes
      }));
    }

    return issues;


    // Crossing node candidate check
    function isCrossingNodeCandidate(node, graph) {
      // Can't be a crossing candidate... if it's already marked as crossing.
      if (node.tags.highway === 'crossing') return false;

      // We should only consider node candidates with at least one parent highway that is not a footway.
      const parentWays = graph.parentWays(node);
      const crossings = parentWays.filter(way => way.tags.highway && !way.tags.footway);
      return (crossings.length > 0 && parentWays.length > 0);
    }


    /**
     * findCrossingNodeCandidates
     * @param   {Way}    way - Way being validated
     * @param   {Graph}  graph - Graph being validated
     * @return  {Array}  nodes in that way that don't have crossing markings, but have multiple parent ways, one of which is a crossing way
     */
    function findCrossingNodeCandidates(way, graph) {
      let results = [];

      // 1..len-1 : only evaluate 'inner' nodes, not the ends.
      for (let i = 1; i < way.nodes.length - 1; i++) {
        const node = graph.hasEntity(way.nodes[i]);
        if (!node || !isCrossingNodeCandidate(node, graph)) continue;
        results.push(node);
      }

      return results;
    }


    function makeCandidateFixes() {
      const issue = this;

      return [
        new ValidationFix({
          icon: 'rapid-icon-connect',
          title: l10n.t('issues.ambiguous_crossing.fix.candidate'),
          onClick: () => {
            const [nodeID, wayID] = issue.entityIds;
            const graph = editor.staging.graph;
            const node = graph.hasEntity(nodeID);
            const way = graph.hasEntity(wayID);
            if (!node || !way) return;

            editor.perform(actionCandidateToCrossing(nodeID, wayID));
            editor.commit({
              annotation: l10n.t('issues.ambiguous_crossing.annotation.candidate'),
              selectedIDs: context.selectedIDs()
            });
          }
        })
      ];
    }


    function showCandidateReference(selection) {
      selection.selectAll('.issue-reference')
        .data([0])
        .enter()
        .append('div')
        .attr('class', 'issue-reference')
        .html(l10n.tHtml('issues.ambiguous_crossing.incomplete_reference'));
    }
  }


  validation.type = type;

  return validation;
}
