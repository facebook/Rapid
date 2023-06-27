import { actionChangeTags } from '../actions/change_tags';
import { ValidationIssue, ValidationFix } from '../core/lib';


export function validationSuspiciousName(context) {
  const type = 'suspicious_name';
  const l10n = context.localizationSystem();
  const keysToTestForGenericValues = [
    'aerialway', 'aeroway', 'amenity', 'building', 'craft', 'highway',
    'leisure', 'railway', 'man_made', 'office', 'shop', 'tourism', 'waterway'
  ];
  let _waitingForNsi = false;


  // Attempt to match a generic record in the name-suggestion-index.
  function isGenericMatchInNsi(tags) {
    const nsi = context.services.nsi;
    if (nsi) {
      _waitingForNsi = (nsi.status === 'loading');
      if (!_waitingForNsi) {
        return nsi.isGenericName(tags);
      }
    }
    return false;
  }


  // Test if the name is just the key or tag value (e.g. "park")
  function nameMatchesRawTag(lowercaseName, tags) {
    for (const key of keysToTestForGenericValues) {
      let val = tags[key];
      if (val) {
        val = val.toLowerCase();
        if (key === lowercaseName ||
          val === lowercaseName ||
          key.replace(/\_/g, ' ') === lowercaseName ||
          val.replace(/\_/g, ' ') === lowercaseName) {
          return true;
        }
      }
    }
    return false;
  }

  function isGenericName(name, tags) {
    name = name.toLowerCase();
    return nameMatchesRawTag(name, tags) || isGenericMatchInNsi(tags);
  }

  function makeGenericNameIssue(entityID, nameKey, genericName, langCode) {
    return new ValidationIssue(context, {
      type: type,
      subtype: 'generic_name',
      severity: 'warning',
      message: function() {
        const entity = context.hasEntity(this.entityIds[0]);
        if (!entity) return '';
        const preset = context.presetSystem().match(entity, context.graph());
        const langName = langCode && l10n.languageName(langCode);
        return l10n.tHtml('issues.generic_name.message' + (langName ? '_language' : ''),
          { feature: preset.name(), name: genericName, language: langName }
        );
      },
      reference: showReference,
      entityIds: [entityID],
      hash: `${nameKey}=${genericName}`,
      dynamicFixes: function() {
        return [
          new ValidationFix({
            icon: 'rapid-operation-delete',
            title: l10n.tHtml('issues.fix.remove_the_name.title'),
            onClick: function() {
              const entityID = this.issue.entityIds[0];
              const entity = context.entity(entityID);
              let tags = Object.assign({}, entity.tags);   // shallow copy
              delete tags[nameKey];
              context.perform(
                actionChangeTags(entityID, tags), l10n.t('issues.fix.remove_generic_name.annotation')
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
        .html(l10n.tHtml('issues.generic_name.reference'));
    }
  }

  function makeIncorrectNameIssue(entityID, nameKey, incorrectName, langCode) {
    return new ValidationIssue(context, {
      type: type,
      subtype: 'not_name',
      severity: 'warning',
      message: function() {
        const entity = context.hasEntity(this.entityIds[0]);
        if (!entity) return '';
        const preset = context.presetSystem().match(entity, context.graph());
        const langName = langCode && l10n.languageName(langCode);
        return l10n.tHtml('issues.incorrect_name.message' + (langName ? '_language' : ''),
          { feature: preset.name(), name: incorrectName, language: langName }
        );
      },
      reference: showReference,
      entityIds: [entityID],
      hash: `${nameKey}=${incorrectName}`,
      dynamicFixes: function() {
        return [
          new ValidationFix({
            icon: 'rapid-operation-delete',
            title: l10n.tHtml('issues.fix.remove_the_name.title'),
            onClick: function() {
              const entityID = this.issue.entityIds[0];
              const entity = context.entity(entityID);
              let tags = Object.assign({}, entity.tags);   // shallow copy
              delete tags[nameKey];
              context.perform(
                actionChangeTags(entityID, tags), l10n.t('issues.fix.remove_mistaken_name.annotation')
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
        .html(l10n.tHtml('issues.generic_name.reference'));
    }
  }


  let validation = function checkGenericName(entity) {
    const tags = entity.tags;

    // a generic name is allowed if it's a known brand or entity
    const hasWikidata = (!!tags.wikidata || !!tags['brand:wikidata'] || !!tags['operator:wikidata']);
    if (hasWikidata) return [];

    let issues = [];
    const notNames = new Set((tags['not:name'] ?? '').split(';').map(s => s.trim()).filter(Boolean));

    for (const [k, v] of Object.entries(tags)) {
      if (!v) continue;   // no value
      const m = k.match(/^name(?:(?::)([a-zA-Z_-]+))?$/);
      if (!m) continue;   // not a namelike tag
      const langCode = m.length >= 2 ? m[1] : null;

      if (notNames.has(v)) {
        issues.push(makeIncorrectNameIssue(entity.id, k, v, langCode));
      }
      if (isGenericName(v, tags)) {
        issues.provisional = _waitingForNsi;  // retry later if we are waiting on NSI to finish loading
        issues.push(makeGenericNameIssue(entity.id, k, v, langCode));
      }
    }

    return issues;
  };


  validation.type = type;

  return validation;
}
