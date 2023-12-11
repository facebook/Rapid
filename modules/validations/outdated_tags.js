import { utilHashcode, utilTagDiff } from '@rapid-sdk/util';

import { actionChangePreset } from '../actions/change_preset';
import { actionChangeTags } from '../actions/change_tags';
import { actionUpgradeTags } from '../actions/upgrade_tags';
import { osmIsOldMultipolygonOuterMember, osmOldMultipolygonOuterMemberOfRelation } from '../osm/multipolygon';
import { ValidationIssue, ValidationFix } from '../core/lib';


export function validationOutdatedTags(context) {
  const type = 'outdated_tags';
  const dataloader = context.systems.dataloader;
  const editor = context.systems.editor;
  const l10n = context.systems.l10n;
  const presets = context.systems.presets;

  let _waitingForDeprecated = true;
  let _dataDeprecated;

  // fetch deprecated tags
  dataloader.getDataAsync('deprecated')
    .then(d => _dataDeprecated = d)
    .catch(() => { /* ignore */ })
    .finally(() => _waitingForDeprecated = false);


  /**
   * oldTagIssues
   */
  function oldTagIssues(entity, graph) {
    if (!entity.hasInterestingTags()) return [];

    let preset = presets.match(entity, graph);
    if (!preset) return [];

    const oldTags = Object.assign({}, entity.tags);  // shallow copy
    let subtype = 'deprecated_tags';

    // Note: We are going to modify `graph` and `entity` locally in here, but these things will not change.
    // It's just a working graph where we can apply changes in order to determine the final tag diff.

    // Upgrade preset, if a replacement is available..
    if (preset.replacement) {
      const newPreset = presets.item(preset.replacement);
      graph = actionChangePreset(entity.id, preset, newPreset, true /* skip field defaults */)(graph);
      entity = graph.entity(entity.id);
      preset = newPreset;
    }

    // Upgrade deprecated tags..
    if (_dataDeprecated) {
      const deprecatedTags = entity.deprecatedTags(_dataDeprecated);
      for (const tag of deprecatedTags) {
        graph = actionUpgradeTags(entity.id, tag.old, tag.replace)(graph);
        entity = graph.entity(entity.id);
      }
    }

    // Add missing addTags from the detected preset
    let newTags = Object.assign({}, entity.tags);  // shallow copy
    if (preset.tags !== preset.addTags) {
      for (const [k, v] of Object.entries(preset.addTags)) {
// TODO - for now, skip tag upgrades on crossing nodes only, see Rapid#1260
// The `ambiguous_crossing_tags` validator will take care of them.
// (We don't need to raise the same issue twice - for both the node and the way)
if (entity.type === 'node' && /^highway\/crossing\//.test(preset.id)) continue;
        if (!newTags[k]) {
          if (v === '*') {
            newTags[k] = 'yes';
          } else {
            newTags[k] = v;
          }
        }
      }
    }

    // Attempt to match a canonical record in the name-suggestion-index.
    const nsi = context.services.nsi;
    let waitingForNsi = false;
    let nsiResult;
    if (nsi) {
      waitingForNsi = (nsi.status === 'loading');
      if (!waitingForNsi) {
        const loc = entity.extent(graph).center();
        nsiResult = nsi.upgradeTags(newTags, loc);
        if (nsiResult) {
          newTags = nsiResult.newTags;
          subtype = 'noncanonical_brand';
        }
      }
    }

    let issues = [];
    issues.provisional = (_waitingForDeprecated || waitingForNsi);

    // determine diff
    const tagDiff = utilTagDiff(oldTags, newTags);
    if (!tagDiff.length) return issues;

    const isOnlyAddingTags = tagDiff.every(d => d.type === '+');

    let prefix = '';
    if (nsiResult) {
      prefix = 'noncanonical_brand.';
    } else if (subtype === 'deprecated_tags' && isOnlyAddingTags) {
      subtype = 'incomplete_tags';
      prefix = 'incomplete.';
    }

    // Allow autofix for simple upgrades..
    // `noncanonical_brand` upgrades may have false positives, so they should be reviewed manually.
    let autoArgs = null;
    if (subtype !== 'noncanonical_brand') {
      autoArgs = [actionDoTagUpgrade, l10n.t('issues.fix.upgrade_tags.annotation')];
    }

    issues.push(new ValidationIssue(context, {
      type: type,
      subtype: subtype,
      severity: 'warning',
      message: showUpgradeMessage,
      reference: showUpgradeReference,
      entityIds: [entity.id],
      hash: utilHashcode(JSON.stringify(tagDiff)),
      autoArgs: autoArgs,
      dynamicFixes: () => {
        let fixes = [
          new ValidationFix({
            title: l10n.tHtml('issues.fix.upgrade_tags.title'),
            onClick: () => {
              editor.perform(actionDoTagUpgrade);
              editor.commit({
                annotation: l10n.t('issues.fix.upgrade_tags.annotation'),
                selectedIDs: [entity.id]
              });
            }
          })
        ];

        const item = nsiResult?.matched;
        if (item) {
          fixes.push(
            new ValidationFix({
              title: l10n.tHtml('issues.fix.tag_as_not.title', { name: item.displayName }),
              onClick: () => {
                editor.perform(actionAddNotTag);
                editor.commit({
                  annotation: l10n.t('issues.fix.tag_as_not.annotation'),
                  selectedIDs: [entity.id]
                });
              }
            })
          );
        }
        return fixes;

      }
    }));

    return issues;


    function actionDoTagUpgrade(graph) {
      const currEntity = graph.hasEntity(entity.id);
      if (!currEntity) return graph;

      const newTags = Object.assign({}, currEntity.tags);  // shallow copy
      for (const diff of tagDiff) {
        if (diff.type === '-') {
          delete newTags[diff.key];
        } else if (diff.type === '+') {
          newTags[diff.key] = diff.newVal;
        }
      }

      return actionChangeTags(currEntity.id, newTags)(graph);
    }


    function actionAddNotTag(graph) {
      const currEntity = graph.hasEntity(entity.id);
      if (!currEntity) return graph;

      const item = nsiResult?.matched;
      if (!item) return graph;

      const newTags = Object.assign({}, currEntity.tags);  // shallow copy
      const wd = item.mainTag;     // e.g. `brand:wikidata`
      const notwd = `not:${wd}`;   // e.g. `not:brand:wikidata`
      const qid = item.tags[wd];
      newTags[notwd] = qid;

      if (newTags[wd] === qid) {   // if `brand:wikidata` was set to that qid
        const wp = item.mainTag.replace('wikidata', 'wikipedia');
        delete newTags[wd];        // remove `brand:wikidata`
        delete newTags[wp];        // remove `brand:wikipedia`
      }

      return actionChangeTags(currEntity.id, newTags)(graph);
    }


    function showUpgradeMessage() {
      const graph = editor.staging.graph;
      const currEntity = graph.hasEntity(entity.id);
      if (!currEntity) return '';

      let messageID = `issues.outdated_tags.${prefix}message`;
      if (subtype === 'noncanonical_brand' && isOnlyAddingTags) {
        messageID += '_incomplete';
      }
      return l10n.tHtml(messageID, {
        feature: l10n.displayLabel(currEntity, graph, true /* verbose */)
      });
    }


    function showUpgradeReference(selection) {
      const enter = selection.selectAll('.issue-reference')
        .data([0])
        .enter();

      enter
        .append('div')
        .attr('class', 'issue-reference')
        .html(l10n.tHtml(`issues.outdated_tags.${prefix}reference`));

      enter
        .append('strong')
        .html(l10n.tHtml('issues.suggested'));

      enter
        .append('table')
        .attr('class', 'tagDiff-table')
        .selectAll('.tagDiff-row')
        .data(tagDiff)
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
   * oldMultipolygonIssues
   */
  function oldMultipolygonIssues(entity, graph) {
    let multipolygon, outerWay;
    if (entity.type === 'relation') {
      outerWay = osmOldMultipolygonOuterMemberOfRelation(entity, graph);
      multipolygon = entity;
    } else if (entity.type === 'way') {
      multipolygon = osmIsOldMultipolygonOuterMember(entity, graph);
      outerWay = entity;
    } else {
      return [];
    }

    if (!multipolygon || !outerWay) return [];

    return [new ValidationIssue(context, {
      type: type,
      subtype: 'old_multipolygon',
      severity: 'warning',
      message: showMultipolygonMessage,
      reference: showMultipolygonReference,
      entityIds: [outerWay.id, multipolygon.id],
      autoArgs: [actionUpgradeMultipolygon, l10n.t('issues.fix.move_tags.annotation')],
      dynamicFixes: () => {
        return [
          new ValidationFix({
            title: l10n.t('issues.fix.move_tags.title'),
            onClick: () => {
              editor.perform(actionUpgradeMultipolygon);
              editor.commit({
                annotation: l10n.t('issues.fix.move_tags.annotation'),
                selectedIDs: [entity.id]
              });
            }
          })
        ];
      }
    })];


    function actionUpgradeMultipolygon(graph) {
      let currMultipolygon = graph.hasEntity(multipolygon.id);
      let currOuterWay = graph.hasEntity(outerWay.id);
      if (!currMultipolygon || !currOuterWay) return graph;

      currMultipolygon = currMultipolygon.mergeTags(currOuterWay.tags);
      graph = graph.replace(currMultipolygon);
      return actionChangeTags(currOuterWay.id, {})(graph);
    }


    function showMultipolygonMessage() {
      const graph = editor.staging.graph;
      let currMultipolygon = graph.hasEntity(multipolygon.id);
      if (!currMultipolygon) return '';

      return l10n.tHtml('issues.old_multipolygon.message',
          { multipolygon: l10n.displayLabel(currMultipolygon, graph, true) }   // true = verbose
      );
    }


    function showMultipolygonReference(selection) {
      selection.selectAll('.issue-reference')
        .data([0])
        .enter()
        .append('div')
        .attr('class', 'issue-reference')
        .html(l10n.tHtml('issues.old_multipolygon.reference'));
    }
  }


  let validation = function checkOutdatedTags(entity, graph) {
    let issues = oldMultipolygonIssues(entity, graph);
    if (!issues.length) {
      issues = oldTagIssues(entity, graph);
    }
    return issues;
  };


  validation.type = type;

  return validation;
}
