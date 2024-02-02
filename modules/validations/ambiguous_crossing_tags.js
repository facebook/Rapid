import { select as d3_select } from 'd3-selection';
import { utilTagDiff } from '@rapid-sdk/util';

import { actionChangePreset, actionChangeTags, actionSyncCrossingTags } from '../actions/index.js';
import { Difference, ValidationIssue, ValidationFix } from '../core/lib/index.js';


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

    return detectCrossingWayIssues(entity, graph);
  };


  /**
   * actionUpdateCrossingTags
   * Upgrades the preset, then syncs the crossing tags.
   * This is like the upgrade steps in `outdated_tags.js`, but we take things further here.
   * @param   {string}    entityID - The entity with the tags that should be checked.
   * @return  {Function}  Action function, accepts a Graph and returns a modified Graph.
   */
  function actionUpdateCrossing(entityID) {
    return graph => {
      const entity = graph.entity(entityID);
      const currPreset = presets.match(entity, graph);
      const replacementID = currPreset.replacement;
      const replacement = replacementID && presets.item(replacementID);

      if (replacement) {
        graph = actionChangePreset(entityID, currPreset, replacement, true /* skip field defaults */)(graph);
        // `actionChangePreset` also does `actionSyncCrossingTags`, so we don't have to call it here.
      } else {
        graph = actionSyncCrossingTags(entityID)(graph);
      }

      return graph;
    };
  }


  /**
   * detectCrossingWayIssues
   * This check just runs `actionUpdateCrossing` and compares graphs to see what has changed.
   * @param   {Way}    startWay - Way being validated
   * @param   {Graph}  startGraph - Graph being validated
   * @return  {Array}  Array of ValidationIssues detected
   */
  function detectCrossingWayIssues(startWay, startGraph) {
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

    // First, collect the parent way (include it whether it changed or not, tagDiff may be `[]`).
    const tagDiff = utilTagDiff(startWay.tags, endWay.tags);
    updates.set(wayID, { name: startPreset.name(), tagDiff: tagDiff });
    const isParentChanged = (tagDiff.length > 0);

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

    // If we haven't already, create the 'not a crossing' choice to remove the crossing tags completely.
    addChoice(inferCrossingType({/* no tags */}));

    // If a single update, or multiple updates only adding tags, this is considered an "upgrade"..
    // If multiple updates with tag changes, this is consideredd a "conflict"..
    let isTagUpgrade = true;
    if (updates.size > 1) {
      for (const update of updates.values()) {
        if (!update.tagDiff?.length) continue;
        if (update.tagDiff.some(d => d.type === '-')) {
          isTagUpgrade = false;
          break;
        }
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
          isParentChanged: isParentChanged,
          isTagUpgrade: isTagUpgrade,
          updates: updates,
          choices: choices
        },
        autoArgs: [ action, l10n.t('issues.ambiguous_crossing.annotation.changed') ],
        message: getIssueTitle,
        reference: renderIssueReference,
        dynamicFixes: makeFixes
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
      if (markings !== '' && markings !== 'yes' && markings !== 'no') {  // interesting values like 'lines', 'surface', etc
        type = markings;
        tags = { 'crossing:markings': markings };
      } else if (markings === 'yes') {
        type = 'marked';
        tags = { 'crossing:markings': 'yes' };
      } else if (markings === 'no') {
        type = 'unmarked';
        tags = { 'crossing:markings': 'no' };
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


    /**
     * Add a 'choice' to the `choices` Map, if it isn't there already
     * @param {string}  data.type a string like 'lines', or 'unmarked'.
     * @param {Object}  data.tags - the tags to apply to the parent way.
     * @return {Object} Choice data containing `setTags`
     */
    function addChoice(data) {
      const type = data.type;
      const tags = data.tags;

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
        choice.setTags = Object.assign(choice.setTags, tags);
      }
      return choice;
    }


    function makeFixes() {
      const issue = this;
      const wayID = issue.entityIds[0];
      const choices = issue.data.choices;
      const stringID = issue.data.isTagUpgrade ? 'update_type' : 'choose_type';
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


    function getIssueTitle() {
      const issue = this;
      const data = issue.data;

      if (data.isParentCrossing && !data.isParentChanged && data.isTagUpgrade) {
        return l10n.t('issues.ambiguous_crossing.message.candidate');
      } else if (data.isTagUpgrade) {
        return l10n.t('issues.ambiguous_crossing.message.update');
      } else {
        return l10n.t('issues.ambiguous_crossing.message.conflict');
      }
    }


    function renderIssueReference(selection) {
      const issue = this;

      // convert `updates` Map to `data` Array for d3.data join
      const updateData = [];
      for (const [entityID, update] of issue.data.updates) {
        updateData.push({
          entityID: entityID,
          name: update.name,
          tagDiff: update.tagDiff || []
        });
      }

      const referenceEnter = selection.selectAll('.issue-reference')
        .data([0])
        .enter();

      referenceEnter
        .append('div')
        .attr('class', 'issue-reference')
        .text(l10n.t('issues.ambiguous_crossing.reference.line1'));

      referenceEnter
        .append('div')
        .attr('class', 'issue-reference')
        .text(l10n.t('issues.ambiguous_crossing.reference.line2'));

      referenceEnter
        .append('strong')
        .text(l10n.t('issues.suggested'));  // "Suggested updates"

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

      // Render either the tagDiff or a message in its place.
      updatesEnter
        .each((d, i, nodes) => {
          const selection = d3_select(nodes[i]);

          if (!d.tagDiff.length) {
            selection
              .append('div')
              .attr('class', 'tagDiff-message')
              .text(d => {
                if (d.entityID === wayID && !issue.data.isParentCrossing) {
                  return l10n.t('issues.ambiguous_crossing.not_a_crossing');
                } else {
                  return l10n.t('issues.ambiguous_crossing.no_changes');
                }
              });
          } else {
            selection
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
              .text(d => d.display);
          }
        });
    }
  }


  validation.type = type;

  return validation;
}
