import { actionChangeTags } from '../actions/change_tags';
import { BehaviorKeyOperation } from '../behaviors/BehaviorKeyOperation';
import { modeSelect } from '../modes/select';
import { t } from '../core/localizer';
import { uiCmd } from '../ui/cmd';
import { presetManager } from '../presets';


export function operationDowngrade(context, selectedIDs) {
  let _affectedFeatureCount = 0;
  let _downgradeType = downgradeTypeForEntityIDs(selectedIDs);
  const multi = _affectedFeatureCount === 1 ? 'single' : 'multiple';


  function downgradeTypeForEntityIDs(entityIDs) {
    let downgradeType;
    _affectedFeatureCount = 0;

    for (let i in entityIDs) {
      let entityID = entityIDs[i];
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
    const graph = context.graph();
    const entity = graph.entity(entityID);
    const preset = presetManager.match(entity, graph);

    if (!preset || preset.isFallback()) return null;

    if (
      entity.type === 'node' && preset.id !== 'address' &&
      Object.keys(entity.tags).some(function(key) { return key.match(/^addr:.{1,}/); })
    ) {
      return 'address';
    }

    let geometry = entity.geometry(graph);
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
    context.perform(function(graph) {
      for (let i in selectedIDs) {
        let entityID = selectedIDs[i];
        let type = downgradeTypeForEntityID(entityID);
        if (!type) continue;

        let tags = Object.assign({}, graph.entity(entityID).tags);  // shallow copy
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
    }, operation.annotation());

    context.validator().validate();

    // refresh the select mode to enable the delete operation
    context.enter(modeSelect(context, selectedIDs));
  };


  operation.available = function() {
    return _downgradeType;
  };


  operation.disabled = function() {
    if (selectedIDs.some(hasWikidataTag)) {
      return 'has_wikidata_tag';
    }
    return false;

    function hasWikidataTag(id) {
      const entity = context.entity(id);
      return entity.tags.wikidata && entity.tags.wikidata.trim().length > 0;
    }
  };


  operation.tooltip = function () {
    const disabledReason = operation.disabled();
    return disabledReason ?
      t(`operations.downgrade.${disabledReason}.${multi}`) :
      t(`operations.downgrade.description.${_downgradeType}`);
  };


  operation.annotation = function () {
    let suffix;
    if (_downgradeType === 'building_address') {
      suffix = 'generic';
    } else {
      suffix = _downgradeType;
    }
    return t(`operations.downgrade.annotation.${suffix}`, { n: _affectedFeatureCount});
  };


  operation.id = 'downgrade';
  operation.keys = [ uiCmd('⌫') ];
  operation.title = t('operations.downgrade.title');
  operation.behavior = new BehaviorKeyOperation(context, operation);

  return operation;
}
