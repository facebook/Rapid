//import { actionChangeTags } from '../actions/change_tags.js';
import { actionOrthogonalize } from '../actions/orthogonalize.js';
import { geoOrthoCanOrthogonalize } from '../geo/ortho.js';
import { ValidationIssue, ValidationFix } from '../core/lib/index.js';


export function validationUnsquareWay(context) {
  const type = 'unsquare_way';
  const editor = context.systems.editor;
  const l10n = context.systems.l10n;
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

    // Bail out if map not fully loaded here - we won't know all the node's parentWays.
    // Don't worry, as more map tiles are loaded, we'll have additional chances to validate it.
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
    const storage = context.systems.storage;
    const storedDegreeThreshold = storage.getItem('validate-square-degrees');
    const degreeThreshold = isNaN(storedDegreeThreshold) ? DEFAULT_DEG_THRESHOLD : parseFloat(storedDegreeThreshold);

    const points = nodes.map(node => context.viewport.project(node.loc));
    if (!geoOrthoCanOrthogonalize(points, isClosed, epsilon, degreeThreshold, true)) return [];

    let autoArgs;
    // don't allow autosquaring features linked to wikidata
    if (!entity.tags.wikidata) {
      // important to use the same `degreeThreshold` as for detection:
      const action = actionOrthogonalize(entity.id, context.viewport, undefined, degreeThreshold);
      const annotation = l10n.t('operations.orthogonalize.annotation.feature', { n: 1 });
      autoArgs = [ action, annotation ];
    }

    return [new ValidationIssue(context, {
      type: type,
      subtype: 'building',
      severity: 'warning',
      message: function() {
        const graph = editor.staging.graph;
        const entity = graph.hasEntity(this.entityIds[0]);
        return entity ? l10n.t('issues.unsquare_way.message', {
          feature: l10n.displayLabel(entity, graph)
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
            onClick: function() {
              const entityID = this.issue.entityIds[0];
              // important to use the same `degreeThreshold` as for detection:
              const action = actionOrthogonalize(entityID, context.viewport, undefined, degreeThreshold);
              const annotation = l10n.t('operations.orthogonalize.annotation.feature', { n: 1 });

              editor
                .performAsync(action)
                .then(() => editor.commit({ annotation: annotation, selectedIDs: [entityID] }));
            }
          }),
/*
          new ValidationFix({     // Tag as unnsquare
            title: l10n.t('issues.fix.tag_as_unsquare.title'),
            onClick: function() {
              const graph = editor.staging.graph;
              const entityID = this.issue.entityIds[0];
              const entity = graph.entity(entityID);
              const tags = Object.assign({}, entity.tags);  // shallow copy
              tags.nonsquare = 'yes';
              editor.perform(actionChangeTags(entityID, tags));
              editor.commit({
                annotation: l10n.t('issues.fix.tag_as_unsquare.annotation'),
                selectedIDs: [entityID]
              });
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
        .text(l10n.t('issues.unsquare_way.buildings.reference'));
    }
  };

  validation.type = type;

  return validation;
}
