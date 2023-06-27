//import { actionChangeTags } from '../actions/change_tags';
import { actionOrthogonalize } from '../actions/orthogonalize';
import { geoOrthoCanOrthogonalize } from '../geo/ortho';
import { ValidationIssue, ValidationFix } from '../core/lib';


export function validationUnsquareWay(context) {
  const type = 'unsquare_way';
  const l10n = context.localizationSystem();
  const DEFAULT_DEG_THRESHOLD = 5;   // see also issues.js

  // use looser epsilon for detection to reduce warnings of buildings that are essentially square already
  const epsilon = 0.05;
  const nodeThreshold = 10;

  function isBuilding(entity, graph) {
    if (entity.type !== 'way' || entity.geometry(graph) !== 'area') return false;
    return entity.tags.building && entity.tags.building !== 'no';
  }


  let validation = function checkUnsquareWay(entity, graph) {
    if (!isBuilding(entity, graph)) return [];

    // don't flag ways marked as physically unsquare
    if (entity.tags.nonsquare === 'yes') return [];

    const isClosed = entity.isClosed();
    if (!isClosed) return [];        // this building has bigger problems

    // don't flag ways with lots of nodes since they are likely detail-mapped
    const nodes = graph.childNodes(entity).slice();    // shallow copy
    if (nodes.length > nodeThreshold + 1) return [];   // +1 because closing node appears twice

    // ignore if not all nodes are fully downloaded
    const osm = context.services.osm;
    if (!osm || nodes.some(node => !osm.isDataLoaded(node.loc))) return [];

    // don't flag connected ways to avoid unresolvable unsquare loops
    const hasConnectedSquarableWays = nodes.some(node => {
      return graph.parentWays(node).some(parentWay => {
        if (parentWay.id === entity.id) return false;
        if (isBuilding(parentWay, graph)) return true;

        return graph.parentRelations(parentWay).some(parentRelation => {
          return parentRelation.isMultipolygon() &&
            parentRelation.tags.building &&
            parentRelation.tags.building !== 'no';
        });
      });
    });
    if (hasConnectedSquarableWays) return [];


    // user-configurable square threshold
    const storageSystem = context.storageSystem();
    const storedDegreeThreshold = storageSystem.getItem('validate-square-degrees');
    const degreeThreshold = isNaN(storedDegreeThreshold) ? DEFAULT_DEG_THRESHOLD : parseFloat(storedDegreeThreshold);

    const points = nodes.map(node => context.projection.project(node.loc));
    if (!geoOrthoCanOrthogonalize(points, isClosed, epsilon, degreeThreshold, true)) return [];

    let autoArgs;
    // don't allow autosquaring features linked to wikidata
    if (!entity.tags.wikidata) {
      // use same degree threshold as for detection
      let autoAction = actionOrthogonalize(entity.id, context.projection, undefined, degreeThreshold);
      autoAction.transitionable = false;  // when autofixing, do it instantly
      autoArgs = [autoAction, l10n.t('operations.orthogonalize.annotation.feature', { n: 1 })];
    }

    return [new ValidationIssue(context, {
      type: type,
      subtype: 'building',
      severity: 'warning',
      message: function() {
        const entity = context.hasEntity(this.entityIds[0]);
        return entity ? l10n.tHtml('issues.unsquare_way.message', {
          feature: l10n.displayLabel(entity, context.graph())
        }) : '';
      },
      reference: showReference,
      entityIds: [entity.id],
      hash: degreeThreshold,
      autoArgs: autoArgs,
      dynamicFixes: function() {
        return [
          new ValidationFix({
            icon: 'rapid-operation-orthogonalize',
            title: l10n.t('issues.fix.square_feature.title'),
//          autoArgs: autoArgs,
            onClick: function(context, completionHandler) {
              const entityID = this.issue.entityIds[0];
              // use same degree threshold as for detection
              context.perform(
                actionOrthogonalize(entityID, context.projection, undefined, degreeThreshold),
                l10n.t('operations.orthogonalize.annotation.feature', { n: 1 })
              );
              // run after the squaring transition (currently 150ms)
              window.setTimeout(function() { completionHandler(); }, 175);
            }
          }),
/*
          new ValidationFix({     // Tag as unnsquare
            title: l10n.tHtml('issues.fix.tag_as_unsquare.title'),
            onClick: function() {
              const entityID = this.issue.entityIds[0];
              const entity = context.entity(entityID);
              const tags = Object.assign({}, entity.tags);  // shallow copy
              tags.nonsquare = 'yes';
              context.perform(
                actionChangeTags(entityID, tags),
                l10n.t('issues.fix.tag_as_unsquare.annotation')
              );
            }
          })
*/
        ];
      }
    })];

    function showReference(selection) {
      selection.selectAll('.issue-reference')
        .data([0])
        .enter()
        .append('div')
        .attr('class', 'issue-reference')
        .html(l10n.tHtml('issues.unsquare_way.buildings.reference'));
    }
  };

  validation.type = type;

  return validation;
}
