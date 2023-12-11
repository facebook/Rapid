import { dispatch as d3_dispatch } from 'd3-dispatch';
import { utilArrayIdentical, utilCleanTags } from '@rapid-sdk/util';
import deepEqual from 'fast-deep-equal';

import { actionChangeTags } from '../actions/change_tags';
import { uiIcon } from './icon';
import { utilRebind } from '../util';

import { uiSectionEntityIssues } from './sections/entity_issues';
import { uiSectionFeatureType } from './sections/feature_type';
import { uiSectionPresetFields } from './sections/preset_fields';
import { uiSectionRawMemberEditor } from './sections/raw_member_editor';
import { uiSectionRawMembershipEditor } from './sections/raw_membership_editor';
import { uiSectionRawTagEditor } from './sections/raw_tag_editor';
import { uiSectionSelectionList } from './sections/selection_list';


let _wasSelectedIDs = [];

export function uiEntityEditor(context) {
  const editor = context.systems.editor;
  const l10n = context.systems.l10n;
  const presets = context.systems.presets;
  const dispatch = d3_dispatch('choose');

  const sections = [
    uiSectionSelectionList(context),
    uiSectionFeatureType(context).on('choose', function(selected) { dispatch.call('choose', this, selected); }),
    uiSectionEntityIssues(context),
    uiSectionPresetFields(context).on('change', _changeTags).on('revert', _revertTags),
    uiSectionRawTagEditor(context, 'raw-tag-editor').on('change', _changeTags),
    uiSectionRawMemberEditor(context),
    uiSectionRawMembershipEditor(context)
  ];

  let _selection = null;
  let _state = 'select';
  let _modified = false;
  let _startGraph;
  let _entityIDs = [];
  let _selectedPresets = [];
  let _newFeature;

  // reset listener
  editor.off('stagingchange', _onStagingChange);
  editor.on('stagingchange', _onStagingChange);


  /**
   * entityEditor
   * (This is the render function)
   */
  function entityEditor(selection) {
    _selection = selection;

    const combinedTags = _getCombinedTags(_entityIDs, editor.staging.graph);
    const isRTL = l10n.isRTL();

    // Header
    let header = selection.selectAll('.header')
      .data([0]);

    // Enter
    const headerEnter = header.enter()
      .append('div')
      .attr('class', 'header fillL');

    headerEnter
      .append('button')
      .attr('class', 'preset-reset preset-choose')
      .call(uiIcon(isRTL ? '#rapid-icon-forward' : '#rapid-icon-backward'));

    headerEnter
      .append('button')
      .attr('class', 'close')
      .on('click', () => context.enter('browse'))
      .call(uiIcon(_modified ? '#rapid-icon-apply' : '#rapid-icon-close'));

    headerEnter
      .append('h3');

    // Update
    header = header
      .merge(headerEnter);

    header.selectAll('h3')
      .html(_entityIDs.length === 1 ? l10n.tHtml('inspector.edit') : l10n.tHtml('rapid_multiselect'));

    header.selectAll('.preset-reset')
      .on('click', function() { dispatch.call('choose', this, _selectedPresets); });

    // Body
    let body = selection.selectAll('.inspector-body')
      .data([0]);

    // Enter
    const bodyEnter = body.enter()
      .append('div')
      .attr('class', 'entity-editor inspector-body');

    // Update
    body = body
      .merge(bodyEnter);

    for (const section of sections) {
      if (section.entityIDs)  section.entityIDs(_entityIDs);
      if (section.presets)    section.presets(_selectedPresets);
      if (section.tags)       section.tags(combinedTags);
      if (section.state)      section.state(_state);

      body.call(section.render);
    }
  }


  /**
   *
   */
  entityEditor.modified = function(val) {
    if (!arguments.length) return _modified;
    _modified = val;
    return entityEditor;
  };


  /**
   *
   */
  entityEditor.state = function(val) {
    if (!arguments.length) return _state;
    _state = val;
    return entityEditor;
  };


  /**
   *
   */
  entityEditor.entityIDs = function(val) {
    if (!arguments.length) return _entityIDs;

    // always reload these even if the entityIDs are unchanged, since we
    // could be reselecting after something like dragging a node
    _startGraph = editor.staging.graph;

    if (val && _entityIDs && utilArrayIdentical(_entityIDs, val)) return entityEditor;  // exit early if no change

    _entityIDs = val;

    _loadActivePresets(true);

    return entityEditor.modified(false);
  };


  /**
   *
   */
  entityEditor.newFeature = function(val) {
    if (!arguments.length) return _newFeature;
    _newFeature = val;
    return entityEditor;
  };


  /**
   *
   */
  entityEditor.presets = function(val) {
    if (!arguments.length) return _selectedPresets;

    // don't reload the same preset
    if (!utilArrayIdentical(val, _selectedPresets)) {
      _selectedPresets = val;
    }
    return entityEditor;
  };


  /**
   *
   */
  function _onStagingChange(difference) {
    if (!_selection) return;     // called before first render
    if (_selection.selectAll('.entity-editor').empty()) return;
    if (_state === 'hide') return;

    const significant = difference.didChange.properties || difference.didChange.addition || difference.didChange.deletion;
    if (!significant) return;

    const graph = editor.staging.graph;
    _entityIDs = _entityIDs.filter(entityID => graph.hasEntity(entityID));
    if (!_entityIDs.length) return;

    const prevPreset = _selectedPresets.length === 1 && _selectedPresets[0];
    _loadActivePresets();
    const currPreset = _selectedPresets.length === 1 && _selectedPresets[0];

    entityEditor.modified(_startGraph !== graph);
    _selection.call(entityEditor);  // rerender

    // If this difference caused the preset to change, flash the button.
    if (prevPreset !== currPreset) {
      context.container().selectAll('.entity-editor button.preset-reset .label')
        .style('background-color', '#fff')
        .transition()
        .duration(750)
        .style('background-color', null);
    }
  }


  /**
   * Tag changes that fire on input can all get coalesced into a single
   * history operation when the user leaves the field.  iD#2342
   * Use explicit entityIDs in case the selection changes before the event is fired.
   */
  function _changeTags(entityIDs, changed, onInput) {
    // same selection as before?
    const isSameSelection = utilArrayIdentical(_entityIDs, _wasSelectedIDs);
    _wasSelectedIDs = _entityIDs.slice();  // copy

    editor.beginTransaction();

    for (const entityID of _entityIDs) {
      const graph = editor.staging.graph;
      const entity = graph.hasEntity(entityID);
      if (!entity) continue;

      let tags = Object.assign({}, entity.tags);   // shallow copy

      for (const [k, v] of Object.entries(changed)) {
        if (!k) continue;

        // No op for source=digitalglobe or source=maxar on ML roads. TODO: switch to check on __fbid__
        const source = entity.tags.source;
        if (entity.__fbid__ && k === 'source' && (source === 'digitalglobe' || source === 'maxar')) continue;

        if (v !== undefined || tags.hasOwnProperty(k)) {
          tags[k] = v;
        }
      }

      if (!onInput) {
        tags = utilCleanTags(tags);
      }

      if (!deepEqual(entity.tags, tags)) {
        editor.perform(actionChangeTags(entityID, tags));
      }
    }

    // Only commit changes when leaving the field (i.e. on blur event)
    if (!onInput) {
      // If this is the same selection as before, and the previous edit was also a change_tags,
      // we can just replace the previous edit with this one.
      const annotation = l10n.t('operations.change_tags.annotation');
      const options = {
        annotation: annotation,
        selectedIDs: _entityIDs
      };
      if (isSameSelection && editor.getUndoAnnotation() === annotation) {
        editor.commitAppend(options);
      } else {
        editor.commit(options);
      }
    }

    editor.endTransaction();
  }


  /**
   *
   */
  function _revertTags(keys) {
    // same selection as before?
    const isSameSelection = utilArrayIdentical(_entityIDs, _wasSelectedIDs);
    _wasSelectedIDs = _entityIDs.slice();  // copy

    const baseGraph = editor.base.graph;
    editor.beginTransaction();

    for (const entityID of _entityIDs) {
      const currGraph = editor.staging.graph;
      const original = baseGraph.hasEntity(entityID);
      const current = currGraph.entity(entityID);
      let tags = Object.assign({}, current.tags);   // shallow copy

      let changed = {};
      for (const key of keys) {
        changed[key] = original?.tags[key] ?? undefined;
      }

      for (const [k, v] of Object.entries(changed)) {
        if (!k) continue;
        if (v !== undefined || tags.hasOwnProperty(k)) {
          tags[k] = v;
        }
      }

      tags = utilCleanTags(tags);

      if (!deepEqual(current.tags, tags)) {
        editor.perform(actionChangeTags(entityID, tags));
      }
    }

    // If this is the same selection as before, and the previous edit was also a change_tags,
    // we can just replace the previous edit with this one.
    const annotation = l10n.t('operations.change_tags.annotation');
    const options = {
      annotation: annotation,
      selectedIDs: _entityIDs
    };
    if (isSameSelection && editor.getUndoAnnotation() === annotation) {
      editor.commitAppend(options);
    } else {
      editor.commit(options);
    }

    editor.endTransaction();
  }


  /**
   *
   */
  function _loadActivePresets(isForNewSelection) {
    const graph = editor.staging.graph;

    // If multiple entities, try to pick a preset that matches most of them
    const counts = {};
    for (const entityID of _entityIDs) {
      const entity = graph.hasEntity(entityID);
      if (!entity) return;

      const preset = presets.match(entity, graph);
      counts[preset.id] = (counts[preset.id] || 0) + 1;
    }

    const matches = Object.keys(counts)
      .sort((p1, p2) => counts[p2] - counts[p1])
      .map(presetID => presets.item(presetID));

    if (!isForNewSelection) {
      // A "weak" preset doesn't set any tags. (e.g. "Address")
      const isWeakPreset = _selectedPresets.length === 1 &&
        !_selectedPresets[0].isFallback() &&
        Object.keys(_selectedPresets[0].addTags || {}).length === 0;

      // Don't replace a weak preset with a fallback preset (e.g. "Point")
      if (isWeakPreset && matches.length === 1 && matches[0].isFallback()) return;
    }

    entityEditor.presets(matches);
  }


  // Returns a single object containing the tags of all the given entities.
  // Example:
  // {
  //   highway: 'service',
  //   service: 'parking_aisle'
  // }
  //           +
  // {
  //   highway: 'service',
  //   service: 'driveway',
  //   width: '3'
  // }
  //           =
  // {
  //   highway: 'service',
  //   service: [ 'driveway', 'parking_aisle' ],
  //   width: [ '3', undefined ]
  // }
  function _getCombinedTags(entityIDs, graph) {
    const combined = {};
    const tagCounts = {};

    const entities = entityIDs.map(entityID => graph.hasEntity(entityID)).filter(Boolean);

    // gather the keys
    const allKeys = new Set();
    for (const entity of entities) {
      for (const k of Object.keys(entity.tags)) {
        if (k) {
          allKeys.add(k);
        }
      }
    }

    // gather the values
    for (const entity of entities) {
      for (const k of allKeys) {
        const v = entity.tags[k];  // purposely allow `undefined`
        const vals = combined[k];

        if (!vals) {    // first value found, just save the value
          combined[k] = v;
        } else {
          if (!Array.isArray(vals)) {
            if (vals !== v) {         // additional value found, convert to Array of values
              combined[k] = [vals, v];
            }
          } else {
            if (!vals.includes(v)) {  // additional value found, append to Array of values
              vals.push(v);
            }
          }
        }

        const kv = `${k}=${v}`;
        tagCounts[kv] = (tagCounts[kv] ?? 0) + 1;
      }
    }

    // sort the Array-like values
    for (const [k, vals] of Object.entries(combined)) {
      if (!Array.isArray(vals)) continue;

      // sort in place, by frequency then alphabetically
      vals.sort((val1, val2) => {
        const count1 = tagCounts[`${k}=${val1}`] ?? 0;
        const count2 = tagCounts[`${k}=${val2}`] ?? 0;
        if (count2 !== count1) {
          return count2 - count1;
        }
        if (val2 && val1) {
          return val1.localeCompare(val2);
        }
        return val1 ? 1 : -1;
      });
    }

    return combined;
  }


  return utilRebind(entityEditor, dispatch, 'on');
}
