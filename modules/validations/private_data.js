import { utilTagDiff } from '@rapid-sdk/util';

import { actionChangeTags } from '../actions/change_tags.js';
import { ValidationIssue, ValidationFix } from '../core/lib/index.js';


export function validationPrivateData(context) {
  const type = 'private_data';
  const editor = context.systems.editor;
  const l10n = context.systems.l10n;

  // assume that some buildings are private
  const privateBuildingValues = new Set([
    'detached', 'farm', 'house', 'houseboat', 'residential', 'semidetached_house', 'static_caravan'
  ]);

  // but they might be public if they have one of these other tags
  const publicKeys = new Set([
    'amenity', 'craft', 'historic', 'leisure', 'office', 'shop', 'tourism'
  ]);

  // these tags may contain personally identifying info
  const personalKeys = new Set([
    'contact:email', 'contact:fax', 'contact:phone', 'email', 'fax', 'phone'
  ]);


  let validation = function checkPrivateData(entity) {
    const tags = entity.tags;
    if (!tags.building || !privateBuildingValues.has(tags.building)) return [];  // not a private building

    let keepTags = {};
    for (const [k, v] of Object.entries(tags)) {
      if (publicKeys.has(k)) return [];  // ignore, probably a public feature
      if (!personalKeys.has(k)) {
        keepTags[k] = v;
      }
    }

    const tagDiff = utilTagDiff(tags, keepTags);
    if (!tagDiff.length) return [];

    const fixID = tagDiff.length === 1 ? 'remove_tag' : 'remove_tags';

    return [new ValidationIssue(context, {
      type: type,
      severity: 'warning',
      message: showMessage,
      reference: showReference,
      entityIds: [entity.id],
      dynamicFixes: () => {
        return [
          new ValidationFix({
            icon: 'rapid-operation-delete',
            title: l10n.t(`issues.fix.${fixID}.title`),
            onClick: () => {
              editor.perform(doUpgrade);
              editor.commit({
                annotation: l10n.t('issues.fix.upgrade_tags.annotation'),
                selectedIDs: [entity.id]
              });
            }
          })
        ];
      }
    })];


    function doUpgrade(graph) {
      const currEntity = graph.hasEntity(entity.id);
      if (!currEntity) return graph;

      let newTags = Object.assign({}, currEntity.tags);  // shallow copy
      for (const diff of tagDiff) {
        if (diff.type === '-') {
          delete newTags[diff.key];
        } else if (diff.type === '+') {
          newTags[diff.key] = diff.newVal;
        }
      }

      return actionChangeTags(currEntity.id, newTags)(graph);
    }


    function showMessage() {
      const graph = editor.staging.graph;
      const currEntity = graph.hasEntity(this.entityIds[0]);
      if (!currEntity) return '';

      return l10n.t('issues.private_data.contact.message',
        { feature: l10n.displayLabel(currEntity, graph) }
      );
    }


    function showReference(selection) {
      let enter = selection.selectAll('.issue-reference')
        .data([0])
        .enter();

      enter
        .append('div')
        .attr('class', 'issue-reference')
        .text(l10n.t('issues.private_data.reference'));

      enter
        .append('strong')
        .text(l10n.t('issues.suggested'));

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
          const klass = d.type === '+' ? 'add' : 'remove';
          return `tagDiff-cell tagDiff-cell-${klass}`;
        })
        .text(d => d.display);
    }
  };


  validation.type = type;

  return validation;
}
