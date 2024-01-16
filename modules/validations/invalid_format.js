import { ValidationIssue } from '../core/lib/index.js';


export function validationFormatting(context) {
  const type = 'invalid_format';
  const editor = context.systems.editor;
  const l10n = context.systems.l10n;


  let validation = function(entity) {
    let issues = [];

    function isValidEmail(email) {
      // Emails in OSM are going to be official so they should be pretty simple
      // Using negated lists to better support all possible unicode characters - iD#6494
      const validEmail = /^[^\(\)\\,":;<>@\[\]]+@[^\(\)\\,":;<>@\[\]\.]+(?:\.[a-z0-9-]+)*$/i;
      // An empty value is also acceptable
      return (!email || validEmail.test(email));
    }

    /*
    function isSchemePresent(url) {
      let valid_scheme = /^https?:\/\//i;
      return (!url || valid_scheme.test(url));
    }
    */

    function showReferenceEmail(selection) {
      selection.selectAll('.issue-reference')
        .data([0])
        .enter()
        .append('div')
        .attr('class', 'issue-reference')
        .text(l10n.t('issues.invalid_format.email.reference'));
    }

    /*
    function showReferenceWebsite(selection) {
      selection.selectAll('.issue-reference')
        .data([0])
        .enter()
        .append('div')
        .attr('class', 'issue-reference')
        .text(l10n.t('issues.invalid_format.website.reference'));
    }

    if (entity.tags.website) {
      // Multiple websites are possible
      const websites = entity.tags.website
        .split(';')
        .map(s => s.trim())
        .filter(s => !isSchemePresent(s));

      if (websites.length) {
        issues.push(new ValidationIssue(context, {
          type: type,
          subtype: 'website',
          severity: 'warning',
          message: function() {
            const graph = editor.staging.graph;
            const entity = graph.hasEntity(this.entityIds[0]);
            return entity ? l10n.t('issues.invalid_format.website.message' + this.data,
              { feature: l10n.displayLabel(entity, graph), site: websites.join(', ') }) : '';
          },
          reference: showReferenceWebsite,
          entityIds: [entity.id],
          hash: websites.join(),
          data: (websites.length > 1) ? '_multi' : ''
        }));
      }
    }
    */

    if (entity.tags.email) {
      // Multiple emails are possible
      const emails = entity.tags.email
        .split(';')
        .map(s => s.trim())
        .filter(s => !isValidEmail(s));

      if (emails.length) {
        issues.push(new ValidationIssue(context, {
          type: type,
          subtype: 'email',
          severity: 'warning',
          message: function() {
            const graph = editor.staging.graph;
            const entity = graph.hasEntity(this.entityIds[0]);
            return entity ? l10n.t('issues.invalid_format.email.message' + this.data,
              { feature: l10n.displayLabel(entity, graph), email: emails.join(', ') }) : '';
          },
          reference: showReferenceEmail,
          entityIds: [entity.id],
          hash: emails.join(),
          data: (emails.length > 1) ? '_multi' : ''
        }));
      }
    }

    return issues;
  };

  validation.type = type;

  return validation;
}
