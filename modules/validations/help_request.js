import { ValidationIssue, ValidationFix } from '../core/lib/index.js';


export function validationHelpRequest(context) {
  const type = 'help_request';
  const editor = context.systems.editor;
  const l10n = context.systems.l10n;


  let validation = function checkFixmeTag(entity) {
    if (!entity.tags.fixme) return [];

    // don't flag fixmes on features added by the user
    if (entity.version === undefined) return [];

    if (entity.v !== undefined) {
      const baseEntity = editor.base.graph.hasEntity(entity.id);
      // don't flag fixmes added by the user on existing features
      if (!baseEntity || !baseEntity.tags.fixme) return [];
    }

    return [new ValidationIssue(context, {
      type: type,
      subtype: 'fixme_tag',
      severity: 'warning',
      message: function() {
        const graph = editor.staging.graph;
        const entity = graph.hasEntity(this.entityIds[0]);
        return entity ? l10n.t('issues.fixme_tag.message', {
          feature: l10n.displayLabel(entity, graph, true)    // true = verbose
        }) : '';
      },
      dynamicFixes: () => {
        return [
          new ValidationFix({ title: l10n.t('issues.fix.address_the_concern.title') })
        ];
      },
      reference: showReference,
      entityIds: [entity.id]
    })];

    function showReference(selection) {
      selection.selectAll('.issue-reference')
        .data([0])
        .enter()
        .append('div')
        .attr('class', 'issue-reference')
        .text(l10n.t('issues.fixme_tag.reference'));
    }
  };

  validation.type = type;

  return validation;
}
