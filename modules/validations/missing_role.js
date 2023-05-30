import { actionChangeMember } from '../actions/change_member';
import { actionDeleteMember } from '../actions/delete_member';
import { ValidationIssue, ValidationFix } from '../core/lib';


export function validationMissingRole(context) {
  const type = 'missing_role';
  const l10n = context.localizationSystem();


  let validation = function checkMissingRole(entity, graph) {
    let issues = [];

    if (entity.type === 'way') {
      for (const relation of graph.parentRelations(entity)) {
        if (!relation.isMultipolygon()) continue;

        const member = relation.memberById(entity.id);
        if (member && isMissingRole(member)) {
          issues.push(makeIssue(entity, relation, member));
        }
      }

    } else if (entity.type === 'relation' && entity.isMultipolygon()) {
      for (const member of entity.indexedMembers()) {
        const way = graph.hasEntity(member.id);
        if (way && isMissingRole(member)) {
          issues.push(makeIssue(way, entity, member));
        }
      }
    }

    return issues;
  };


  function isMissingRole(member) {
    return !member.role || !member.role.trim().length;
  }


  function makeIssue(way, relation, member) {
    return new ValidationIssue(context, {
      type: type,
      severity: 'warning',
      message: function() {
        const member = context.hasEntity(this.entityIds[1]);
        const relation = context.hasEntity(this.entityIds[0]);
        return (member && relation) ? l10n.tHtml('issues.missing_role.message', {
          member: l10n.displayLabel(member, context.graph()),
          relation: l10n.displayLabel(relation, context.graph())
        }) : '';
      },
      reference: showReference,
      entityIds: [relation.id, way.id],
      data:  { member: member },
      hash: member.index.toString(),
      dynamicFixes: function() {
        return [
          makeAddRoleFix('inner'),
          makeAddRoleFix('outer'),
          new ValidationFix({
            icon: 'rapid-operation-delete',
            title: l10n.tHtml('issues.fix.remove_from_relation.title'),
            onClick: () => {
              context.perform(
                actionDeleteMember(this.issue.entityIds[0], this.issue.data.member.index),
                l10n.t('operations.delete_member.annotation', { n: 1 })
              );
            }
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
        .html(l10n.tHtml('issues.missing_role.multipolygon.reference'));
    }
  }


  function makeAddRoleFix(role) {
    return new ValidationFix({
      title: l10n.tHtml(`issues.fix.set_as_${role}.title`),
      onClick: () => {
        const oldMember = this.issue.data.member;
        const member = { id: this.issue.entityIds[1], type: oldMember.type, role: role };
        context.perform(
          actionChangeMember(this.issue.entityIds[0], member, oldMember.index),
          l10n.t('operations.change_role.annotation', { n: 1 })
        );
      }
    });
  }

  validation.type = type;

  return validation;
}
