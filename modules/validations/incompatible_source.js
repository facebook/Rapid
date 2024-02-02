import { ValidationIssue, ValidationFix } from '../core/lib/index.js';


export function validationIncompatibleSource(context) {
  const type = 'incompatible_source';
  const editor = context.systems.editor;
  const l10n = context.systems.l10n;

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
      exceptRegex: /((books|drive)\.google|google\s?(books|drive|plus))|(esri\/google)/i
    }
  ];


  const validation = function checkIncompatibleSource(entity) {
    const entitySources = entity.tags?.source && entity.tags.source.split(';');
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

        return new ValidationIssue(context, {
          type: type,
          severity: 'warning',
          message: () => {
            const graph = editor.staging.graph;
            const entity = graph.hasEntity(entityID);
            return entity ? l10n.t('issues.incompatible_source.feature.message', {
              feature: l10n.displayLabel(entity, graph, true),  // true = verbose
              value: source
            }) : '';
          },
          reference: getReference(matchRule.id),
          entityIds: [entityID],
          hash: source,
          dynamicFixes: () => {
            return [
              new ValidationFix({ title: l10n.t('issues.fix.remove_proprietary_data.title') })
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
            .text(l10n.t(`issues.incompatible_source.reference.${id}`));
        };
      }
    };

    validation.type = type;

    return validation;
}
