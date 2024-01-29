import { operationDelete } from '../operations/delete.js';
import { osmIsInterestingTag } from '../osm/tags.js';
import { osmOldMultipolygonOuterMemberOfRelation } from '../osm/multipolygon.js';
import { ValidationIssue, ValidationFix } from '../core/lib/index.js';


export function validationMissingTag(context) {
  const type = 'missing_tag';
  const editor = context.systems.editor;
  const l10n = context.systems.l10n;


  function hasDescriptiveTags(entity, graph) {
    const onlyAttributeKeys = ['description', 'name', 'note', 'start_date'];
    const entityDescriptiveKeys = Object.keys(entity.tags).filter(k => {
      if (k === 'area' || !osmIsInterestingTag(k)) return false;
      return !onlyAttributeKeys.some(attributeKey => {
        return k === attributeKey || k.indexOf(attributeKey + ':') === 0;
      });
    });

    if (entity.type === 'relation' && entityDescriptiveKeys.length === 1 && entity.tags.type === 'multipolygon') {
      // this relation's only interesting tag just says its a multipolygon, which is not descriptive enough
      // It's okay for a simple multipolygon to have no descriptive tags
      // if its outer way has them (old model, see `outdated_tags.js`)
      return osmOldMultipolygonOuterMemberOfRelation(entity, graph);
    }

    return entityDescriptiveKeys.length > 0;
  }


  function isUnknownRoad(entity) {
    return entity.type === 'way' && entity.tags.highway === 'road';
  }

  function isUntypedRelation(entity) {
    return entity.type === 'relation' && !entity.tags.type;
  }


  let validation = function checkMissingTag(entity, graph) {
    const osm = context.services.osm;
    const isUnloadedNode = (entity.type === 'node') && osm && !osm.isDataLoaded(entity.loc);
    let subtype;

    // we can't know if the node is a vertex if the tile is undownloaded
    if (!isUnloadedNode &&
      // allow untagged nodes that are part of ways
      entity.geometry(graph) !== 'vertex' &&
      // allow untagged entities that are part of relations
      !entity.hasParentRelations(graph)) {

      if (Object.keys(entity.tags).length === 0) {
        subtype = 'any';
      } else if (!hasDescriptiveTags(entity, graph)) {
        subtype = 'descriptive';
      } else if (isUntypedRelation(entity)) {
        subtype = 'relation_type';
      }
    }

    // flag an unknown road even if it's a member of a relation
    if (!subtype && isUnknownRoad(entity)) {
      subtype = 'highway_classification';
    }

    if (!subtype) return [];

    let messageID = subtype === 'highway_classification' ? 'unknown_road' : `missing_tag.${subtype}`;
    let referenceID = subtype === 'highway_classification' ? 'unknown_road' : 'missing_tag';

    // can always delete if the user created it in the first place..
    let canDelete = (entity.version === undefined || entity.v !== undefined);
    let severity = (canDelete && subtype !== 'highway_classification') ? 'error' : 'warning';

    return [new ValidationIssue(context, {
        type: type,
        subtype: subtype,
        severity: severity,
        message: function() {
          const graph = editor.staging.graph;
          const entity = graph.hasEntity(this.entityIds[0]);
          return entity ? l10n.t(`issues.${messageID}.message`, {
            feature: l10n.displayLabel(entity, graph)
          }) : '';
        },
        reference: showReference,
        entityIds: [entity.id],
        dynamicFixes: function() {
          let fixes = [];
          const selectFixType = subtype === 'highway_classification' ? 'select_road_type' : 'select_preset';
          fixes.push(new ValidationFix({
            icon: 'rapid-icon-search',
            title: l10n.t(`issues.fix.${selectFixType}.title`),
            onClick: function() {
              context.systems.ui.sidebar.showPresetList();
            }
          }));

          const id = this.entityIds[0];
          const operation = operationDelete(context, [id]);
          const disabledReasonID = operation.disabled();
          let deleteOnClick;
          if (!disabledReasonID) {
            deleteOnClick = function() {
              const id = this.issue.entityIds[0];
              const operation = operationDelete(context, [id]);
              if (!operation.disabled()) {
                operation();
              }
            };
          }

          fixes.push(
            new ValidationFix({
              icon: 'rapid-operation-delete',
              title: l10n.t('issues.fix.delete_feature.title'),
              disabledReason: disabledReasonID ? l10n.t(`operations.delete.${disabledReasonID}.single`) : undefined,
              onClick: deleteOnClick
            })
          );

          return fixes;
        }
    })];

    function showReference(selection) {
      selection.selectAll('.issue-reference')
        .data([0])
        .enter()
        .append('div')
        .attr('class', 'issue-reference')
        .text(l10n.t(`issues.${referenceID}.reference`));
    }
  };

  validation.type = type;

  return validation;
}
