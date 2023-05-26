import { validationIssue, validationIssueFix } from '../core/validation';


export function validationIncompatibleSource(context) {
  const type = 'incompatible_source';
  const l10n = context.localizationSystem();

  const incompatibleRules = [
    {
      id: 'amap',
      regex: /(amap|autonavi|mapabc|高德)/i
    }, {
      id: 'baidu',
      regex: /(baidu|mapbar|百度)/i
    }, {
      id: 'google',
      regex: /google/i,
      exceptRegex: /((books|drive)\.google|google\s?(books|drive|plus))|(esri\/Google_Africa_Buildings)/i
    }
  ];


  const validation = function checkIncompatibleSource(entity) {
    const entitySources = entity.tags && entity.tags.source && entity.tags.source.split(';');
    if (!entitySources) return [];

    const entityID = entity.id;

    return entitySources
      .map(source => {
        const matchRule = incompatibleRules.find(rule => {
          if (!rule.regex.test(source)) return false;
          if (rule.exceptRegex && rule.exceptRegex.test(source)) return false;
          return true;
        });

        if (!matchRule) return null;

        return new validationIssue({
          type: type,
          severity: 'warning',
          message: function() {
            const entity = context.hasEntity(entityID);
            return entity ? l10n.tHtml('issues.incompatible_source.feature.message', {
              feature: l10n.displayLabel(entity, context.graph(), true /* verbose */),
              value: source
            }) : '';
          },
          reference: getReference(matchRule.id),
          entityIds: [entityID],
          hash: source,
          dynamicFixes: () => {
            return [
              new validationIssueFix({ title: l10n.tHtml('issues.fix.remove_proprietary_data.title') })
            ];
          }
        });

      }).filter(Boolean);


      function getReference(id) {
        return function showReference(selection) {
          selection.selectAll('.issue-reference')
            .data([0])
            .enter()
            .append('div')
            .attr('class', 'issue-reference')
            .html(l10n.tHtml(`issues.incompatible_source.reference.${id}`));
        };
      }
    };

    validation.type = type;

    return validation;
}
