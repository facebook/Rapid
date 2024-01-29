import { actionChangeTags } from '../actions/change_tags.js';
import { KeyOperationBehavior } from '../behaviors/KeyOperationBehavior.js';
import { uiCmd } from '../ui/cmd.js';


export function operationDowngrade(context, selectedIDs) {
  const editor = context.systems.editor;
  const l10n = context.systems.l10n;
  const presets = context.systems.presets;

  let _affectedFeatureCount = 0;
  let _downgradeType = downgradeTypeForEntityIDs(selectedIDs);
  const multi = _affectedFeatureCount === 1 ? 'single' : 'multiple';


  function downgradeTypeForEntityIDs(entityIDs) {
    let downgradeType;
    _affectedFeatureCount = 0;

    for (const entityID of entityIDs) {
      let type = downgradeTypeForEntityID(entityID);
      if (type) {
        _affectedFeatureCount += 1;
        if (downgradeType && type !== downgradeType) {
          if (downgradeType !== 'generic' && type !== 'generic') {
            downgradeType = 'building_address';
          } else {
            downgradeType = 'generic';
          }
        } else {
          downgradeType = type;
        }
      }
    }
    return downgradeType;
  }


  function downgradeTypeForEntityID(entityID) {
    const graph = editor.staging.graph;
    const entity = graph.entity(entityID);
    const preset = presets.match(entity, graph);

    if (!preset || preset.isFallback()) return null;

    if (
      entity.type === 'node' && preset.id !== 'address' &&
      Object.keys(entity.tags).some(function(key) { return key.match(/^addr:.{1,}/); })
    ) {
      return 'address';
    }

    const geometry = entity.geometry(graph);
    if (geometry === 'area' && entity.tags.building && !preset.tags.building) {
      return 'building';
    } else if (geometry === 'vertex' && Object.keys(entity.tags).length) {
      return 'generic';
    }

    return null;
  }


  const buildingKeysToRetain = /architect|building|height|layer|nycdoitt:bin|source|type|wheelchair|roof/i;
  let addressKeysToKeep = ['source'];

  let operation = function() {

    const combinedAction = (graph) => {
      for (const entityID of selectedIDs) {
        const type = downgradeTypeForEntityID(entityID);
        if (!type) continue;

        const tags = Object.assign({}, graph.entity(entityID).tags);  // shallow copy
        for (let key in tags) {
          if (type === 'address' && addressKeysToKeep.indexOf(key) !== -1) continue;
          if (type === 'building' && buildingKeysToRetain.test(key)) continue;
          if (type !== 'generic') {
            if (key.match(/^addr:.{1,}/) || key.match(/^source:.{1,}/)) continue;
          }
          delete tags[key];
        }
        graph = actionChangeTags(entityID, tags)(graph);
      }
      return graph;
    };

    const annotation = operation.annotation();
    editor.perform(combinedAction);
    editor.commit({ annotation: annotation, selectedIDs: selectedIDs });

    // refresh the select mode to enable the delete operation
    context.enter('select-osm', { selection: { osm: selectedIDs }} );
  };


  operation.available = function() {
    return _downgradeType;
  };


  operation.disabled = function() {
    const graph = editor.staging.graph;

    if (selectedIDs.some(hasWikidataTag)) {
      return 'has_wikidata_tag';
    }
    return false;

    function hasWikidataTag(id) {
      const entity = graph.entity(id);
      return entity.tags.wikidata && entity.tags.wikidata.trim().length > 0;
    }
  };


  operation.tooltip = function () {
    const disabledReason = operation.disabled();
    return disabledReason ?
      l10n.t(`operations.downgrade.${disabledReason}.${multi}`) :
      l10n.t(`operations.downgrade.description.${_downgradeType}`);
  };


  operation.annotation = function () {
    let suffix;
    if (_downgradeType === 'building_address') {
      suffix = 'generic';
    } else {
      suffix = _downgradeType;
    }
    return l10n.t(`operations.downgrade.annotation.${suffix}`, { n: _affectedFeatureCount});
  };


  operation.id = 'downgrade';
  operation.keys = [ uiCmd('⌫') ];
  operation.title = l10n.t('operations.downgrade.title');
  operation.behavior = new KeyOperationBehavior(context, operation);

  return operation;
}
